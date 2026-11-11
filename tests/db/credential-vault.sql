BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='source_accounts'
   AND column_name IN ('access_token','refresh_token','oauth_access_token','oauth_refresh_token','password_encrypted','email_password')) THEN
   RAISE EXCEPTION 'public secret columns remain'; END IF;
 IF (SELECT count(*) FROM private.legacy_account_credentials WHERE account_id='91000000-0000-0000-0000-000000000001')<>1 THEN
   RAISE EXCEPTION 'legacy packet not preserved'; END IF;
 IF has_schema_privilege('anon','private','USAGE') OR has_schema_privilege('authenticated','private','USAGE')
   OR has_schema_privilege('service_role','private','USAGE') THEN RAISE EXCEPTION 'private schema grants too broad'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.read_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'anonymous RPC allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.source_accounts)<>1 THEN RAISE EXCEPTION 'own metadata inaccessible'; END IF;
 IF (SELECT row_to_json(a)::text FROM public.source_accounts a LIMIT 1) LIKE '%synthetic-legacy%' THEN RAISE EXCEPTION 'metadata leaks credentials'; END IF;
 BEGIN
   PERFORM 1 FROM private.legacy_account_credentials;
   RAISE EXCEPTION 'owner can read private legacy secrets';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM * FROM public.list_credential_jobs();
   RAISE EXCEPTION 'owner can enumerate vault';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.read_account_credential(auth.uid(),'91000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'owner can call secret RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT (public.read_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001') ? 'legacy') THEN
   RAISE EXCEPTION 'server cannot read quarantined legacy packet'; END IF;
 BEGIN
   PERFORM public.read_account_credential('00000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'server RPC ignored tenant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.store_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',
     'google','{"password":"must-not-store"}',0,NULL,'migrate');
   RAISE EXCEPTION 'malformed envelope accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   PERFORM public.store_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000099',
     'imap','{}',0,'{"email_address":"failed-atomic@example.test","provider":"custom"}');
   RAISE EXCEPTION 'invalid new account envelope accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE envelope jsonb := '{"v":1,"alg":"A256GCM","kid":"local1","iv":"AAAAAAAAAAAAAAAA","tag":"AAAAAAAAAAAAAAAAAAAAAA","ct":"AA"}'; BEGIN
 PERFORM public.store_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000088',
   'imap',envelope,0,'{"email_address":"valid-atomic@example.test","provider":"custom"}');
 PERFORM public.store_account_credential('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000088',
   'imap',envelope,1);
 IF NOT EXISTS(SELECT 1 FROM private.account_credentials WHERE revision=2 AND account_id='91000000-0000-0000-0000-000000000088') THEN
   RAISE EXCEPTION 'valid atomic write missing'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.legacy_account_credentials WHERE account_id='91000000-0000-0000-0000-000000000001')<>1 THEN
   RAISE EXCEPTION 'failed migration destroyed legacy data'; END IF;
 IF EXISTS(SELECT 1 FROM public.source_accounts WHERE id='91000000-0000-0000-0000-000000000099') THEN
   RAISE EXCEPTION 'atomic account write left orphan metadata'; END IF;
END $$;
DELETE FROM public.source_accounts WHERE id='91000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.legacy_account_credentials WHERE account_id='91000000-0000-0000-0000-000000000001') THEN
   RAISE EXCEPTION 'account deletion orphaned legacy credentials'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: private grants, dropped public columns, tenant RPC, atomic failure rollback, legacy quarantine and cascade' AS result;
