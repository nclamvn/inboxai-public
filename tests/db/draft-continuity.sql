BEGIN;
UPDATE public.registration_policy SET enabled=true;

DO $$
DECLARE
  actor uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  account uuid := gen_random_uuid(); other_account uuid := gen_random_uuid();
  source uuid := gen_random_uuid(); client uuid := gen_random_uuid();
  saved jsonb; reply jsonb; mail_file uuid; fingerprint text; result jsonb;
  fields jsonb := '{"to":"one@example.test","cc":"","subject":"Gá thử tải","body":"Chờ biên bản."}';
BEGIN
  IF has_function_privilege('anon','public.list_mail_drafts(uuid,timestamptz,uuid)','EXECUTE')
    OR has_function_privilege('service_role','public.create_file_compose_once(uuid,uuid,uuid,jsonb,uuid[])','EXECUTE')
    OR has_table_privilege('authenticated','private.file_compose_creations','SELECT')
  THEN RAISE EXCEPTION 'draft privileges too broad'; END IF;

  INSERT INTO auth.users(id,email) VALUES(actor,'draft-actor@example.test'),(stranger,'draft-stranger@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(account,actor,'draft-a@example.test','custom'),(other_account,stranger,'draft-b@example.test','custom');
  INSERT INTO public.emails(id,user_id,source_account_id,subject,from_address)
    VALUES(source,actor,account,'Biên bản','vendor@example.test');

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  saved := public.create_file_compose_once(client,account,NULL,fields,'{}');
  IF public.create_file_compose_once(client,account,NULL,fields,'{}') IS DISTINCT FROM saved
    OR jsonb_array_length(public.list_mail_drafts())<>1
  THEN RAISE EXCEPTION 'first save retry created a duplicate'; END IF;
  PERFORM public.save_file_compose((saved->>'id')::uuid,1,account,NULL,fields||'{"body":"Từ thiết bị khác"}','{}');
  IF public.create_file_compose_once(client,account,NULL,fields,'{}')#>>'{fields,body}' IS DISTINCT FROM 'Từ thiết bị khác'
  THEN RAISE EXCEPTION 'creation replay overwrote newer text'; END IF;
  PERFORM public.save_file_compose(NULL,NULL,account,source,fields,'{}');

  mail_file := (public.store_compose_file(actor,'proof.dat','application/octet-stream','AAEC')->>'id')::uuid;
  fingerprint := public.read_reply_workbench(source)->>'fingerprint';
  reply := public.save_reply_files(source,NULL,NULL,fingerprint,'vendor@example.test','','Đã nhận.',ARRAY[mail_file]);
  IF public.save_reply_files(source,NULL,NULL,fingerprint,'vendor@example.test','','Đã nhận.',ARRAY[mail_file]) IS DISTINCT FROM reply
  THEN RAISE EXCEPTION 'first reply retry failed'; END IF;
  BEGIN
    PERFORM public.save_reply_files(source,NULL,NULL,fingerprint,'vendor@example.test','','Đã nhận.','{}');
    RAISE EXCEPTION 'first reply overwrote existing attachments';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM public.change_reply_draft((reply->>'id')::uuid,'discard');
  reply := public.save_reply_files(source,NULL,NULL,fingerprint,'vendor@example.test','','Đã nhận.','{}');
  BEGIN
    PERFORM public.save_reply_files(source,NULL,NULL,fingerprint,'vendor@example.test','','Đã nhận.',ARRAY[mail_file]);
    RAISE EXCEPTION 'first reply overwrote an empty attachment set';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  result := public.list_mail_drafts(account);
  IF (SELECT array_agg(value->>'kind' ORDER BY value->>'kind') FROM jsonb_array_elements(result)) <>
     ARRAY['forward','new','reply'] OR (result->0 ? 'body')
     OR jsonb_array_length(public.list_mail_drafts(account,(result->0->>'updatedAt')::timestamptz,(result->0->>'id')::uuid))<>2
  THEN RAISE EXCEPTION 'incorrect scoped listing or cursor'; END IF;

  PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
  IF public.list_mail_drafts()<>'[]'::jsonb THEN RAISE EXCEPTION 'foreign draft summaries leaked'; END IF;
  BEGIN
    PERFORM public.list_mail_drafts(account);
    RAISE EXCEPTION 'foreign account accepted as filter';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF public.create_file_compose_once(client,other_account,NULL,fields,'{}')->>'id' = saved->>'id'
  THEN RAISE EXCEPTION 'creation keys crossed tenant boundaries'; END IF;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM public.change_file_compose((saved->>'id')::uuid,'discard');
  BEGIN
    PERFORM public.create_file_compose_once(client,account,NULL,fields,'{}');
    RAISE EXCEPTION 'discarded draft was recreated by a stale retry';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;
ROLLBACK;
SELECT 'PASS: draft creation replay, discarded keys, attachment conflicts, listing cursor and tenant boundaries' AS result;
