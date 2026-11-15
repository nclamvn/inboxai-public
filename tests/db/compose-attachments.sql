BEGIN;
UPDATE public.registration_policy SET enabled=true;

DO $$
DECLARE
  actor uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  account uuid := gen_random_uuid();
  first_file jsonb;
  second_file jsonb;
  draft jsonb;
  input jsonb;
  payload jsonb;
  approval jsonb;
  receipt jsonb;
  sent_id uuid;
  sent_files jsonb;
  download_id uuid;
  fields jsonb := '{"to":"recipient@example.test","cc":"","subject":"SMTP fixture","body":"With files"}';
  digest text := repeat('d',64);
BEGIN
  IF has_table_privilege('authenticated','private.mail_files','SELECT')
    OR has_function_privilege('authenticated','public.read_compose_files(uuid,uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','public.store_compose_file(uuid,text,text,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.read_sent_mail_file(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'attachment privileges too broad'; END IF;

  INSERT INTO auth.users(id,email) VALUES(actor,'attachment-owner@example.test'),(stranger,'attachment-foreign@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(account,actor,'attachment-smtp@example.test','custom');
  first_file := public.store_compose_file(actor,'report.dat','application/octet-stream','AAEC');
  second_file := public.store_compose_file(actor,'report.dat','application/octet-stream','AgEA');

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  draft := public.save_file_compose(NULL,NULL,account,NULL,fields,ARRAY[(second_file->>'id')::uuid,(first_file->>'id')::uuid]);
  IF draft->'files' <> jsonb_build_array(second_file,first_file) THEN RAISE EXCEPTION 'file order was lost'; END IF;
  input := jsonb_build_object('sourceAccountId',account,'subject','SMTP fixture','text','With files',
    'to',jsonb_build_array('recipient@example.test'),'cc','[]'::jsonb,'bcc','[]'::jsonb,
    'attachmentIds',jsonb_build_array(second_file->>'id',first_file->>'id'));
  PERFORM public.prepare_file_compose(actor,(draft->>'id')::uuid,1,input,digest);
  approval := public.read_file_compose_approval(actor,(draft->>'id')::uuid);
  payload := (input - 'sourceAccountId' - 'attachmentIds') || '{"from":{"address":"attachment-smtp@example.test"}}';
  BEGIN
    PERFORM public.begin_file_compose(actor,account,(draft->>'id')::uuid,(approval->>'key')::uuid,digest,
      payload || jsonb_build_object('attachments',jsonb_build_array(first_file,second_file)));
    RAISE EXCEPTION 'reordered attachments won dispatch';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  payload := payload || jsonb_build_object('attachments',draft->'files');
  receipt := public.begin_file_compose(actor,account,(draft->>'id')::uuid,(approval->>'key')::uuid,digest,payload);
  IF NOT (receipt->>'claimed')::boolean THEN RAISE EXCEPTION 'SMTP draft did not claim dispatch'; END IF;
  PERFORM public.finish_mail_send(actor,account,(receipt->>'id')::uuid,'partial');
  PERFORM public.finish_mail_send(actor,account,(receipt->>'id')::uuid,'partial');
  SELECT id INTO STRICT sent_id FROM public.emails
    WHERE user_id=actor AND message_id=receipt->>'messageId' AND attachment_count=2 AND send_status='partial';
  sent_files := public.list_sent_mail_files(sent_id);
  download_id := (sent_files->0->>'id')::uuid;
  IF jsonb_array_length(sent_files) IS DISTINCT FROM 2 OR
    public.read_sent_mail_file(download_id)->>'data' IS DISTINCT FROM 'AgEA'
  THEN RAISE EXCEPTION 'SMTP Sent mirror did not retain the exact ordered bytes'; END IF;

  PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
  IF public.read_sent_mail_file(download_id) IS NOT NULL OR public.list_sent_mail_files(sent_id) IS NOT NULL
  THEN RAISE EXCEPTION 'cross-tenant file read allowed'; END IF;
  BEGIN
    PERFORM public.read_file_compose((draft->>'id')::uuid);
    RAISE EXCEPTION 'cross-tenant draft read allowed';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;

ROLLBACK;
SELECT 'PASS: immutable file order, SMTP partial Sent mirror, replay and tenant isolation' AS result;
