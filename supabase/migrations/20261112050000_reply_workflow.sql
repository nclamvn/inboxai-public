BEGIN;

ALTER TABLE public.emails ADD COLUMN in_reply_to text, ADD COLUMN reply_references text[];
CREATE INDEX emails_reply_parent ON public.emails(user_id,source_account_id,in_reply_to)
  WHERE direction='inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE;
CREATE INDEX emails_reply_references ON public.emails USING gin(reply_references)
  WHERE direction='inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE;
CREATE INDEX emails_reply_thread ON public.emails(user_id,source_account_id,thread_id,received_at DESC)
  WHERE NOT provider_deleted AND is_deleted IS NOT TRUE AND thread_id IS NOT NULL;
CREATE INDEX emails_reply_identity ON public.emails(user_id,source_account_id,message_id);

-- Store provider conversation headers inside the existing fenced page transaction.
ALTER FUNCTION public.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean) FROM service_role;
CREATE FUNCTION public.commit_account_sync_page(p_user_id uuid,p_account_id uuid,p_lease uuid,p_fence bigint,p_revision integer,
  p_cursor jsonb,p_namespace text,p_messages jsonb,p_deleted jsonb,p_generation uuid DEFAULT NULL,p_finalize boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE new_revision integer;
BEGIN
  new_revision := private.commit_account_sync_page(p_user_id,p_account_id,p_lease,p_fence,p_revision,
    p_cursor,p_namespace,p_messages,p_deleted,p_generation,p_finalize);
  WITH headers AS (
    SELECT item->>'uid' AS uid,
      CASE WHEN p_namespace='gmail' AND item->>'thread_id' ~ '^[A-Za-z0-9_-]{1,128}$' THEN item->>'thread_id' END AS thread,
      left(item->>'reply_to',254) AS reply_address,
      CASE WHEN item->>'in_reply_to' ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN left(item->>'in_reply_to',998) END AS parent,
      ARRAY(SELECT ref FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(item->'reply_references')='array' THEN item->'reply_references' ELSE '[]'::jsonb END
      ) AS r(ref) WHERE length(ref)<=998 AND ref ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' LIMIT 32) AS refs
    FROM jsonb_array_elements(p_messages) AS batch(item)
    WHERE item ? 'reply_references'
  )
  UPDATE public.emails e SET thread_id=h.thread,reply_to=h.reply_address,in_reply_to=h.parent,reply_references=h.refs
    FROM headers h WHERE e.user_id=p_user_id AND e.source_account_id=p_account_id
      AND e.sync_namespace=p_namespace AND e.original_uid=h.uid
      AND (e.thread_id,e.reply_to,e.in_reply_to,e.reply_references) IS DISTINCT FROM (h.thread,h.reply_address,h.parent,h.refs);
  RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean) TO service_role;

CREATE TABLE private.reply_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  subject text NOT NULL,
  recipients text NOT NULL,
  cc text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  request_key uuid UNIQUE,
  request_hash text,
  approved jsonb,
  completed boolean NOT NULL DEFAULT false,
  tracking_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE,
  CHECK (length(subject) BETWEEN 1 AND 500 AND length(recipients)<=4000 AND length(cc)<=4000 AND length(body)<=100000),
  CHECK ((request_key IS NULL AND request_hash IS NULL AND approved IS NULL) OR
    (request_key IS NOT NULL AND request_hash ~ '^[a-f0-9]{64}$' AND approved IS NOT NULL))
);
ALTER TABLE private.reply_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.reply_drafts FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX reply_drafts_open ON private.reply_drafts(user_id,source_id) WHERE NOT completed;
CREATE INDEX reply_drafts_source ON private.reply_drafts(user_id,source_id,updated_at DESC);
CREATE INDEX reply_drafts_inbox ON private.reply_drafts(user_id,account_id,updated_at DESC);

CREATE FUNCTION private.reply_source_fingerprint(e public.emails)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(e.source_account_id,e.from_address,e.reply_to,e.subject,
    e.message_id,e.thread_id,e.body_text,e.body_html)::text,'UTF8')),'hex')
$$;

CREATE FUNCTION private.reply_draft_view(d private.reply_drafts)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'sourceId',d.source_id,'revision',d.revision,'subject',d.subject,
    'to',d.recipients,'cc',d.cc,'body',d.body,'tracking',d.tracking_at IS NOT NULL,
    'state',COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END),
    'sentId',(SELECT e.id FROM public.emails e WHERE e.user_id=d.user_id AND e.source_account_id=d.account_id
      AND e.message_id='<'||op.id::text||'@inboxai.invalid>' AND e.direction='outbound'
      AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE ORDER BY e.id LIMIT 1))
  FROM (SELECT 1) anchor
  LEFT JOIN private.mail_send_operations op ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
$$;

CREATE FUNCTION public.read_reply_workbench(p_source uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source public.emails; account public.source_accounts; draft private.reply_drafts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT * INTO source FROM public.emails WHERE user_id=actor AND id=p_source
    AND NOT provider_deleted AND is_deleted IS NOT TRUE AND direction='inbound';
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  SELECT * INTO account FROM public.source_accounts WHERE user_id=actor AND id=source.source_account_id AND is_active;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409'; END IF;
  SELECT * INTO draft FROM private.reply_drafts WHERE user_id=actor AND source_id=p_source
    ORDER BY completed,updated_at DESC,id DESC LIMIT 1;
  RETURN jsonb_build_object('accountId',account.id,'account',account.email_address,
    'fingerprint',private.reply_source_fingerprint(source),'sourceId',source.id,'subject',source.subject,
    'to',COALESCE(NULLIF(source.reply_to,''),source.from_address),
    'draft',CASE WHEN draft.id IS NOT NULL THEN private.reply_draft_view(draft) END,
    'stale',draft.id IS NOT NULL AND draft.fingerprint<>private.reply_source_fingerprint(source),
    'thread',(
      SELECT jsonb_agg(jsonb_build_object('id',m.id,'sender',m.from_address,'subject',m.subject,'at',m.received_at,
        'snippet',left(m.body_text,240),'source',m.id=source.id) ORDER BY m.received_at NULLS FIRST,m.id)
      FROM (
        SELECT source.id,source.from_address,source.subject,source.received_at,source.body_text
        UNION ALL SELECT related.*
          FROM (
        SELECT e.id,e.from_address,e.subject,e.received_at,e.body_text
        FROM public.emails e WHERE e.user_id=actor AND e.source_account_id=account.id
          AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND e.id<>source.id
          AND ((source.sync_namespace='gmail' AND source.thread_id IS NOT NULL AND e.sync_namespace='gmail' AND e.thread_id=source.thread_id)
            OR (source.in_reply_to IS NOT NULL AND e.message_id=source.in_reply_to)
            OR (cardinality(source.reply_references)>0 AND e.message_id=ANY(source.reply_references))
            OR (source.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' AND e.in_reply_to=source.message_id)
            OR EXISTS (SELECT 1 FROM private.reply_drafts d JOIN private.mail_send_operations op
              ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
              WHERE d.user_id=actor AND d.source_id=source.id AND d.account_id=account.id
                AND op.state IN ('accepted','partial')
                AND ((e.message_id='<'||op.id::text||'@inboxai.invalid>' AND e.direction='outbound')
                  OR e.in_reply_to='<'||op.id::text||'@inboxai.invalid>'
                  OR e.reply_references @> ARRAY['<'||op.id::text||'@inboxai.invalid>'])))
        ORDER BY e.received_at DESC NULLS LAST,e.id LIMIT 19
      ) related
      ) m
    ));
END $$;

CREATE FUNCTION public.save_reply_draft(p_source uuid,p_id uuid,p_revision integer,p_fingerprint text,
  p_to text,p_cc text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source public.emails; d private.reply_drafts; current_fingerprint text;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT e.* INTO source FROM public.emails e JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=actor AND a.is_active
    WHERE e.user_id=actor AND e.id=p_source AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND e.direction='inbound' FOR SHARE OF e;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  current_fingerprint := private.reply_source_fingerprint(source);
  IF current_fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO private.reply_drafts(user_id,account_id,source_id,fingerprint,subject,recipients,cc,body)
    VALUES(actor,source.source_account_id,p_source,current_fingerprint,
      'Re: '||left(COALESCE(NULLIF(btrim(regexp_replace(regexp_replace(COALESCE(source.subject,''),'[[:cntrl:]]',' ','g'),
        '^(re:[[:space:]]*)+','','i')),''),'(Không có tiêu đề)'),496),p_to,p_cc,p_body)
    ON CONFLICT (user_id,source_id) WHERE NOT completed DO NOTHING RETURNING * INTO d;
    IF NOT FOUND THEN
      SELECT * INTO d FROM private.reply_drafts WHERE user_id=actor AND source_id=p_source AND NOT completed FOR UPDATE;
      IF NOT FOUND OR d.request_key IS NOT NULL OR (d.fingerprint,d.recipients,d.cc,d.body) IS DISTINCT FROM
        (current_fingerprint,p_to,p_cc,p_body) THEN RAISE SQLSTATE 'PT409'; END IF;
    END IF;
  ELSE
    SELECT * INTO d FROM private.reply_drafts WHERE user_id=actor AND source_id=p_source AND id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    IF d.request_key IS NOT NULL OR d.completed OR d.fingerprint<>current_fingerprint THEN RAISE SQLSTATE 'PT409'; END IF;
    IF (d.recipients,d.cc,d.body) IS DISTINCT FROM (p_to,p_cc,p_body) THEN
      IF d.revision IS DISTINCT FROM p_revision THEN RAISE SQLSTATE 'PT409'; END IF;
      UPDATE private.reply_drafts SET recipients=p_to,cc=p_cc,body=p_body,revision=revision+1,updated_at=clock_timestamp()
        WHERE id=p_id RETURNING * INTO d;
    END IF;
  END IF;
  RETURN private.reply_draft_view(d);
END $$;

-- Only a service call may freeze the validated normalized envelope and its exact hash.
CREATE FUNCTION public.prepare_reply_send(p_actor uuid,p_id uuid,p_revision integer,p_input jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.reply_drafts; source public.emails;
BEGIN
  SELECT * INTO d FROM private.reply_drafts WHERE user_id=p_actor AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF d.completed OR d.revision IS DISTINCT FROM p_revision THEN RAISE SQLSTATE 'PT409'; END IF;
  IF d.request_key IS NOT NULL THEN
    IF d.request_hash IS DISTINCT FROM p_hash THEN RAISE SQLSTATE 'PT409'; END IF;
    RETURN private.reply_draft_view(d);
  END IF;
  SELECT * INTO source FROM public.emails WHERE user_id=p_actor AND id=d.source_id AND source_account_id=d.account_id
    AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  IF NOT FOUND OR d.fingerprint<>private.reply_source_fingerprint(source) THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_input->>'sourceAccountId' IS DISTINCT FROM d.account_id::text OR p_input->>'replyToEmailId' IS DISTINCT FROM d.source_id::text
     OR p_input->>'text' IS DISTINCT FROM d.body OR p_input->>'subject' IS DISTINCT FROM d.subject
     OR p_input->'to' IS DISTINCT FROM to_jsonb(regexp_split_to_array(btrim(d.recipients),'[[:space:]]*,[[:space:]]*'))
     OR p_input->'cc' IS DISTINCT FROM (CASE WHEN btrim(d.cc)='' THEN '[]'::jsonb
       ELSE to_jsonb(regexp_split_to_array(btrim(d.cc),'[[:space:]]*,[[:space:]]*')) END)
  THEN RAISE SQLSTATE 'PT409'; END IF;
  UPDATE private.reply_drafts SET request_key=gen_random_uuid(),request_hash=p_hash,approved=p_input,updated_at=clock_timestamp()
    WHERE id=p_id RETURNING * INTO d;
  RETURN private.reply_draft_view(d);
END $$;

CREATE FUNCTION public.read_reply_approval(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('key',request_key,'hash',request_hash,'input',approved)
  FROM private.reply_drafts WHERE user_id=p_actor AND id=p_id AND request_key IS NOT NULL
$$;

CREATE FUNCTION public.begin_reply_send(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.reply_drafts; source public.emails;
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  -- Read the source before locking the draft, matching draft-save lock order.
  SELECT e.* INTO source FROM public.emails e JOIN private.reply_drafts x ON x.source_id=e.id
  WHERE x.id=p_draft AND x.user_id=p_user_id AND e.user_id=p_user_id AND e.source_account_id=p_account_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE FOR SHARE OF e;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409'; END IF;
  SELECT * INTO d FROM private.reply_drafts WHERE user_id=p_user_id AND account_id=p_account_id AND id=p_draft FOR UPDATE;
  IF NOT FOUND OR d.completed OR d.request_key IS DISTINCT FROM p_key OR d.request_hash IS DISTINCT FROM p_hash
    OR d.fingerprint<>private.reply_source_fingerprint(source)
    OR p_payload->'to' IS DISTINCT FROM d.approved->'to'
    OR p_payload->'cc' IS DISTINCT FROM d.approved->'cc'
    OR p_payload->'bcc' IS DISTINCT FROM d.approved->'bcc'
    OR p_payload->>'subject' IS DISTINCT FROM d.approved->>'subject'
    OR p_payload->>'text' IS DISTINCT FROM d.approved->>'text'
    OR p_payload->>'html' IS NOT NULL
    OR p_payload->>'inReplyTo' IS DISTINCT FROM (CASE WHEN length(source.message_id)<=998
      AND source.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN source.message_id END)
  THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN public.begin_mail_send(p_user_id,p_account_id,p_key,p_hash,p_payload);
END $$;

CREATE FUNCTION public.change_reply_draft(p_id uuid,p_action text,p_fingerprint text DEFAULT NULL)
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
    UPDATE private.reply_drafts SET tracking_at=NULL,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
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

CREATE FUNCTION public.list_reply_work(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF cardinality(p_accounts)>50 THEN RAISE SQLSTATE '22023'; END IF;
  RETURN (
    WITH rows AS (
      SELECT d.id,d.source_id,d.subject,d.updated_at,d.tracking_at,a.email_address,
        CASE WHEN d.tracking_at IS NOT NULL AND r.id IS NOT NULL THEN 'reply'
          WHEN d.tracking_at IS NOT NULL THEN 'waiting'
          WHEN op.state='accepted' THEN 'sent'
          WHEN d.request_key IS NULL THEN 'draft' ELSE 'sending' END AS status,r.id AS reply_id,r.body_text
      FROM private.reply_drafts d
      JOIN public.source_accounts a ON a.user_id=actor AND a.id=d.account_id
      JOIN public.emails source ON source.user_id=actor AND source.id=d.source_id
        AND NOT source.provider_deleted AND source.is_deleted IS NOT TRUE
      LEFT JOIN private.mail_send_operations op ON op.user_id=actor AND op.account_id=d.account_id AND op.request_key=d.request_key
      LEFT JOIN LATERAL (
        SELECT e.id,e.body_text FROM public.emails e
        WHERE d.tracking_at IS NOT NULL AND op.state='accepted'
          AND e.user_id=actor AND e.source_account_id=d.account_id AND e.direction='inbound'
          AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
          AND (e.in_reply_to='<'||op.id::text||'@inboxai.invalid>' OR
            e.reply_references @> ARRAY['<'||op.id::text||'@inboxai.invalid>'])
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text((d.approved->'to') || (d.approved->'cc')) AS recipient(address)
            WHERE lower(recipient.address)=lower(e.from_address))
        ORDER BY e.received_at DESC NULLS LAST,e.id DESC LIMIT 1
      ) r ON true
      WHERE d.user_id=actor AND (NOT d.completed OR d.tracking_at IS NOT NULL)
        AND (COALESCE(cardinality(p_accounts),0)=0 OR d.account_id=ANY(p_accounts))
      ORDER BY (r.id IS NOT NULL) DESC,d.updated_at DESC,d.id DESC LIMIT 20
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'subject',subject,'account',email_address,
      'status',status,'replyId',reply_id,'quote',left(body_text,240))
      ORDER BY (reply_id IS NOT NULL) DESC,updated_at DESC,id DESC),'[]'::jsonb) FROM rows
  );
END $$;

REVOKE ALL ON FUNCTION private.reply_source_fingerprint(public.emails),private.reply_draft_view(private.reply_drafts)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_reply_workbench(uuid),public.save_reply_draft(uuid,uuid,integer,text,text,text,text),
  public.change_reply_draft(uuid,text,text),public.list_reply_work(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_reply_workbench(uuid),public.save_reply_draft(uuid,uuid,integer,text,text,text,text),
  public.change_reply_draft(uuid,text,text),public.list_reply_work(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_reply_send(uuid,uuid,integer,jsonb,text),public.read_reply_approval(uuid,uuid),
  public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_reply_send(uuid,uuid,integer,jsonb,text),public.read_reply_approval(uuid,uuid),
  public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;

COMMIT;
