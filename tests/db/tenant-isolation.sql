\set ON_ERROR_STOP on
BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users (id,email) VALUES
 ('00000000-0000-0000-0000-000000000001','alice@example.test'),
 ('00000000-0000-0000-0000-000000000002','bob@example.test');
INSERT INTO public.source_accounts (id,user_id,email_address) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','alice@example.test'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','bob@example.test');
INSERT INTO public.emails (id,user_id,source_account_id,from_address) VALUES
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','source@example.test'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','source@example.test');
INSERT INTO public.whitelist (email) VALUES ('alice@example.test'), ('bob@example.test') ON CONFLICT(email) DO NOTHING;

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.emails) <> 0 OR (SELECT count(*) FROM public.source_accounts) <> 0
    OR (SELECT count(*) FROM public.whitelist) <> 0 THEN RAISE EXCEPTION 'anonymous read leaked'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"email":"alice@example.test"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.emails) <> 1 OR (SELECT count(*) FROM public.source_accounts) <> 1
    OR (SELECT count(*) FROM public.whitelist) <> 1 THEN RAISE EXCEPTION 'tenant read mismatch'; END IF;
  UPDATE public.emails SET subject='attack' WHERE id='20000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'foreign update allowed'; END IF;
  DELETE FROM public.source_accounts WHERE id='10000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'foreign delete allowed'; END IF;
  BEGIN
    INSERT INTO public.emails(user_id,from_address) VALUES ('00000000-0000-0000-0000-000000000002','attack@example.test');
    RAISE EXCEPTION 'foreign insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.emails(user_id,source_account_id,from_address) VALUES
      ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','attack@example.test');
    RAISE EXCEPTION 'foreign account reference allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.action_items(user_id,email_id,title) VALUES
      ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','attack');
    RAISE EXCEPTION 'foreign evidence reference allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.profiles SET is_admin=true WHERE id='00000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'self promotion allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_primary_account('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'cross-tenant RPC allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_primary_account('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'foreign primary account allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.profiles SET display_name='Alice Updated' WHERE id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'own profile update broken'; END IF;
  INSERT INTO public.action_items(user_id,email_id,title) VALUES
    (auth.uid(),'20000000-0000-0000-0000-000000000001','Own action');
  PERFORM public.set_primary_account(auth.uid(),'10000000-0000-0000-0000-000000000001');
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT is_admin FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001') THEN
   RAISE EXCEPTION 'admin flag changed'; END IF;
 IF (SELECT subject FROM public.emails WHERE id='20000000-0000-0000-0000-000000000002') IS NOT NULL THEN
   RAISE EXCEPTION 'foreign email changed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: synthetic anonymous/two-tenant SQL boundary scenarios' AS result;
