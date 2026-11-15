BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.source_accounts ADD CONSTRAINT source_accounts_id_owner_unique UNIQUE(id,user_id);

-- Existing trigger also runs inside the vault's empty-search-path transaction.
CREATE OR REPLACE FUNCTION public.auto_set_primary_account()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.source_accounts
   WHERE user_id=NEW.user_id AND is_primary=true AND id<>NEW.id) THEN
   NEW.is_primary := true;
 END IF;
 RETURN NEW;
END;
$$;

CREATE FUNCTION private.valid_credential_envelope(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT value IS NOT NULL AND jsonb_typeof(value)='object'
 AND value - ARRAY['v','alg','kid','iv','tag','ct'] = '{}'::jsonb
 AND value->>'v'='1' AND value->>'alg'='A256GCM'
 AND jsonb_typeof(value->'v')='number' AND jsonb_typeof(value->'alg')='string'
 AND jsonb_typeof(value->'kid')='string' AND jsonb_typeof(value->'iv')='string'
 AND jsonb_typeof(value->'tag')='string' AND jsonb_typeof(value->'ct')='string'
 AND value->>'kid' ~ '^[A-Za-z0-9_-]{1,48}$'
 AND value->>'iv' ~ '^[A-Za-z0-9_-]{16}$' AND value->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
 AND length(value->>'ct') BETWEEN 1 AND 65536 AND value->>'ct' ~ '^[A-Za-z0-9_-]+$'
$$;
CREATE TABLE private.account_credentials (
 account_id uuid PRIMARY KEY, user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('imap','google')),
 envelope jsonb NOT NULL CHECK(private.valid_credential_envelope(envelope) IS TRUE),
 revision integer NOT NULL CHECK(revision>0),
 backup_kind text CHECK(backup_kind IN ('imap','google')), backup_envelope jsonb,
 last_operation text NOT NULL CHECK(last_operation IN ('write','migrate','rotate','restore')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE,
 CHECK ((backup_envelope IS NULL AND backup_kind IS NULL) OR
   (backup_kind IS NOT NULL AND private.valid_credential_envelope(backup_envelope) IS TRUE))
);
CREATE TABLE private.legacy_account_credentials (
 account_id uuid PRIMARY KEY, user_id uuid NOT NULL, packet jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE
);
ALTER TABLE private.account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.legacy_account_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

-- Atomic quarantine: never expose old secrets while waiting for application-side AEAD migration.
INSERT INTO private.legacy_account_credentials(account_id,user_id,packet)
SELECT id,user_id,jsonb_build_object(
 'access_token',access_token,'refresh_token',refresh_token,'oauth_access_token',oauth_access_token,
 'oauth_refresh_token',oauth_refresh_token,'password_encrypted',password_encrypted,'email_password',email_password,
 'token_expires_at',token_expires_at,'oauth_expires_at',oauth_expires_at,'oauth_scope',oauth_scope)
FROM public.source_accounts
WHERE COALESCE(access_token,refresh_token,oauth_access_token,oauth_refresh_token,password_encrypted,email_password) IS NOT NULL;
ALTER TABLE public.source_accounts DROP COLUMN access_token, DROP COLUMN refresh_token,
 DROP COLUMN oauth_access_token, DROP COLUMN oauth_refresh_token, DROP COLUMN password_encrypted, DROP COLUMN email_password;

CREATE FUNCTION public.read_account_credential(p_user_id uuid,p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'Account not found' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_build_object('kind',kind,'envelope',envelope,'revision',revision,
   'backup_kind',backup_kind,'backup_envelope',backup_envelope) FROM private.account_credentials
   WHERE account_id=p_account_id AND user_id=p_user_id),
   (SELECT jsonb_build_object('legacy',packet,'revision',0) FROM private.legacy_account_credentials
   WHERE account_id=p_account_id AND user_id=p_user_id));
END;
$$;

CREATE FUNCTION public.store_account_credential(p_user_id uuid,p_account_id uuid,p_kind text,p_envelope jsonb,
 p_expected_revision integer,p_metadata jsonb DEFAULT NULL,p_operation text DEFAULT 'write',
 p_backup_kind text DEFAULT NULL,p_backup_envelope jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_row private.account_credentials; owner_row public.source_accounts; next_revision integer;
BEGIN
 SELECT * INTO owner_row FROM public.source_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN
   IF p_metadata IS NULL OR p_operation<>'write' OR p_expected_revision<>0 THEN
     RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
   INSERT INTO public.source_accounts(id,user_id,email_address,display_name,provider,username,
     imap_host,imap_port,imap_secure,smtp_host,smtp_port,smtp_secure,avatar_url,is_active)
   VALUES(p_account_id,p_user_id,p_metadata->>'email_address',p_metadata->>'display_name',p_metadata->>'provider',p_metadata->>'username',
     p_metadata->>'imap_host',COALESCE((p_metadata->>'imap_port')::integer,993),COALESCE((p_metadata->>'imap_secure')::boolean,true),
     p_metadata->>'smtp_host',COALESCE((p_metadata->>'smtp_port')::integer,587),COALESCE((p_metadata->>'smtp_secure')::boolean,false),
     p_metadata->>'avatar_url',false) RETURNING * INTO owner_row;
 END IF;
 IF owner_row.user_id<>p_user_id OR (p_metadata ? 'email_address' AND p_metadata->>'email_address'<>owner_row.email_address) THEN
   RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_row FROM private.account_credentials WHERE account_id=p_account_id AND user_id=p_user_id;
 IF COALESCE(current_row.revision,0)<>p_expected_revision THEN
   RAISE EXCEPTION 'Credential conflict' USING ERRCODE='PT409'; END IF;
 IF p_operation NOT IN ('write','migrate','rotate','restore') OR
    (p_operation IN ('rotate','restore') AND current_row.account_id IS NULL) THEN
   RAISE EXCEPTION 'Invalid credential operation' USING ERRCODE='22023'; END IF;
 next_revision := p_expected_revision+1;
 INSERT INTO private.account_credentials(account_id,user_id,kind,envelope,revision,backup_kind,backup_envelope,last_operation)
 VALUES(p_account_id,p_user_id,p_kind,p_envelope,next_revision,
   CASE WHEN p_operation IN ('rotate','restore') THEN p_backup_kind ELSE current_row.kind END,
   CASE WHEN p_operation IN ('rotate','restore') THEN p_backup_envelope ELSE current_row.envelope END,p_operation)
 ON CONFLICT(account_id) DO UPDATE SET kind=EXCLUDED.kind,envelope=EXCLUDED.envelope,revision=EXCLUDED.revision,
   backup_kind=EXCLUDED.backup_kind,backup_envelope=EXCLUDED.backup_envelope,last_operation=EXCLUDED.last_operation,updated_at=now();
 DELETE FROM private.legacy_account_credentials WHERE account_id=p_account_id AND user_id=p_user_id;
 UPDATE public.source_accounts SET auth_type=CASE WHEN p_kind='google' THEN 'oauth_google' ELSE 'imap' END,
   provider=CASE WHEN p_kind='google' THEN 'gmail' ELSE provider END,
   is_active=CASE WHEN p_operation='write' AND p_metadata IS NOT NULL THEN true ELSE is_active END,
   sync_status=CASE WHEN p_operation='write' AND p_metadata IS NOT NULL THEN 'idle' ELSE sync_status END,
   sync_error=CASE WHEN p_operation='write' AND p_metadata IS NOT NULL THEN NULL ELSE sync_error END,
   display_name=COALESCE(p_metadata->>'display_name',display_name),avatar_url=COALESCE(p_metadata->>'avatar_url',avatar_url)
 WHERE id=p_account_id AND user_id=p_user_id;
 RETURN next_revision;
END;
$$;

CREATE FUNCTION public.list_credential_jobs(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(account_id uuid,user_id uuid,revision integer,key_id text,backup_key_id text,legacy boolean)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.user_id,COALESCE(v.revision,0),v.envelope->>'kid',v.backup_envelope->>'kid',l.account_id IS NOT NULL
 FROM public.source_accounts a LEFT JOIN private.account_credentials v ON v.account_id=a.id AND v.user_id=a.user_id
 LEFT JOIN private.legacy_account_credentials l ON l.account_id=a.id AND l.user_id=a.user_id
 WHERE (p_after IS NULL OR a.id>p_after) AND (v.account_id IS NOT NULL OR l.account_id IS NOT NULL)
 ORDER BY a.id LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
REVOKE ALL ON FUNCTION public.read_account_credential(uuid,uuid),
 public.store_account_credential(uuid,uuid,text,jsonb,integer,jsonb,text,text,jsonb),
 public.list_credential_jobs(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_credential(uuid,uuid),
 public.store_account_credential(uuid,uuid,text,jsonb,integer,jsonb,text,text,jsonb),
 public.list_credential_jobs(uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
