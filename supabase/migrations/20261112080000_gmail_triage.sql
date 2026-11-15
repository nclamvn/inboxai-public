BEGIN;

ALTER TABLE public.emails ADD COLUMN gmail_label_revision numeric(30,0);

-- A fenced sync page fetched before a label write can still commit afterwards.
-- Order the label snapshot by Gmail message historyId, independently of the account cursor.
CREATE OR REPLACE FUNCTION private.commit_account_sync_page(p_user_id uuid,p_account_id uuid,p_lease uuid,p_fence bigint,p_revision integer,
 p_cursor jsonb,p_namespace text,p_messages jsonb,p_deleted jsonb,p_generation uuid DEFAULT NULL,p_finalize boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state private.account_sync; item jsonb; att jsonb; v_email_id uuid;
BEGIN
 PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync account unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO state FROM private.account_sync WHERE account_id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR state.lease_id IS DISTINCT FROM p_lease OR state.fence<>p_fence OR state.revision<>p_revision
   OR state.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Sync lease conflict' USING ERRCODE='PT409'; END IF;
 IF p_cursor IS NULL OR p_cursor->>'provider' IS DISTINCT FROM state.provider OR octet_length(p_cursor::text)>1048576 OR
   p_namespace IS NULL OR length(p_namespace)>100 OR p_namespace='legacy' OR
   (state.provider='gmail' AND p_namespace<>'gmail') OR (state.provider='imap' AND p_namespace !~ '^INBOX:[0-9]{1,30}$') OR
   jsonb_typeof(p_messages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_messages)>50 OR
   jsonb_typeof(p_deleted) IS DISTINCT FROM 'array' OR jsonb_array_length(p_deleted)>5000 OR
   (p_finalize AND p_generation IS NULL) THEN RAISE EXCEPTION 'Invalid sync page' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_messages) LOOP
   IF COALESCE(length(item->>'uid'),0) NOT BETWEEN 1 AND 256 OR jsonb_typeof(item->'attachments') IS DISTINCT FROM 'array'
     OR jsonb_array_length(item->'attachments')>100 OR length(item->>'body_text')>100000 OR length(item->>'body_html')>200000 THEN
     RAISE EXCEPTION 'Invalid sync message' USING ERRCODE='22023'; END IF;
   INSERT INTO public.emails(user_id,source_account_id,sync_namespace,original_uid,message_id,from_address,from_name,to_addresses,cc_addresses,
     subject,body_text,body_html,body_fetched,received_at,is_read,is_starred,is_archived,is_deleted,direction,attachment_count,sync_seen_generation,sync_provider_flags,provider_deleted,gmail_label_revision)
   VALUES(p_user_id,p_account_id,p_namespace,item->>'uid',item->>'message_id',item->>'from_address',item->>'from_name',
     COALESCE(item->'to_addresses','[]'::jsonb),COALESCE(item->'cc_addresses','[]'::jsonb),
     item->>'subject',item->>'body_text',item->>'body_html',true,(item->>'received_at')::timestamptz,
     (item->>'is_read')::boolean,(item->>'is_starred')::boolean,(item->>'is_archived')::boolean,(item->>'is_deleted')::boolean,
     item->>'direction',jsonb_array_length(item->'attachments'),p_generation,
     jsonb_build_object('read',(item->>'is_read')::boolean,'starred',(item->>'is_starred')::boolean,'archived',(item->>'is_archived')::boolean,'deleted',(item->>'is_deleted')::boolean),false,
     CASE WHEN p_namespace='gmail' AND item->>'gmail_label_revision' ~ '^[0-9]{1,30}$' THEN (item->>'gmail_label_revision')::numeric END)
   ON CONFLICT(source_account_id,sync_namespace,original_uid) DO UPDATE SET
     message_id=EXCLUDED.message_id,from_address=EXCLUDED.from_address,from_name=EXCLUDED.from_name,to_addresses=EXCLUDED.to_addresses,
     cc_addresses=EXCLUDED.cc_addresses,subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,body_html=EXCLUDED.body_html,
     body_fetched=true,received_at=EXCLUDED.received_at,
     is_read=CASE WHEN emails.gmail_label_revision IS NOT NULL AND
       (EXCLUDED.gmail_label_revision IS NULL OR EXCLUDED.gmail_label_revision<emails.gmail_label_revision) THEN emails.is_read
       WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'read' AND emails.is_read IS DISTINCT FROM (emails.sync_provider_flags->>'read')::boolean THEN emails.is_read ELSE EXCLUDED.is_read END,
     is_starred=CASE WHEN emails.gmail_label_revision IS NOT NULL AND
       (EXCLUDED.gmail_label_revision IS NULL OR EXCLUDED.gmail_label_revision<emails.gmail_label_revision) THEN emails.is_starred
       WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'starred' AND emails.is_starred IS DISTINCT FROM (emails.sync_provider_flags->>'starred')::boolean THEN emails.is_starred ELSE EXCLUDED.is_starred END,
     is_archived=CASE WHEN emails.gmail_label_revision IS NOT NULL AND
       (EXCLUDED.gmail_label_revision IS NULL OR EXCLUDED.gmail_label_revision<emails.gmail_label_revision) THEN emails.is_archived
       WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'archived' AND emails.is_archived IS DISTINCT FROM (emails.sync_provider_flags->>'archived')::boolean THEN emails.is_archived ELSE EXCLUDED.is_archived END,
     is_deleted=CASE WHEN emails.gmail_label_revision IS NOT NULL AND
       (EXCLUDED.gmail_label_revision IS NULL OR EXCLUDED.gmail_label_revision<emails.gmail_label_revision) THEN emails.is_deleted
       WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'deleted' AND emails.is_deleted IS DISTINCT FROM (emails.sync_provider_flags->>'deleted')::boolean THEN emails.is_deleted ELSE EXCLUDED.is_deleted END,
     sync_provider_flags=CASE WHEN emails.gmail_label_revision IS NOT NULL AND
       (EXCLUDED.gmail_label_revision IS NULL OR EXCLUDED.gmail_label_revision<emails.gmail_label_revision)
       THEN emails.sync_provider_flags ELSE EXCLUDED.sync_provider_flags END,
     gmail_label_revision=greatest(emails.gmail_label_revision,EXCLUDED.gmail_label_revision),direction=EXCLUDED.direction,attachment_count=EXCLUDED.attachment_count,
     sync_seen_generation=COALESCE(EXCLUDED.sync_seen_generation,emails.sync_seen_generation),provider_deleted=false
     WHERE emails.user_id=p_user_id
   RETURNING id INTO v_email_id;
   IF v_email_id IS NULL THEN RAISE EXCEPTION 'Sync ownership conflict' USING ERRCODE='42501'; END IF;
   -- Preserve attachment IDs across replays; remove only metadata no longer in the message.
   DELETE FROM public.attachments a WHERE a.email_id=v_email_id AND NOT EXISTS
     (SELECT 1 FROM jsonb_array_elements(item->'attachments') x WHERE x->>'part_key'=a.sync_part_key);
   FOR att IN SELECT value FROM jsonb_array_elements(item->'attachments') LOOP
     UPDATE public.attachments SET content_type=att->>'content_type',size=(att->>'size')::integer,
       content_id=att->>'content_id',is_inline=COALESCE((att->>'is_inline')::boolean,false)
       WHERE attachments.email_id=v_email_id AND sync_part_key=att->>'part_key';
     IF NOT FOUND THEN INSERT INTO public.attachments(email_id,filename,content_type,size,content_id,is_inline,sync_part_key)
       VALUES(v_email_id,att->>'filename',att->>'content_type',(att->>'size')::integer,att->>'content_id',COALESCE((att->>'is_inline')::boolean,false),att->>'part_key'); END IF;
   END LOOP;
 END LOOP;
 UPDATE public.emails SET provider_deleted=true,is_deleted=true WHERE user_id=p_user_id AND source_account_id=p_account_id
   AND sync_namespace=p_namespace AND original_uid IN (SELECT jsonb_array_elements_text(p_deleted));
 IF p_finalize THEN
   UPDATE public.emails SET provider_deleted=true,is_deleted=true WHERE user_id=p_user_id AND source_account_id=p_account_id
     AND original_uid IS NOT NULL AND sync_seen_generation IS DISTINCT FROM p_generation;
 END IF;
 UPDATE private.account_sync SET cursor=p_cursor,revision=revision+1 WHERE account_id=p_account_id AND user_id=p_user_id;
 RETURN p_revision+1;
END $$;

CREATE TABLE private.gmail_triage_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag text NOT NULL CHECK (flag IN ('archived','read','starred')),
  desired boolean NOT NULL,
  email_ids uuid[] NOT NULL,
  undo_of uuid UNIQUE REFERENCES private.gmail_triage_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX gmail_triage_recent ON private.gmail_triage_jobs(user_id,created_at DESC);

CREATE TABLE private.gmail_triage_items (
  job_id uuid NOT NULL REFERENCES private.gmail_triage_jobs(id) ON DELETE CASCADE,
  email_id uuid NOT NULL,
  account_id uuid NOT NULL,
  provider_id text NOT NULL,
  subject text NOT NULL,
  account_email text NOT NULL,
  flag text NOT NULL,
  desired boolean NOT NULL,
  expected boolean,
  expected_revision numeric(30,0),
  before_value boolean,
  before_revision numeric(30,0),
  receipt_revision numeric(30,0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','conflict','blocked','gone')),
  result text,
  lease uuid,
  lease_until timestamptz,
  PRIMARY KEY (job_id,email_id)
);
CREATE UNIQUE INDEX gmail_triage_pending_target ON private.gmail_triage_items(email_id,flag) WHERE state='pending';

ALTER TABLE private.gmail_triage_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gmail_triage_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gmail_triage_jobs,private.gmail_triage_items FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.gmail_triage_list(p_actor uuid,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('id',j.id,'flag',j.flag,'desired',j.desired,'undoOf',j.undo_of,
      'hasUndo',EXISTS(SELECT 1 FROM private.gmail_triage_jobs u WHERE u.undo_of=j.id),
      'items',(SELECT jsonb_agg(jsonb_build_object('emailId',i.email_id,'subject',i.subject,
        'account',i.account_email,'state',i.state,'result',i.result,
        'canUndo',i.state='verified' AND i.result='applied' AND i.before_value IS DISTINCT FROM i.desired)
        ORDER BY i.account_email,i.email_id) FROM private.gmail_triage_items i WHERE i.job_id=j.id))
    ORDER BY j.created_at DESC,j.id),'[]')
  FROM (SELECT * FROM private.gmail_triage_jobs
    WHERE user_id=p_actor AND (p_id IS NULL OR id=p_id)
    ORDER BY EXISTS(SELECT 1 FROM private.gmail_triage_items i
      WHERE i.job_id=gmail_triage_jobs.id AND i.state='pending') DESC,created_at DESC,id LIMIT 15) j
$$;

CREATE FUNCTION public.gmail_triage_create(p_actor uuid,p_id uuid,p_flag text,p_desired boolean,p_ids uuid[],p_undo uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job private.gmail_triage_jobs; parent private.gmail_triage_jobs; targets uuid[]; matched integer;
BEGIN
  -- Serialize creation and replay per actor. Network calls happen after this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('gmail-triage:'||p_actor::text,0));
  SELECT * INTO job FROM private.gmail_triage_jobs WHERE id=p_id AND user_id=p_actor;
  IF FOUND THEN
    IF job.undo_of IS DISTINCT FROM p_undo OR (p_undo IS NULL AND
      (job.flag,job.desired,job.email_ids) IS DISTINCT FROM (p_flag,p_desired,p_ids)) THEN RAISE SQLSTATE 'PT409'; END IF;
    RETURN job.id;
  END IF;
  IF p_undo IS NOT NULL THEN
    SELECT * INTO parent FROM private.gmail_triage_jobs WHERE id=p_undo AND user_id=p_actor AND undo_of IS NULL;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    SELECT id INTO p_id FROM private.gmail_triage_jobs WHERE undo_of=parent.id;
    IF FOUND THEN RETURN p_id; END IF;
    p_id := gen_random_uuid();
    IF EXISTS(SELECT 1 FROM private.gmail_triage_items WHERE job_id=parent.id AND state='pending') THEN RAISE SQLSTATE 'PT409'; END IF;
    SELECT array_agg(email_id ORDER BY email_id) INTO targets FROM private.gmail_triage_items
      WHERE job_id=parent.id AND state='verified' AND result='applied' AND before_value IS DISTINCT FROM desired;
    IF targets IS NULL THEN RAISE SQLSTATE 'PT409'; END IF;
    INSERT INTO private.gmail_triage_jobs(id,user_id,flag,desired,email_ids,undo_of)
      VALUES(p_id,p_actor,parent.flag,NOT parent.desired,targets,parent.id);
    INSERT INTO private.gmail_triage_items(job_id,email_id,account_id,provider_id,subject,account_email,
      flag,desired,expected,expected_revision)
      SELECT p_id,email_id,account_id,provider_id,subject,account_email,flag,before_value,desired,receipt_revision
      FROM private.gmail_triage_items WHERE job_id=parent.id AND email_id=ANY(targets);
    RETURN p_id;
  END IF;

  IF cardinality(p_ids) IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 50 OR
    cardinality(p_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_ids) AS id) THEN RAISE SQLSTATE '22023'; END IF;
  INSERT INTO private.gmail_triage_jobs(id,user_id,flag,desired,email_ids) VALUES(p_id,p_actor,p_flag,p_desired,p_ids);
  INSERT INTO private.gmail_triage_items(job_id,email_id,account_id,provider_id,subject,account_email,flag,desired,expected)
    SELECT p_id,e.id,a.id,e.original_uid,coalesce(e.subject,'(Không có tiêu đề)'),a.email_address,p_flag,p_desired,
      coalesce((e.sync_provider_flags->>p_flag)::boolean,
        CASE p_flag WHEN 'archived' THEN e.is_archived WHEN 'read' THEN e.is_read WHEN 'starred' THEN e.is_starred END)
    FROM public.emails e JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=e.user_id
    WHERE e.user_id=p_actor AND e.id=ANY(p_ids) AND e.sync_namespace='gmail'
      AND length(e.original_uid) BETWEEN 1 AND 256 AND e.original_uid ~ '^[A-Za-z0-9_-]+$' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND a.is_active AND a.auth_type='oauth_google';
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched<>cardinality(p_ids) THEN RAISE SQLSTATE 'PT404'; END IF;
  RETURN p_id;
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409';
END $$;

CREATE FUNCTION public.gmail_triage_claim(p_actor uuid,p_job uuid,p_email uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item private.gmail_triage_items;
BEGIN
  UPDATE private.gmail_triage_items i SET lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '45 seconds'
    FROM private.gmail_triage_jobs j
    WHERE j.id=p_job AND j.user_id=p_actor AND i.job_id=j.id AND i.email_id=p_email
      AND i.state='pending' AND (i.lease_until IS NULL OR i.lease_until<=clock_timestamp())
    RETURNING i.* INTO item;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.emails e JOIN public.source_accounts a
      ON a.id=e.source_account_id AND a.user_id=e.user_id
      WHERE e.id=item.email_id AND e.user_id=p_actor AND e.source_account_id=item.account_id
        AND e.original_uid=item.provider_id AND e.sync_namespace='gmail' AND NOT e.provider_deleted
        AND e.is_deleted IS NOT TRUE AND a.is_active AND a.auth_type='oauth_google') THEN
    UPDATE private.gmail_triage_items SET state='gone',lease=NULL,lease_until=NULL
      WHERE job_id=p_job AND email_id=p_email;
    RETURN NULL;
  END IF;
  RETURN to_jsonb(item) || jsonb_build_object('before_revision',item.before_revision::text,
    'receipt_revision',item.receipt_revision::text,'expected_revision',item.expected_revision::text);
END $$;

CREATE FUNCTION public.gmail_triage_record(p_actor uuid,p_job uuid,p_email uuid,p_lease uuid,p_step text,
  p_revision text DEFAULT NULL,p_before boolean DEFAULT NULL,p_flags jsonb DEFAULT NULL,p_result text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item private.gmail_triage_items; revision numeric;
BEGIN
  SELECT i.* INTO item FROM private.gmail_triage_items i JOIN private.gmail_triage_jobs j ON j.id=i.job_id
    WHERE j.id=p_job AND j.user_id=p_actor AND i.email_id=p_email AND i.lease=p_lease
      AND i.lease_until>clock_timestamp() AND i.state='pending' FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_revision IS NOT NULL AND p_revision !~ '^[0-9]{1,30}$' THEN RAISE SQLSTATE '22023'; END IF;
  revision := p_revision::numeric;
  IF p_step='before' AND revision IS NOT NULL AND p_before IS NOT NULL AND item.before_revision IS NULL THEN
    UPDATE private.gmail_triage_items SET before_value=p_before,before_revision=revision
      WHERE job_id=p_job AND email_id=p_email;
    RETURN;
  END IF;
  IF p_step='receipt' AND revision>item.before_revision THEN
    UPDATE private.gmail_triage_items SET receipt_revision=revision WHERE job_id=p_job AND email_id=p_email;
    RETURN;
  END IF;
  IF p_step NOT IN ('pending','verified','conflict','blocked','gone') OR p_step IS NULL THEN RAISE SQLSTATE '22023'; END IF;
  IF p_flags IS NOT NULL THEN
    IF revision IS NULL OR jsonb_typeof(p_flags->'archived') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_flags->'read') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_flags->'starred') IS DISTINCT FROM 'boolean'
      OR (p_step='verified' AND (p_flags->>item.flag)::boolean IS DISTINCT FROM item.desired) THEN RAISE SQLSTATE '22023'; END IF;
    UPDATE public.emails e SET
      is_archived=CASE WHEN item.flag='archived' OR e.is_archived IS NOT DISTINCT FROM (e.sync_provider_flags->>'archived')::boolean
        THEN (p_flags->>'archived')::boolean ELSE e.is_archived END,
      is_read=CASE WHEN item.flag='read' OR e.is_read IS NOT DISTINCT FROM (e.sync_provider_flags->>'read')::boolean
        THEN (p_flags->>'read')::boolean ELSE e.is_read END,
      is_starred=CASE WHEN item.flag='starred' OR e.is_starred IS NOT DISTINCT FROM (e.sync_provider_flags->>'starred')::boolean
        THEN (p_flags->>'starred')::boolean ELSE e.is_starred END,
      sync_provider_flags=coalesce(e.sync_provider_flags,'{}')||p_flags,gmail_label_revision=revision
    WHERE e.user_id=p_actor AND e.id=p_email AND e.source_account_id=item.account_id AND e.original_uid=item.provider_id
      AND e.sync_namespace='gmail' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND (e.gmail_label_revision IS NULL OR e.gmail_label_revision<=revision);
    IF NOT FOUND THEN p_step:='conflict'; p_result:=NULL; END IF;
  END IF;
  IF p_result='applied' AND (item.receipt_revision IS NULL OR item.receipt_revision IS DISTINCT FROM revision) THEN
    RAISE SQLSTATE '22023';
  END IF;
  UPDATE private.gmail_triage_items SET state=p_step,result=p_result,lease=NULL,lease_until=NULL
    WHERE job_id=p_job AND email_id=p_email;
END $$;

REVOKE ALL ON FUNCTION public.gmail_triage_list(uuid,uuid),
  public.gmail_triage_create(uuid,uuid,text,boolean,uuid[],uuid),public.gmail_triage_claim(uuid,uuid,uuid),
  public.gmail_triage_record(uuid,uuid,uuid,uuid,text,text,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gmail_triage_list(uuid,uuid),
  public.gmail_triage_create(uuid,uuid,text,boolean,uuid[],uuid),public.gmail_triage_claim(uuid,uuid,uuid),
  public.gmail_triage_record(uuid,uuid,uuid,uuid,text,text,boolean,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
