BEGIN;

CREATE TABLE private.scheduled_mail (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  compose_id uuid REFERENCES private.file_compose_drafts(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES private.reply_drafts(id) ON DELETE CASCADE,
  source_id uuid,
  request_key uuid NOT NULL,
  request_hash text NOT NULL,
  subject text NOT NULL,
  recipients jsonb NOT NULL,
  cc jsonb NOT NULL,
  original_at timestamptz NOT NULL,
  send_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  canceled boolean NOT NULL DEFAULT false,
  failed boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz,
  lease uuid,
  lease_until timestamptz,
  FOREIGN KEY (account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE,
  UNIQUE (user_id,request_key),
  CHECK (num_nonnulls(compose_id,reply_id)=1)
);
CREATE INDEX scheduled_mail_due ON private.scheduled_mail(send_at)
  WHERE NOT canceled AND NOT failed AND attempts<8;
CREATE INDEX scheduled_mail_owner ON private.scheduled_mail(user_id,send_at DESC);
ALTER TABLE private.scheduled_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.scheduled_mail FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.scheduled_mail_now() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$ SELECT statement_timestamp() $$;

CREATE FUNCTION public.create_scheduled_mail(p_actor uuid,p_kind text,p_id uuid,p_revision integer,
  p_at timestamptz,p_schedule uuid,p_input jsonb,p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.file_compose_drafts; r private.reply_drafts; q private.scheduled_mail;
  account uuid; draft_key uuid;
BEGIN
  IF p_kind='compose' THEN
    SELECT * INTO c FROM private.file_compose_drafts WHERE user_id=p_actor AND id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    account:=c.account_id; draft_key:=c.request_key;
  ELSIF p_kind='reply' THEN
    SELECT * INTO r FROM private.reply_drafts WHERE user_id=p_actor AND id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    account:=r.account_id; draft_key:=r.request_key;
  ELSE
    RAISE SQLSTATE '22023';
  END IF;
  SELECT * INTO q FROM private.scheduled_mail WHERE id=p_schedule;
  IF FOUND THEN
    IF q.user_id=p_actor AND COALESCE(q.compose_id,q.reply_id)=p_id
       AND q.request_key=draft_key AND q.original_at=p_at AND q.request_hash=p_hash
    THEN RETURN q.id; END IF;
    RAISE SQLSTATE 'PT409';
  END IF;
  IF draft_key IS NOT NULL THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_at IS NULL OR NOT isfinite(p_at) OR p_at<=private.scheduled_mail_now() THEN RAISE SQLSTATE 'PT422'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.source_accounts
    WHERE id=account AND user_id=p_actor AND auth_type='oauth_google' AND is_active)
  THEN RAISE SQLSTATE 'PT403'; END IF;
  IF p_kind='compose' THEN
    PERFORM public.prepare_file_compose(p_actor,p_id,p_revision,p_input,p_hash);
    SELECT request_key INTO draft_key FROM private.file_compose_drafts WHERE id=p_id AND user_id=p_actor;
  ELSE
    PERFORM public.prepare_reply_send(p_actor,p_id,p_revision,p_input,p_hash);
    SELECT request_key INTO draft_key FROM private.reply_drafts WHERE id=p_id AND user_id=p_actor;
  END IF;
  INSERT INTO private.scheduled_mail(id,user_id,account_id,compose_id,reply_id,source_id,request_key,
    request_hash,subject,recipients,cc,original_at,send_at)
  VALUES(p_schedule,p_actor,account,c.id,r.id,r.source_id,draft_key,p_hash,p_input->>'subject',
    p_input->'to',p_input->'cc',p_at,p_at);
  RETURN p_schedule;
END $$;

CREATE FUNCTION private.protect_scheduled_approval() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.request_key IS DISTINCT FROM OLD.request_key AND EXISTS (
    SELECT 1 FROM private.scheduled_mail WHERE user_id=OLD.user_id AND request_key=OLD.request_key AND NOT canceled
  ) THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_scheduled_compose BEFORE UPDATE OF request_key ON private.file_compose_drafts
FOR EACH ROW EXECUTE FUNCTION private.protect_scheduled_approval();
CREATE TRIGGER protect_scheduled_reply BEFORE UPDATE OF request_key ON private.reply_drafts
FOR EACH ROW EXECUTE FUNCTION private.protect_scheduled_approval();

-- Every send path reaches this guard, including the immediate compose and reply routes.
ALTER FUNCTION public.begin_mail_send(uuid,uuid,uuid,text,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.begin_mail_send(uuid,uuid,uuid,text,jsonb) FROM service_role;
CREATE FUNCTION public.begin_mail_send(p_user_id uuid,p_account_id uuid,p_request_key uuid,p_request_hash text,p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_payload IS NOT NULL AND EXISTS (
    SELECT 1 FROM private.scheduled_mail q WHERE q.user_id=p_user_id AND q.request_key=p_request_key
      AND (q.canceled OR q.failed OR q.send_at>private.scheduled_mail_now() OR q.lease_until IS NULL
        OR q.lease_until<=clock_timestamp() OR q.lease::text IS DISTINCT FROM current_setting('inboxai.scheduled_mail_lease',true))
  ) THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN private.begin_mail_send(p_user_id,p_account_id,p_request_key,p_request_hash,p_payload);
END $$;

CREATE FUNCTION public.begin_scheduled_mail_send(p_user_id uuid,p_account_id uuid,p_id uuid,p_lease uuid,
  p_key uuid,p_hash text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET inboxai.scheduled_mail_lease='' AS $$
DECLARE q private.scheduled_mail;
BEGIN
  SELECT * INTO q FROM private.scheduled_mail WHERE id=p_id AND user_id=p_user_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR q.request_key IS DISTINCT FROM p_key OR q.request_hash IS DISTINCT FROM p_hash
    OR q.lease IS DISTINCT FROM p_lease OR q.lease_until IS NULL OR q.lease_until<=clock_timestamp()
    OR q.canceled OR q.failed OR q.send_at>private.scheduled_mail_now()
  THEN RAISE SQLSTATE 'PT409'; END IF;
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id
    AND auth_type='oauth_google' AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  PERFORM set_config('inboxai.scheduled_mail_lease',p_lease::text,true);
  IF q.compose_id IS NOT NULL THEN
    RETURN public.begin_file_compose(p_user_id,p_account_id,q.compose_id,p_key,p_hash,p_payload);
  END IF;
  RETURN public.begin_reply_send(p_user_id,p_account_id,q.reply_id,p_key,p_hash,p_payload);
END $$;

CREATE FUNCTION public.claim_scheduled_mail() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  WITH due AS (
    SELECT q.id FROM private.scheduled_mail q
    LEFT JOIN private.mail_send_operations op ON op.user_id=q.user_id AND op.request_key=q.request_key
    WHERE NOT q.canceled AND NOT q.failed AND q.attempts<8
      AND q.send_at<=private.scheduled_mail_now()
      AND (q.retry_at IS NULL OR q.retry_at<=private.scheduled_mail_now())
      AND (q.lease_until IS NULL OR q.lease_until<=clock_timestamp())
      AND (op.id IS NULL OR op.state IN ('dispatching','unknown'))
    ORDER BY q.send_at,q.id LIMIT 3 FOR UPDATE OF q SKIP LOCKED
  ), leased AS (
    UPDATE private.scheduled_mail q SET lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',
      attempts=q.attempts+1 FROM due WHERE q.id=due.id RETURNING q.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'actor',q.user_id,'accountId',q.account_id,
    'key',q.request_key,'hash',q.request_hash,'lease',q.lease,'input',COALESCE(c.approved,r.approved))),'[]'::jsonb)
  FROM leased q LEFT JOIN private.file_compose_drafts c ON c.id=q.compose_id AND c.user_id=q.user_id
    LEFT JOIN private.reply_drafts r ON r.id=q.reply_id AND r.user_id=q.user_id
$$;

CREATE FUNCTION public.finish_scheduled_attempt(p_actor uuid,p_id uuid,p_lease uuid,p_permanent boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE private.scheduled_mail q SET lease=NULL,lease_until=NULL,
    retry_at=private.scheduled_mail_now()+interval '20 seconds',
    failed=(p_permanent OR q.attempts>=8) AND NOT EXISTS (
      SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=q.user_id AND op.request_key=q.request_key)
  WHERE q.id=p_id AND q.user_id=p_actor AND q.lease=p_lease
$$;

CREATE FUNCTION public.read_scheduled_receipt_scope(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('accountId',q.account_id,'key',q.request_key,'hash',q.request_hash)
  FROM private.scheduled_mail q JOIN private.mail_send_operations op
    ON op.user_id=q.user_id AND op.account_id=q.account_id AND op.request_key=q.request_key
  WHERE q.id=p_id AND q.user_id=p_actor AND NOT q.canceled
$$;

CREATE FUNCTION public.list_scheduled_mail() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(item ORDER BY rank,send_at DESC,id),'[]'::jsonb) FROM (
    SELECT q.id,q.send_at,
      CASE WHEN q.canceled OR op.state IN ('accepted','partial') THEN 1 ELSE 0 END AS rank,
      jsonb_build_object('id',q.id,'draftId',q.compose_id,'sourceId',q.source_id,'version',q.version,
        'sendAt',q.send_at,'account',a.email_address,'subject',q.subject,'to',q.recipients,'cc',q.cc,
        'state',CASE WHEN q.canceled THEN 'canceled' WHEN op.state IS NOT NULL THEN op.state
          WHEN q.failed OR (q.attempts>=8 AND q.lease_until<=clock_timestamp()) THEN 'failed'
          WHEN q.attempts>0 THEN 'dispatching' ELSE 'scheduled' END,
        'sentId',(SELECT e.id FROM public.emails e WHERE e.user_id=q.user_id AND e.source_account_id=q.account_id
          AND e.direction='outbound' AND e.message_id='<'||op.id::text||'@inboxai.invalid>'
          AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE ORDER BY e.id LIMIT 1)) AS item
    FROM private.scheduled_mail q JOIN public.source_accounts a ON a.id=q.account_id AND a.user_id=q.user_id
    LEFT JOIN private.mail_send_operations op ON op.user_id=q.user_id AND op.account_id=q.account_id AND op.request_key=q.request_key
    WHERE q.user_id=actor ORDER BY rank,q.send_at DESC,q.id LIMIT 100
  ) rows);
END $$;

CREATE FUNCTION public.change_scheduled_mail(p_id uuid,p_version integer,p_action text,p_at timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); q private.scheduled_mail; operation_state text;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT * INTO q FROM private.scheduled_mail WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF q.canceled AND p_action='cancel' AND p_version=q.version-1 THEN RETURN; END IF;
  IF p_action='move' AND NOT q.canceled AND p_version=q.version-1 AND q.send_at=p_at THEN RETURN; END IF;
  IF q.canceled OR q.version IS DISTINCT FROM p_version THEN RAISE SQLSTATE 'PT409'; END IF;
  SELECT state INTO operation_state FROM private.mail_send_operations
    WHERE user_id=actor AND account_id=q.account_id AND request_key=q.request_key;
  IF p_action='move' AND q.attempts=0 THEN
    IF p_at IS NULL OR NOT isfinite(p_at) OR p_at<=private.scheduled_mail_now() THEN RAISE SQLSTATE 'PT422'; END IF;
    UPDATE private.scheduled_mail SET send_at=p_at,version=version+1 WHERE id=q.id;
  ELSIF p_action='cancel' AND (q.attempts=0 OR q.failed OR operation_state='rejected'
      OR (operation_state IS NULL AND q.attempts>=8 AND q.lease_until<=clock_timestamp())) THEN
    UPDATE private.scheduled_mail SET canceled=true,version=version+1 WHERE id=q.id;
    IF q.compose_id IS NOT NULL THEN
      UPDATE private.file_compose_drafts SET request_key=NULL,request_hash=NULL,approved=NULL,revision=revision+1,
        updated_at=clock_timestamp() WHERE id=q.compose_id AND user_id=actor AND request_key=q.request_key;
    ELSE
      UPDATE private.reply_drafts SET request_key=NULL,request_hash=NULL,approved=NULL,revision=revision+1,
        updated_at=clock_timestamp() WHERE id=q.reply_id AND user_id=actor AND request_key=q.request_key;
    END IF;
  ELSE
    RAISE SQLSTATE 'PT409';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.file_compose_view(d private.file_compose_drafts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'sourceId',d.source_id,'accountId',d.account_id,'revision',d.revision,
    'fields',d.fields,'files',private.mail_file_manifest(d.user_id,d.file_ids),
    'state',COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END))
    || COALESCE((SELECT jsonb_build_object('scheduledId',q.id) FROM private.scheduled_mail q
      WHERE q.user_id=d.user_id AND q.request_key=d.request_key AND NOT q.canceled
      AND (op.state IS NULL OR op.state IN ('dispatching','unknown','rejected'))),'{}'::jsonb)
  FROM (SELECT 1) seed LEFT JOIN private.mail_send_operations op
    ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
$$;

CREATE OR REPLACE FUNCTION private.reply_draft_view(d private.reply_drafts)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'sourceId',d.source_id,'revision',d.revision,'subject',d.subject,
    'to',d.recipients,'cc',d.cc,'body',d.body,'tracking',d.tracking_at IS NOT NULL,
    'files',private.mail_file_manifest(d.user_id,d.file_ids),'state',COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END),
    'sentId',(SELECT e.id FROM public.emails e WHERE e.user_id=d.user_id AND e.source_account_id=d.account_id
      AND e.message_id='<'||op.id::text||'@inboxai.invalid>' AND e.direction='outbound'
      AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE ORDER BY e.id LIMIT 1))
    || COALESCE((SELECT jsonb_build_object('scheduledId',q.id) FROM private.scheduled_mail q
      WHERE q.user_id=d.user_id AND q.request_key=d.request_key AND NOT q.canceled
      AND (op.state IS NULL OR op.state IN ('dispatching','unknown','rejected'))),'{}'::jsonb)
  FROM (SELECT 1) anchor
  LEFT JOIN private.mail_send_operations op ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
$$;

REVOKE ALL ON FUNCTION private.scheduled_mail_now(),private.protect_scheduled_approval()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_scheduled_mail(uuid,text,uuid,integer,timestamptz,uuid,jsonb,text),
  public.begin_mail_send(uuid,uuid,uuid,text,jsonb),public.begin_scheduled_mail_send(uuid,uuid,uuid,uuid,uuid,text,jsonb),
  public.claim_scheduled_mail(),public.finish_scheduled_attempt(uuid,uuid,uuid,boolean),
  public.read_scheduled_receipt_scope(uuid,uuid),public.list_scheduled_mail(),
  public.change_scheduled_mail(uuid,integer,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_scheduled_mail(uuid,text,uuid,integer,timestamptz,uuid,jsonb,text),
  public.begin_mail_send(uuid,uuid,uuid,text,jsonb),public.begin_scheduled_mail_send(uuid,uuid,uuid,uuid,uuid,text,jsonb),
  public.claim_scheduled_mail(),public.finish_scheduled_attempt(uuid,uuid,uuid,boolean),
  public.read_scheduled_receipt_scope(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_scheduled_mail(),public.change_scheduled_mail(uuid,integer,text,timestamptz) TO authenticated;

COMMIT;
