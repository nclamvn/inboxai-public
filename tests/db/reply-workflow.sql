BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000093','reply-workflow@example.test');

DO $$
DECLARE
  actor constant uuid := '00000000-0000-0000-0000-000000000093';
  own_account uuid := gen_random_uuid();
  other_account uuid := gen_random_uuid();
  source uuid := gen_random_uuid();
  linked uuid := gen_random_uuid();
  draft uuid;
  approval jsonb;
  receipt jsonb;
  sent_id text;
  sent_email uuid;
  context jsonb;
  input jsonb;
  payload jsonb;
  reminder jsonb;
BEGIN
  IF has_function_privilege('anon','public.read_email_conversation(uuid,timestamptz,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','private.email_conversation_members(public.emails)','EXECUTE')
    OR has_table_privilege('authenticated','private.reply_drafts','SELECT')
    OR has_function_privilege('anon','public.read_reply_workbench(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.prepare_reply_send(uuid,uuid,integer,jsonb,text)','EXECUTE')
    OR has_function_privilege('service_role','private.commit_account_sync_page(uuid,uuid,uuid,bigint,integer,jsonb,text,jsonb,jsonb,uuid,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'reply workflow privileges too broad'; END IF;

  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
  VALUES(own_account,actor,'buying@example.test','custom'),(other_account,actor,'finance@example.test','custom');
  INSERT INTO public.emails(id,user_id,source_account_id,message_id,subject,from_address,body_text)
  VALUES(source,actor,own_account,'<origin@example.test>','Đối chiếu','vendor@example.test','Bản gốc.');
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  context := public.read_reply_workbench(source);
  draft := (public.save_reply_draft(source,NULL,NULL,context->>'fingerprint','vendor@example.test','','Đã nhận.')->>'id')::uuid;
  input := jsonb_build_object('sourceAccountId',own_account,'replyToEmailId',source,'subject','Re: Đối chiếu',
    'text','Đã nhận.','to',jsonb_build_array('vendor@example.test'),'cc','[]'::jsonb,'bcc','[]'::jsonb);
  PERFORM public.prepare_reply_send(actor,draft,1,input,repeat('a',64));
  approval := public.read_reply_approval(actor,draft);
  payload := (input - 'sourceAccountId' - 'replyToEmailId') || '{"from":{"address":"buying@example.test"},"inReplyTo":"<origin@example.test>"}';
  BEGIN
    PERFORM public.begin_reply_send(actor,own_account,draft,(approval->>'key')::uuid,repeat('a',64),
      payload || '{"to":["finance@example.test"]}');
    RAISE EXCEPTION 'changed recipients claimed dispatch';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  receipt := public.begin_reply_send(actor,own_account,draft,(approval->>'key')::uuid,repeat('a',64),payload);
  PERFORM public.finish_mail_send(actor,own_account,(receipt->>'id')::uuid,'accepted');
  PERFORM public.change_reply_draft(draft,'track');
  sent_id := receipt->>'messageId';
  INSERT INTO public.emails(user_id,source_account_id,message_id,subject,from_address,reply_references)
  VALUES(actor,other_account,'<other-account@example.test>','Re: Đối chiếu','vendor@example.test',ARRAY[sent_id]);
  IF public.list_reply_work('{}')#>>'{0,status}' IS DISTINCT FROM 'waiting'
  THEN RAISE EXCEPTION 'other account fulfilled waiting item'; END IF;
  PERFORM public.schedule_reply_followup(draft,private.reply_followup_today(),NULL);
  reminder := public.read_reply_followup_preview(draft);
  IF public.list_reply_work('{}')#>>'{0,status}' IS DISTINCT FROM 'due'
  THEN RAISE EXCEPTION 'current appointment did not become due'; END IF;
  INSERT INTO public.emails(id,user_id,source_account_id,message_id,subject,from_address,reply_references)
  VALUES(linked,actor,own_account,'<referenced@example.test>','Re: Đối chiếu','vendor@example.test',ARRAY['<origin@example.test>',sent_id]);
  SELECT id INTO STRICT sent_email FROM public.emails
    WHERE user_id=actor AND source_account_id=own_account AND message_id=sent_id AND direction='outbound';
  context := public.read_email_conversation(source);
  IF jsonb_array_length(context->'messages')<>3
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(context->'messages') m WHERE m->>'id'=linked::text)
    OR public.read_email_conversation(sent_email)->>'replyId' IS NULL
  THEN RAISE EXCEPTION 'conversation lost a scoped RFC reference or the accepted sent mirror'; END IF;
  IF public.list_reply_work('{}')#>>'{0,replyId}' IS DISTINCT FROM linked::text
  THEN RAISE EXCEPTION 'References-only evidence failed to match'; END IF;
  BEGIN
    PERFORM public.begin_reply_followup(actor,own_account,draft,(reminder->>'key')::uuid,reminder->>'proof',
      reminder - ARRAY['key','proof','followupOn','accountId','sourceId']);
    RAISE EXCEPTION 'preview was claimed after a reply was committed';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM private.mail_send_operations WHERE request_key=(reminder->>'key')::uuid)
  THEN RAISE EXCEPTION 'a rejected claim left a send operation'; END IF;
END $$;

SELECT 'PASS: Reply approval freezes recipients and References matches only in the sending account';
SELECT 'PASS: Due reminder cannot be claimed once a matching reply is committed';
SELECT 'PASS: Conversation honors account scope and links legacy references and confirmed outbound receipts';
ROLLBACK;
