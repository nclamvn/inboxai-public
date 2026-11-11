BEGIN;
-- Legacy application code used this field without a corresponding migration.
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS body_fetched boolean NOT NULL DEFAULT false;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS content_id text,
 ADD COLUMN IF NOT EXISTS is_inline boolean NOT NULL DEFAULT false,
 ADD COLUMN sync_part_key text;
CREATE UNIQUE INDEX attachments_sync_part ON public.attachments(email_id,sync_part_key);
-- Existing trigger must also work inside the definer RPC's empty search path.
CREATE OR REPLACE FUNCTION public.update_phishing_risk()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.phishing_risk:=public.get_phishing_risk_level(NEW.phishing_score);
 RETURN NEW;
END $$;
-- Preserve legacy rows/evidence; rebaseline with trustworthy provider identities on first complete scan.
ALTER TABLE public.emails ADD COLUMN sync_namespace text NOT NULL DEFAULT 'legacy',
 ADD COLUMN sync_seen_generation uuid, ADD COLUMN sync_provider_flags jsonb, ADD COLUMN provider_deleted boolean NOT NULL DEFAULT false;
UPDATE public.emails SET sync_namespace='legacy:'||id::text WHERE source_account_id IS NOT NULL;
ALTER TABLE public.emails DROP CONSTRAINT emails_user_id_message_id_key;
CREATE UNIQUE INDEX emails_unconnected_message_key ON public.emails(user_id,message_id) WHERE source_account_id IS NULL;
CREATE UNIQUE INDEX emails_provider_identity ON public.emails(source_account_id,sync_namespace,original_uid);

CREATE TABLE private.account_sync (
 account_id uuid PRIMARY KEY,user_id uuid NOT NULL,provider text NOT NULL CHECK(provider IN ('gmail','imap')),
 cursor jsonb,revision integer NOT NULL DEFAULT 0,fence bigint NOT NULL DEFAULT 0,
 lease_id uuid,lease_until timestamptz,last_attempt timestamptz,failures integer NOT NULL DEFAULT 0,retry_at timestamptz,last_error text,
 FOREIGN KEY(account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE
);
ALTER TABLE private.account_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_sync FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.claim_account_sync(p_user_id uuid,p_account_id uuid,p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.source_accounts; state private.account_sync;
BEGIN
 SELECT * INTO account FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT account.is_active OR p_provider IS NULL OR p_provider NOT IN ('gmail','imap') OR
   (p_provider='gmail') IS DISTINCT FROM (account.auth_type='oauth_google') THEN
   RAISE EXCEPTION 'Sync account unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO private.account_sync(account_id,user_id,provider) VALUES(p_account_id,p_user_id,p_provider) ON CONFLICT DO NOTHING;
 SELECT * INTO state FROM private.account_sync WHERE account_id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF state.lease_until>clock_timestamp() OR state.retry_at>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE private.account_sync SET provider=p_provider,cursor=CASE WHEN provider=p_provider THEN cursor ELSE NULL END,
   last_attempt=clock_timestamp(),lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '150 seconds',fence=fence+1
 WHERE account_id=p_account_id AND user_id=p_user_id RETURNING * INTO state;
 UPDATE public.source_accounts SET sync_status='syncing',sync_error=NULL WHERE id=p_account_id AND user_id=p_user_id;
 RETURN jsonb_build_object('id',state.lease_id,'fence',state.fence,'revision',state.revision,'cursor',state.cursor);
END $$;

CREATE FUNCTION public.commit_account_sync_page(p_user_id uuid,p_account_id uuid,p_lease uuid,p_fence bigint,p_revision integer,
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
     subject,body_text,body_html,body_fetched,received_at,is_read,is_starred,is_archived,is_deleted,direction,attachment_count,sync_seen_generation,sync_provider_flags,provider_deleted)
   VALUES(p_user_id,p_account_id,p_namespace,item->>'uid',item->>'message_id',item->>'from_address',item->>'from_name',
     COALESCE(item->'to_addresses','[]'::jsonb),COALESCE(item->'cc_addresses','[]'::jsonb),
     item->>'subject',item->>'body_text',item->>'body_html',true,(item->>'received_at')::timestamptz,
     (item->>'is_read')::boolean,(item->>'is_starred')::boolean,(item->>'is_archived')::boolean,(item->>'is_deleted')::boolean,
     item->>'direction',jsonb_array_length(item->'attachments'),p_generation,
     jsonb_build_object('read',(item->>'is_read')::boolean,'starred',(item->>'is_starred')::boolean,'archived',(item->>'is_archived')::boolean,'deleted',(item->>'is_deleted')::boolean),false)
   ON CONFLICT(source_account_id,sync_namespace,original_uid) DO UPDATE SET
     message_id=EXCLUDED.message_id,from_address=EXCLUDED.from_address,from_name=EXCLUDED.from_name,to_addresses=EXCLUDED.to_addresses,
     cc_addresses=EXCLUDED.cc_addresses,subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,body_html=EXCLUDED.body_html,
     body_fetched=true,received_at=EXCLUDED.received_at,
     is_read=CASE WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'read' AND emails.is_read IS DISTINCT FROM (emails.sync_provider_flags->>'read')::boolean THEN emails.is_read ELSE EXCLUDED.is_read END,
     is_starred=CASE WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'starred' AND emails.is_starred IS DISTINCT FROM (emails.sync_provider_flags->>'starred')::boolean THEN emails.is_starred ELSE EXCLUDED.is_starred END,
     is_archived=CASE WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'archived' AND emails.is_archived IS DISTINCT FROM (emails.sync_provider_flags->>'archived')::boolean THEN emails.is_archived ELSE EXCLUDED.is_archived END,
     is_deleted=CASE WHEN NOT emails.provider_deleted AND emails.sync_provider_flags ? 'deleted' AND emails.is_deleted IS DISTINCT FROM (emails.sync_provider_flags->>'deleted')::boolean THEN emails.is_deleted ELSE EXCLUDED.is_deleted END,
     sync_provider_flags=EXCLUDED.sync_provider_flags,direction=EXCLUDED.direction,attachment_count=EXCLUDED.attachment_count,
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

CREATE FUNCTION public.release_account_sync(p_user_id uuid,p_account_id uuid,p_lease uuid,p_fence bigint,p_pending boolean,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state private.account_sync;
BEGIN
 PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync account unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO state FROM private.account_sync WHERE account_id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR state.lease_id IS DISTINCT FROM p_lease OR state.fence<>p_fence OR state.lease_until<=clock_timestamp() THEN
   RAISE EXCEPTION 'Sync lease conflict' USING ERRCODE='PT409'; END IF;
 IF p_error IS NOT NULL AND p_error NOT IN ('unavailable','conflict','provider','credentials','invalid','timeout') THEN
   RAISE EXCEPTION 'Invalid sync error' USING ERRCODE='22023'; END IF;
 UPDATE private.account_sync SET lease_id=NULL,lease_until=NULL,last_error=p_error,
   failures=CASE WHEN p_error IS NULL THEN 0 ELSE LEAST(failures+1,10) END,
   retry_at=CASE WHEN p_error IS NULL THEN NULL ELSE clock_timestamp()+make_interval(secs=>LEAST(300,5*power(2,LEAST(failures,6)))::integer) END
 WHERE account_id=p_account_id AND user_id=p_user_id;
 UPDATE public.source_accounts SET sync_status=CASE WHEN p_error IS NOT NULL THEN 'error' WHEN p_pending THEN 'pending' ELSE 'idle' END,
   sync_error=CASE WHEN p_error IS NULL THEN NULL ELSE 'Sync '||p_error END,
   last_sync_at=CASE WHEN p_error IS NULL AND NOT p_pending THEN clock_timestamp() ELSE last_sync_at END,
   total_emails_synced=(SELECT count(*) FROM public.emails WHERE user_id=p_user_id AND source_account_id=p_account_id AND NOT provider_deleted)
 WHERE id=p_account_id AND user_id=p_user_id;
END $$;
-- Service-only fair due-work selection: a failing/retrying account cannot monopolize the cron batch.
CREATE FUNCTION public.list_due_sync_accounts(p_limit integer DEFAULT 10,p_user_id uuid DEFAULT NULL,p_force boolean DEFAULT false)
RETURNS SETOF public.source_accounts LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT a.* FROM public.source_accounts a LEFT JOIN private.account_sync s ON s.account_id=a.id AND s.user_id=a.user_id
 WHERE a.is_active AND (p_user_id IS NULL OR a.user_id=p_user_id) AND (s.lease_until IS NULL OR s.lease_until<=clock_timestamp())
 AND (s.retry_at IS NULL OR s.retry_at<=clock_timestamp())
 AND (p_force OR a.sync_status IS DISTINCT FROM 'idle' OR a.last_sync_at IS NULL OR a.last_sync_at<clock_timestamp()-interval '1 minute')
 ORDER BY s.last_attempt ASC NULLS FIRST,a.id LIMIT LEAST(GREATEST(p_limit,1),50)
$$;
REVOKE ALL ON FUNCTION public.list_due_sync_accounts(integer,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_due_sync_accounts(integer,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.claim_account_sync(uuid,uuid,text),
 public.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean),
 public.release_account_sync(uuid,uuid,uuid,bigint,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_sync(uuid,uuid,text),
 public.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean),
 public.release_account_sync(uuid,uuid,uuid,bigint,boolean,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
