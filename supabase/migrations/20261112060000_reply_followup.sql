BEGIN;

ALTER TABLE private.reply_drafts ADD COLUMN followup_on date, ADD COLUMN followup_key uuid UNIQUE,
  ADD CONSTRAINT reply_followup_schedule CHECK ((followup_on IS NULL) = (followup_key IS NULL));
ALTER TABLE private.mail_send_operations ADD COLUMN reply_followup_draft uuid
  REFERENCES private.reply_drafts(id) ON DELETE SET NULL;
CREATE INDEX mail_send_reply_followup ON private.mail_send_operations(reply_followup_draft)
  WHERE reply_followup_draft IS NOT NULL;

-- Only the isolated database fixture replaces this clock. HTTP callers cannot set it.
CREATE FUNCTION private.reply_followup_today() RETURNS date
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
$$;

CREATE FUNCTION private.reply_followup_match(d private.reply_drafts, original uuid)
RETURNS TABLE (id uuid, body_text text) LANGUAGE sql STABLE SET search_path='' AS $$
  WITH sent AS (
    SELECT '<'||original::text||'@inboxai.invalid>' AS message_id
    UNION ALL
    SELECT '<'||op.id::text||'@inboxai.invalid>'
    FROM private.mail_send_operations op
    WHERE op.reply_followup_draft=d.id AND op.user_id=d.user_id AND op.account_id=d.account_id
      AND op.state<>'rejected'
  )
  SELECT e.id,left(e.body_text,240)
  FROM public.emails e
  WHERE e.user_id=d.user_id AND e.source_account_id=d.account_id AND e.direction='inbound'
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
    AND EXISTS (SELECT 1 FROM sent s WHERE e.in_reply_to=s.message_id OR e.reply_references @> ARRAY[s.message_id])
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text((d.approved->'to') || (d.approved->'cc')) recipient(address)
      WHERE lower(recipient.address)=lower(e.from_address)
    )
  ORDER BY e.received_at DESC NULLS LAST,e.id DESC LIMIT 1
$$;

CREATE FUNCTION public.schedule_reply_followup(p_id uuid,p_on date,p_expected uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.reply_drafts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT * INTO d FROM private.reply_drafts WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.mail_send_operations WHERE user_id=actor AND account_id=d.account_id
    AND request_key=d.request_key AND state='accepted') THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_on IS NULL OR p_on > DATE '9999-12-31' OR p_on < private.reply_followup_today() THEN RAISE SQLSTATE '22023'; END IF;
  IF d.followup_on=p_on THEN RETURN private.reply_draft_view(d); END IF;
  IF d.followup_key IS DISTINCT FROM p_expected OR EXISTS (
    SELECT 1 FROM private.mail_send_operations WHERE user_id=actor AND account_id=d.account_id
      AND request_key=d.followup_key AND state IN ('dispatching','unknown')
  ) THEN RAISE SQLSTATE 'PT409'; END IF;

  UPDATE private.reply_drafts SET tracking_at=COALESCE(tracking_at,clock_timestamp()),
    followup_on=p_on,followup_key=gen_random_uuid(),completed=true,updated_at=clock_timestamp()
    WHERE id=p_id RETURNING * INTO d;
  RETURN private.reply_draft_view(d);
END $$;

CREATE OR REPLACE FUNCTION public.change_reply_draft(p_id uuid,p_action text,p_fingerprint text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.reply_drafts; op private.mail_send_operations; source public.emails;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_action='edit' THEN
    SELECT e.* INTO source FROM public.emails e JOIN private.reply_drafts x ON x.source_id=e.id AND x.user_id=actor
      WHERE x.id=p_id AND e.user_id=actor AND e.source_account_id=x.account_id
        AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE FOR SHARE OF e;
    IF NOT FOUND OR private.reply_source_fingerprint(source) IS DISTINCT FROM p_fingerprint THEN RAISE SQLSTATE 'PT409'; END IF;
  END IF;
  SELECT * INTO d FROM private.reply_drafts WHERE user_id=actor AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  SELECT * INTO op FROM private.mail_send_operations WHERE user_id=actor AND account_id=d.account_id AND request_key=d.request_key;
  IF p_action='track' AND op.state='accepted' THEN
    UPDATE private.reply_drafts SET tracking_at=COALESCE(tracking_at,clock_timestamp()),completed=true,updated_at=clock_timestamp()
      WHERE id=p_id RETURNING * INTO d;
  ELSIF p_action='stop' AND d.tracking_at IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM private.mail_send_operations WHERE user_id=actor AND account_id=d.account_id
      AND request_key=d.followup_key AND state IN ('dispatching','unknown')) THEN RAISE SQLSTATE 'PT409'; END IF;
    UPDATE private.reply_drafts SET tracking_at=NULL,followup_on=NULL,followup_key=NULL,updated_at=clock_timestamp()
      WHERE id=p_id RETURNING * INTO d;
  ELSIF p_action='finish' AND op.state IN ('accepted','partial') THEN
    UPDATE private.reply_drafts SET completed=true,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
  ELSIF p_action='edit' AND NOT d.completed AND (op.id IS NULL OR op.state='rejected') THEN
    UPDATE private.reply_drafts SET request_key=NULL,request_hash=NULL,approved=NULL,fingerprint=p_fingerprint,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
  ELSIF p_action='discard' AND NOT d.completed AND d.request_key IS NULL THEN
    DELETE FROM private.reply_drafts WHERE id=p_id;
    RETURN '{"discarded":true}'::jsonb;
  ELSE RAISE SQLSTATE 'PT409';
  END IF;
  RETURN private.reply_draft_view(d);
END $$;

CREATE OR REPLACE FUNCTION public.list_reply_work(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); today date := private.reply_followup_today();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF cardinality(p_accounts)>50 THEN RAISE SQLSTATE '22023'; END IF;
  RETURN (
    WITH items AS (
      SELECT d.id,d.source_id,d.subject,d.updated_at,d.followup_on,d.followup_key,a.email_address,
        reminder.state AS reminder_state,r.id AS reply_id,r.body_text,
        CASE WHEN d.tracking_at IS NOT NULL AND r.id IS NOT NULL THEN 'reply'
          WHEN d.tracking_at IS NOT NULL AND d.followup_on<=today AND reminder.id IS NULL THEN 'due'
          WHEN d.tracking_at IS NOT NULL THEN 'waiting'
          WHEN op.state='accepted' THEN 'sent'
          WHEN d.request_key IS NULL THEN 'draft' ELSE 'sending' END AS status
      FROM private.reply_drafts d
      JOIN public.source_accounts a ON a.user_id=actor AND a.id=d.account_id
      JOIN public.emails source ON source.user_id=actor AND source.id=d.source_id
        AND NOT source.provider_deleted AND source.is_deleted IS NOT TRUE
      LEFT JOIN private.mail_send_operations op ON op.user_id=actor AND op.account_id=d.account_id AND op.request_key=d.request_key
      LEFT JOIN private.mail_send_operations reminder ON reminder.user_id=actor AND reminder.account_id=d.account_id
        AND reminder.request_key=d.followup_key
      LEFT JOIN LATERAL private.reply_followup_match(d,op.id) r ON d.tracking_at IS NOT NULL AND op.state='accepted'
      WHERE d.user_id=actor AND (NOT d.completed OR d.tracking_at IS NOT NULL)
        AND (COALESCE(cardinality(p_accounts),0)=0 OR d.account_id=ANY(p_accounts))
    ), ordered AS (
      SELECT *, CASE WHEN status='due' OR reminder_state IN ('unknown','dispatching') THEN 0
                     WHEN status='reply' THEN 1 ELSE 2 END AS priority
      FROM items ORDER BY priority,followup_on NULLS LAST,updated_at DESC,id DESC LIMIT 20
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'subject',subject,'account',email_address,
      'status',status,'replyId',reply_id,'quote',body_text,'followupOn',followup_on,'followupKey',followup_key,
      'reminderState',reminder_state)
      ORDER BY priority,followup_on NULLS LAST,updated_at DESC,id DESC),'[]'::jsonb) FROM ordered
  );
END $$;

CREATE FUNCTION private.reply_followup_preview(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('key',d.followup_key,'followupOn',d.followup_on,'sourceId',sent.id,
    'from',jsonb_build_object('address',a.email_address,'name',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1))),
    'accountId',d.account_id,'to',d.approved->'to','cc',d.approved->'cc','bcc','[]'::jsonb,
    'subject',d.approved->>'subject','text', E'Chào anh/chị,

Anh/chị có thể phản hồi về nội dung trong thư trước giúp tôi được không?

Cảm ơn anh/chị.',
    'inReplyTo',sent.message_id)
  FROM private.reply_drafts d
  JOIN public.source_accounts a ON a.id=d.account_id AND a.user_id=d.user_id AND a.is_active
  JOIN private.mail_send_operations original ON original.user_id=d.user_id AND original.account_id=d.account_id
    AND original.request_key=d.request_key AND original.state='accepted'
  JOIN LATERAL (
    SELECT e.id,e.message_id FROM public.emails e WHERE e.user_id=d.user_id AND e.source_account_id=d.account_id
      AND e.direction='outbound' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND e.message_id='<'||original.id::text||'@inboxai.invalid>'
    ORDER BY e.id LIMIT 1
  ) sent ON true
  WHERE d.id=p_id AND d.user_id=p_actor AND d.tracking_at IS NOT NULL AND d.followup_on<=private.reply_followup_today()
    AND NOT EXISTS (SELECT 1 FROM private.reply_followup_match(d,original.id))
    AND NOT EXISTS (SELECT 1 FROM private.mail_send_operations reminder
      WHERE reminder.user_id=d.user_id AND reminder.account_id=d.account_id AND reminder.request_key=d.followup_key)
$$;

CREATE FUNCTION public.read_reply_followup_preview(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); preview jsonb;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.reply_drafts WHERE user_id=actor AND id=p_id) THEN RAISE SQLSTATE 'PT404'; END IF;
  preview := private.reply_followup_preview(actor,p_id);
  IF preview IS NULL THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN preview || jsonb_build_object('proof',encode(sha256(convert_to(preview::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.read_reply_followup_receipt(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('accountId',op.account_id,'key',op.request_key,'hash',op.request_hash)
  FROM private.reply_drafts d
  JOIN private.mail_send_operations op ON op.user_id=d.user_id AND op.account_id=d.account_id
    AND op.request_key=d.followup_key AND op.reply_followup_draft=d.id
  WHERE d.user_id=auth.uid() AND d.id=p_id
$$;

CREATE FUNCTION public.begin_reply_followup(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE preview jsonb; receipt jsonb;
BEGIN
  -- Sync holds the same account lock while writing incoming mail and its headers.
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  PERFORM 1 FROM private.reply_drafts WHERE user_id=p_user_id AND account_id=p_account_id AND id=p_draft FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409'; END IF;
  preview := private.reply_followup_preview(p_user_id,p_draft);
  IF preview IS NULL OR preview->>'key' IS DISTINCT FROM p_key::text
    OR encode(sha256(convert_to(preview::text,'UTF8')),'hex') IS DISTINCT FROM p_hash
    OR p_payload IS DISTINCT FROM (preview - ARRAY['key','followupOn','accountId','sourceId'])
  THEN RAISE SQLSTATE 'PT409'; END IF;

  receipt := public.begin_mail_send(p_user_id,p_account_id,p_key,p_hash,p_payload);
  IF (receipt->>'claimed')::boolean THEN
    UPDATE private.mail_send_operations SET reply_followup_draft=p_draft
      WHERE id=(receipt->>'id')::uuid AND user_id=p_user_id AND account_id=p_account_id;
  END IF;
  RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION private.reply_followup_today(),private.reply_followup_match(private.reply_drafts,uuid),
  private.reply_followup_preview(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.schedule_reply_followup(uuid,date,uuid),public.read_reply_followup_preview(uuid),
  public.read_reply_followup_receipt(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.schedule_reply_followup(uuid,date,uuid),public.read_reply_followup_preview(uuid),
  public.read_reply_followup_receipt(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.begin_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;

COMMIT;
