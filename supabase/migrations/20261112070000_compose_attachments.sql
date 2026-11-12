BEGIN;

CREATE TABLE private.mail_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255 AND filename !~ '[[:cntrl:]]'),
  content_type text NOT NULL CHECK (content_type ~ '^[a-z0-9][a-z0-9.+_-]*/[a-z0-9][a-z0-9.+_-]*$' AND length(content_type)<=120),
  source_attachment_id uuid,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 8388608),
  size integer GENERATED ALWAYS AS (octet_length(content)) STORED,
  sha256 text GENERATED ALWAYS AS (encode(sha256(content),'hex')) STORED
);
ALTER TABLE private.mail_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mail_files FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.file_compose_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  source_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  fields jsonb NOT NULL,
  file_ids uuid[] NOT NULL,
  request_key uuid UNIQUE,
  request_hash text,
  approved jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE,
  CHECK ((request_key IS NULL AND request_hash IS NULL AND approved IS NULL) OR
    (request_key IS NOT NULL AND request_hash IS NOT NULL AND approved IS NOT NULL))
);
CREATE INDEX file_compose_user ON private.file_compose_drafts(user_id,updated_at DESC);
ALTER TABLE private.file_compose_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.file_compose_drafts FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.reply_drafts ADD COLUMN file_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE private.sent_mail_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES private.mail_files(id) ON DELETE CASCADE,
  position integer NOT NULL,
  UNIQUE(email_id,position)
);
ALTER TABLE private.sent_mail_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sent_mail_files FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.mail_file_metadata(f private.mail_files) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('id',f.id,'filename',f.filename,'contentType',f.content_type,
    'size',f.size,'sha256',f.sha256,'sourceAttachmentId',f.source_attachment_id))
$$;

CREATE FUNCTION private.mail_file_manifest(p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE manifest jsonb; total bigint; matched integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids)>5 OR
    cardinality(p_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_ids) AS id)
  THEN RAISE SQLSTATE '22023'; END IF;
  SELECT COALESCE(jsonb_agg(private.mail_file_metadata(f) ORDER BY requested.position),'[]'),sum(f.size),count(*)
    INTO manifest,total,matched
    FROM unnest(p_ids) WITH ORDINALITY requested(id,position)
    JOIN private.mail_files f ON f.id=requested.id AND f.user_id=p_actor;
  IF matched<>cardinality(p_ids) THEN RAISE SQLSTATE 'PT404'; END IF;
  IF total>8388608 THEN RAISE SQLSTATE 'PT413'; END IF;
  RETURN manifest;
END $$;

CREATE FUNCTION public.store_compose_file(p_actor uuid,p_filename text,p_content_type text,p_data text,p_source_attachment uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f private.mail_files;
BEGIN
  IF p_data IS NULL OR length(p_data)>11184812 THEN RAISE SQLSTATE 'PT413'; END IF;
  INSERT INTO private.mail_files(user_id,filename,content_type,source_attachment_id,content)
  VALUES(p_actor,p_filename,p_content_type,p_source_attachment,decode(p_data,'base64')) RETURNING * INTO f;
  RETURN private.mail_file_metadata(f);
END $$;

CREATE FUNCTION public.read_compose_files(p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE manifest jsonb;
BEGIN
  manifest := private.mail_file_manifest(p_actor,p_ids);
  RETURN (
    SELECT COALESCE(jsonb_agg(entry.data || jsonb_build_object('data',encode(f.content,'base64')) ORDER BY entry.position),'[]')
    FROM jsonb_array_elements(manifest) WITH ORDINALITY entry(data,position)
    JOIN private.mail_files f ON f.id=(entry.data->>'id')::uuid AND f.user_id=p_actor
  );
END $$;

CREATE FUNCTION private.file_compose_view(d private.file_compose_drafts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'sourceId',d.source_id,'accountId',d.account_id,'revision',d.revision,
    'fields',d.fields,'files',private.mail_file_manifest(d.user_id,d.file_ids),
    'state',COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END))
  FROM (SELECT 1) seed LEFT JOIN private.mail_send_operations op
    ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
$$;

CREATE FUNCTION public.read_file_compose(p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.file_compose_drafts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO d FROM private.file_compose_drafts WHERE id=p_id AND user_id=actor;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    RETURN private.file_compose_view(d);
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'subject',x.fields->>'subject','sourceId',x.source_id)
      ORDER BY x.updated_at DESC),'[]')
    FROM (
      SELECT owned.* FROM private.file_compose_drafts owned
      LEFT JOIN private.mail_send_operations op ON op.user_id=owned.user_id AND op.account_id=owned.account_id AND op.request_key=owned.request_key
      WHERE owned.user_id=actor AND (op.state IS NULL OR op.state NOT IN ('accepted','partial'))
      ORDER BY owned.updated_at DESC LIMIT 20
    ) x
  );
END $$;

CREATE FUNCTION public.save_file_compose(p_id uuid,p_revision integer,p_account uuid,p_source uuid,p_fields jsonb,p_files uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.file_compose_drafts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.source_accounts WHERE id=p_account AND user_id=actor AND is_active) OR
    (p_source IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emails WHERE id=p_source AND user_id=actor
      AND NOT provider_deleted AND is_deleted IS NOT TRUE))
  THEN RAISE SQLSTATE 'PT404'; END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR octet_length(p_fields::text)>650000 OR
    jsonb_typeof(p_fields->'to') IS DISTINCT FROM 'string' OR length(p_fields->>'to')>4000 OR
    jsonb_typeof(p_fields->'cc') IS DISTINCT FROM 'string' OR length(p_fields->>'cc')>4000 OR
    jsonb_typeof(p_fields->'subject') IS DISTINCT FROM 'string' OR length(p_fields->>'subject')>500 OR
    jsonb_typeof(p_fields->'body') IS DISTINCT FROM 'string' OR length(p_fields->>'body')>100000
  THEN RAISE SQLSTATE '22023'; END IF;
  PERFORM private.mail_file_manifest(actor,p_files);
  IF p_id IS NULL THEN
    INSERT INTO private.file_compose_drafts(user_id,account_id,source_id,fields,file_ids)
    VALUES(actor,p_account,p_source,p_fields,p_files) RETURNING * INTO d;
  ELSE
    SELECT * INTO d FROM private.file_compose_drafts WHERE user_id=actor AND id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    IF d.request_key IS NOT NULL OR d.revision IS DISTINCT FROM p_revision OR d.source_id IS DISTINCT FROM p_source
      THEN RAISE SQLSTATE 'PT409'; END IF;
    IF (d.account_id,d.fields,d.file_ids) IS DISTINCT FROM (p_account,p_fields,p_files) THEN
      UPDATE private.file_compose_drafts SET account_id=p_account,fields=p_fields,file_ids=p_files,
        revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
    END IF;
  END IF;
  RETURN private.file_compose_view(d);
END $$;

CREATE FUNCTION public.prepare_file_compose(p_actor uuid,p_id uuid,p_revision integer,p_input jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.file_compose_drafts;
BEGIN
  SELECT * INTO d FROM private.file_compose_drafts WHERE id=p_id AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF d.revision IS DISTINCT FROM p_revision OR (d.request_key IS NOT NULL AND d.request_hash IS DISTINCT FROM p_hash) OR
    p_input->>'sourceAccountId' IS DISTINCT FROM d.account_id::text OR
    p_input->>'subject' IS DISTINCT FROM btrim(d.fields->>'subject') OR p_input->>'text' IS DISTINCT FROM d.fields->>'body' OR
    p_input->'to' IS DISTINCT FROM to_jsonb(regexp_split_to_array(btrim(d.fields->>'to'),'[[:space:]]*,[[:space:]]*')) OR
    p_input->'cc' IS DISTINCT FROM (CASE WHEN btrim(d.fields->>'cc')='' THEN '[]'::jsonb
      ELSE to_jsonb(regexp_split_to_array(btrim(d.fields->>'cc'),'[[:space:]]*,[[:space:]]*')) END) OR
    COALESCE(p_input->'attachmentIds','[]') IS DISTINCT FROM to_jsonb(d.file_ids)
  THEN RAISE SQLSTATE 'PT409'; END IF;
  IF d.request_key IS NULL THEN
    UPDATE private.file_compose_drafts SET request_key=gen_random_uuid(),request_hash=p_hash,approved=p_input,
      updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
  END IF;
  RETURN private.file_compose_view(d);
END $$;

CREATE FUNCTION public.read_file_compose_approval(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('key',request_key,'hash',request_hash,'input',approved)
    FROM private.file_compose_drafts WHERE user_id=p_actor AND id=p_id AND request_key IS NOT NULL
$$;

CREATE FUNCTION public.change_file_compose(p_id uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.file_compose_drafts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT * INTO d FROM private.file_compose_drafts WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF p_action='discard' AND d.request_key IS NULL THEN
    DELETE FROM private.file_compose_drafts WHERE id=p_id;
    RETURN NULL;
  ELSIF p_action='edit' AND NOT EXISTS (SELECT 1 FROM private.mail_send_operations
      WHERE user_id=actor AND account_id=d.account_id AND request_key=d.request_key AND state<>'rejected') THEN
    UPDATE private.file_compose_drafts SET request_key=NULL,request_hash=NULL,approved=NULL,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d;
    RETURN private.file_compose_view(d);
  END IF;
  RAISE SQLSTATE 'PT409';
END $$;

CREATE FUNCTION public.begin_file_compose(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.file_compose_drafts;
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  SELECT * INTO d FROM private.file_compose_drafts WHERE id=p_draft AND user_id=p_user_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR d.request_key IS DISTINCT FROM p_key OR d.request_hash IS DISTINCT FROM p_hash
    OR p_payload->'to' IS DISTINCT FROM d.approved->'to' OR p_payload->'cc' IS DISTINCT FROM d.approved->'cc'
    OR p_payload->'bcc' IS DISTINCT FROM d.approved->'bcc'
    OR p_payload->>'subject' IS DISTINCT FROM d.approved->>'subject' OR p_payload->>'text' IS DISTINCT FROM d.approved->>'text'
    OR p_payload->>'inReplyTo' IS NOT NULL OR p_payload->>'html' IS NOT NULL
    OR COALESCE(p_payload->'attachments','[]') IS DISTINCT FROM private.mail_file_manifest(p_user_id,d.file_ids)
  THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN public.begin_mail_send(p_user_id,p_account_id,p_key,p_hash,p_payload);
END $$;

CREATE FUNCTION private.mirror_sent_mail_files() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sent_id uuid; matched integer;
BEGIN
  IF NEW.state NOT IN ('accepted','partial') OR OLD.state NOT IN ('dispatching','unknown') OR
    COALESCE(jsonb_array_length(OLD.payload->'attachments'),0)=0 THEN RETURN NEW; END IF;
  SELECT id INTO STRICT sent_id FROM public.emails
    WHERE user_id=NEW.user_id AND source_account_id=NEW.account_id AND direction='outbound'
      AND ((NEW.provider='gmail' AND sync_namespace='gmail' AND original_uid=NEW.provider_id)
        OR (NEW.provider='smtp' AND sync_namespace='smtp-sent' AND message_id='<'||NEW.id::text||'@inboxai.invalid>'));
  INSERT INTO private.sent_mail_files(email_id,file_id,position)
    SELECT sent_id,f.id,part.position
    FROM jsonb_array_elements(OLD.payload->'attachments') WITH ORDINALITY part(metadata,position)
    JOIN private.mail_files f ON f.id=(part.metadata->>'id')::uuid AND f.user_id=NEW.user_id
      AND part.metadata=private.mail_file_metadata(f);
  GET DIAGNOSTICS matched=ROW_COUNT;
  IF matched<>jsonb_array_length(OLD.payload->'attachments') THEN RAISE SQLSTATE 'PT409'; END IF;
  UPDATE public.emails SET attachment_count=matched WHERE id=sent_id AND user_id=NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER mirror_sent_mail_files AFTER UPDATE OF state ON private.mail_send_operations
FOR EACH ROW EXECUTE FUNCTION private.mirror_sent_mail_files();

CREATE FUNCTION public.list_sent_mail_files(p_email uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_agg(jsonb_build_object('id',s.id,'filename',f.filename,'content_type',f.content_type,'size',f.size,
    'is_inline',false,'email_id',e.id) ORDER BY s.position)
  FROM private.sent_mail_files s JOIN public.emails e ON e.id=s.email_id
  JOIN private.mail_files f ON f.id=s.file_id AND f.user_id=e.user_id
  WHERE e.id=p_email AND e.user_id=auth.uid() AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
$$;

CREATE FUNCTION public.read_sent_mail_file(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('filename',f.filename,'contentType',f.content_type,'data',encode(f.content,'base64'),
    'sha256',f.sha256,'emailId',e.id)
  FROM private.sent_mail_files s JOIN public.emails e ON e.id=s.email_id
  JOIN private.mail_files f ON f.id=s.file_id AND f.user_id=e.user_id
  WHERE s.id=p_id AND e.user_id=auth.uid() AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
$$;

REVOKE ALL ON FUNCTION private.mail_file_metadata(private.mail_files),private.mail_file_manifest(uuid,uuid[]),
  private.file_compose_view(private.file_compose_drafts),private.mirror_sent_mail_files() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.store_compose_file(uuid,text,text,text,uuid),public.read_compose_files(uuid,uuid[]),
  public.prepare_file_compose(uuid,uuid,integer,jsonb,text),public.read_file_compose_approval(uuid,uuid),
  public.begin_file_compose(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_compose_file(uuid,text,text,text,uuid),public.read_compose_files(uuid,uuid[]),
  public.prepare_file_compose(uuid,uuid,integer,jsonb,text),public.read_file_compose_approval(uuid,uuid),
  public.begin_file_compose(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.read_file_compose(uuid),public.save_file_compose(uuid,integer,uuid,uuid,jsonb,uuid[]),
  public.change_file_compose(uuid,text),public.list_sent_mail_files(uuid),public.read_sent_mail_file(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_file_compose(uuid),public.save_file_compose(uuid,integer,uuid,uuid,jsonb,uuid[]),
  public.change_file_compose(uuid,text),public.list_sent_mail_files(uuid),public.read_sent_mail_file(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.reply_draft_view(d private.reply_drafts)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'sourceId',d.source_id,'revision',d.revision,'subject',d.subject,
    'to',d.recipients,'cc',d.cc,'body',d.body,'tracking',d.tracking_at IS NOT NULL,
    'files',private.mail_file_manifest(d.user_id,d.file_ids),'state',COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END),
    'sentId',(SELECT e.id FROM public.emails e WHERE e.user_id=d.user_id AND e.source_account_id=d.account_id
      AND e.message_id='<'||op.id::text||'@inboxai.invalid>' AND e.direction='outbound'
      AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE ORDER BY e.id LIMIT 1))
  FROM (SELECT 1) anchor
  LEFT JOIN private.mail_send_operations op ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
$$;

CREATE OR REPLACE FUNCTION public.prepare_reply_send(p_actor uuid,p_id uuid,p_revision integer,p_input jsonb,p_hash text)
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
     OR COALESCE(p_input->'attachmentIds','[]') IS DISTINCT FROM to_jsonb(d.file_ids)
     OR p_input->>'text' IS DISTINCT FROM d.body OR p_input->>'subject' IS DISTINCT FROM d.subject
     OR p_input->'to' IS DISTINCT FROM to_jsonb(regexp_split_to_array(btrim(d.recipients),'[[:space:]]*,[[:space:]]*'))
     OR p_input->'cc' IS DISTINCT FROM (CASE WHEN btrim(d.cc)='' THEN '[]'::jsonb
       ELSE to_jsonb(regexp_split_to_array(btrim(d.cc),'[[:space:]]*,[[:space:]]*')) END)
  THEN RAISE SQLSTATE 'PT409'; END IF;
  UPDATE private.reply_drafts SET request_key=gen_random_uuid(),request_hash=p_hash,approved=p_input,updated_at=clock_timestamp()
    WHERE id=p_id RETURNING * INTO d;
  RETURN private.reply_draft_view(d);
END $$;

CREATE OR REPLACE FUNCTION public.begin_reply_send(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
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
    OR COALESCE(p_payload->'attachments','[]') IS DISTINCT FROM private.mail_file_manifest(p_user_id,d.file_ids)
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

CREATE FUNCTION public.save_reply_files(p_source uuid,p_id uuid,p_revision integer,p_fingerprint text,
  p_to text,p_cc text,p_body text,p_files uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.reply_drafts; saved jsonb;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  PERFORM private.mail_file_manifest(actor,p_files);
  -- Match the source then draft lock order of the existing save and send RPCs.
  PERFORM 1 FROM public.emails WHERE id=p_source AND user_id=actor FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO d FROM private.reply_drafts WHERE id=p_id AND user_id=actor AND source_id=p_source FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    IF d.revision IS DISTINCT FROM p_revision THEN RAISE SQLSTATE 'PT409'; END IF;
  END IF;
  saved := public.save_reply_draft(p_source,p_id,p_revision,p_fingerprint,p_to,p_cc,p_body);
  SELECT * INTO STRICT d FROM private.reply_drafts WHERE id=(saved->>'id')::uuid AND user_id=actor FOR UPDATE;
  IF d.file_ids IS DISTINCT FROM p_files THEN
    -- A concurrent first save must reopen its draft before replacing another tab's files.
    IF p_id IS NULL AND cardinality(d.file_ids)>0 THEN RAISE SQLSTATE 'PT409'; END IF;
    UPDATE private.reply_drafts SET file_ids=p_files,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=d.id RETURNING * INTO d;
  END IF;
  RETURN private.reply_draft_view(d);
END $$;
REVOKE ALL ON FUNCTION public.save_reply_files(uuid,uuid,integer,text,text,text,text,uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_reply_files(uuid,uuid,integer,text,text,text,text,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
