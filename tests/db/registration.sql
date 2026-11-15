BEGIN;
DO $$ BEGIN
 IF (SELECT enabled FROM public.registration_policy) THEN RAISE EXCEPTION 'registration open by default'; END IF;
 BEGIN
   INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'blocked@example.test');
   RAISE EXCEPTION 'direct Auth insert bypassed disabled policy';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.registration_policy SET enabled=true, mode='whitelist';
INSERT INTO public.whitelist(email) VALUES ('admitted@example.test');
INSERT INTO public.whitelist(email,is_active) VALUES ('revoked@example.test',false);
INSERT INTO public.access_requests(email,status) VALUES ('revoked@example.test','approved');
DO $$ BEGIN
 BEGIN
   INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'unlisted@example.test');
   RAISE EXCEPTION 'whitelist bypass allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'revoked@example.test');
   RAISE EXCEPTION 'revoked membership reactivated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'admitted@example.test');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
   UPDATE public.registration_policy SET enabled=true;
   RAISE EXCEPTION 'client can change policy';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.consume_registration_attempt(repeat('a',64),repeat('b',64));
   RAISE EXCEPTION 'client can invoke rate RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 FOR i IN 1..6 LOOP
   IF NOT public.consume_registration_attempt(repeat('a',64),repeat('b',64)) THEN RAISE EXCEPTION 'early email throttle'; END IF;
 END LOOP;
 IF public.consume_registration_attempt(repeat('a',64),repeat('b',64)) THEN RAISE EXCEPTION 'email throttle bypass'; END IF;
 FOR i IN 1..20 LOOP
   IF NOT public.consume_registration_attempt(repeat('c',64),md5(i::text)||md5(i::text)) THEN RAISE EXCEPTION 'early IP throttle'; END IF;
 END LOOP;
 IF public.consume_registration_attempt(repeat('c',64),repeat('d',64)) THEN RAISE EXCEPTION 'IP throttle bypass'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: default closed, native signup admission, whitelist, protected policy, shared rate limits' AS result;
