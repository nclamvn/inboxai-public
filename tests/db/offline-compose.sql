BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  account uuid := gen_random_uuid(); file uuid := gen_random_uuid(); command uuid := gen_random_uuid();
  fields jsonb := '{"to":"recipient@example.test","cc":"","subject":"Thư từ thiết bị","body":"Dữ liệu giả lập."}';
  stored jsonb; draft jsonb;
BEGIN
  IF has_function_privilege('authenticated','public.store_device_compose_file(uuid,uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.read_file_compose_creation(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'device compose grants are too broad';
  END IF;
  INSERT INTO auth.users(id,email) VALUES(actor,'device-compose@example.test'),(stranger,'other-compose@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(account,actor,'device-account@example.test','custom');
  stored := public.store_device_compose_file(actor,file,'proof.bin','application/octet-stream','AAEC');
  IF stored IS DISTINCT FROM public.store_device_compose_file(actor,file,'proof.bin','application/octet-stream','AAEC')
  THEN RAISE EXCEPTION 'same upload did not replay'; END IF;
  BEGIN
    PERFORM public.store_device_compose_file(actor,file,'proof.bin','application/octet-stream','AgEA');
    RAISE EXCEPTION 'changed bytes overwrote existing file';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.store_device_compose_file(stranger,file,'proof.bin','application/octet-stream','AAEC');
    RAISE EXCEPTION 'second tenant claimed file';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF public.read_file_compose_creation(command) IS NOT NULL THEN RAISE EXCEPTION 'missing command returned a draft'; END IF;
  draft := public.create_file_compose_once(command,account,NULL,fields,ARRAY[file]);
  IF public.read_file_compose_creation(command) IS DISTINCT FROM draft THEN RAISE EXCEPTION 'lost receipt cannot be found'; END IF;
  PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
  IF public.read_file_compose_creation(command) IS NOT NULL THEN RAISE EXCEPTION 'foreign command returned a draft'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM public.change_file_compose((draft->>'id')::uuid,'discard');
  BEGIN
    PERFORM public.read_file_compose_creation(command);
    RAISE EXCEPTION 'deleted draft receipt can resurrect';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;
ROLLBACK;
SELECT 'PASS: exact device upload replay, immutable bytes, private file ownership and creation receipt' AS result;
