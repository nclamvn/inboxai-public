BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  buyer uuid:=gen_random_uuid();
  reviewer uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  po uuid:=gen_random_uuid();
  invoice uuid:=gen_random_uuid();
  handoff uuid:=gen_random_uuid();
  decision uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid();
  mailbox uuid:=gen_random_uuid();
  alternate_mailbox uuid:=gen_random_uuid();
  source uuid:=gen_random_uuid();
  response uuid:=gen_random_uuid();
  draft uuid;
  next_draft uuid;
  approval jsonb;
  envelope jsonb;
  receipt jsonb;
  reminder jsonb;
  command jsonb;
  result jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (buyer,'buyer-exception-sql@example.test',now()),(reviewer,'reviewer-exception-sql@example.test',now()),
    (outsider,'outsider-exception-sql@example.test',now());
  INSERT INTO private.commitments(id,user_id,reference_key,version,detection_reference)
  VALUES(po,buyer,'exception-sql-po',1,'PO-914');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
  VALUES(mailbox,buyer,'buying-request@example.test','custom'),(alternate_mailbox,buyer,'other-request@example.test','custom');
  INSERT INTO public.emails(id,user_id,source_account_id,message_id,subject,from_address,body_text)
  VALUES(source,buyer,mailbox,'<invoice-request@example.test>','[PO-914] Hóa đơn','vendor@example.test','Hóa đơn gốc.');
  INSERT INTO private.commitment_revisions(user_id,commitment_id,version,request_key,request_hash,kind,state,changed_fields,anchors)
  VALUES(buyer,po,1,gen_random_uuid(),sha256('exception-test'::bytea),'created','{"status":"open"}','{}','[{"field":"subject"}]');
  INSERT INTO private.purchase_payment_documents(id,user_id,commitment_id,kind,number,email_id,attachment_id,filename,binding,digest,source_at,lines)
  VALUES(invoice,buyer,po,'invoice','INV-914',source,gen_random_uuid(),'invoice.csv','binding','digest','2026-08-01Z',
    '[{"row":2,"code":"A","quantity":2,"unit":"bộ","price":100}]');
  INSERT INTO private.purchase_payment_decisions(id,user_id,commitment_id,invoice_id,proof,approved_by)
  VALUES(decision,buyer,po,invoice,'proof',reviewer);
  INSERT INTO private.purchase_handoff_orders VALUES(buyer,po);
  INSERT INTO private.purchase_handoffs(id,owner_id,commitment_id,invoice_id,reviewer_id,reviewer_label,proof,reference,invoice_number,status)
  VALUES(handoff,buyer,po,invoice,reviewer,'reviewer-exception-sql@example.test','proof','PO-914','INV-914','approved');
  INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action,decision_id)
  VALUES(handoff,reviewer,'reviewer-exception-sql@example.test','approve',decision);

  command:=jsonb_build_object('action','request_evidence','handoffId',handoff,'reason','Nguồn hóa đơn không còn kiểm chứng được.');
  BEGIN
    PERFORM public.confirm_purchase_handoff(outsider,gen_random_uuid(),command);
    RAISE EXCEPTION 'Outsider created request';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  result:=public.confirm_purchase_handoff(reviewer,request_id,command);
  IF result->>'action' IS DISTINCT FROM 'request_evidence' OR result->>'replayed' IS DISTINCT FROM 'false'
    OR public.confirm_purchase_handoff(reviewer,request_id,command)->>'replayed' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'Opening the exception did not return a stable receipt'; END IF;
  BEGIN
    PERFORM public.confirm_purchase_handoff(reviewer,gen_random_uuid(),command);
    RAISE EXCEPTION 'Second independent request created another exception';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;
  IF (SELECT count(*) FROM private.purchase_due_exception_events WHERE origin_handoff=handoff)<>1
    OR (SELECT count(*) FROM private.purchase_payment_decisions WHERE user_id=buyer AND commitment_id=po)<>1
  THEN RAISE EXCEPTION 'Exception opening changed the ledger or recorded a duplicate event'; END IF;

  PERFORM set_config('request.jwt.claim.sub',buyer::text,true);
  result:=public.read_purchase_handoff_owner(po,invoice);
  IF result#>>'{exception,stage}' IS DISTINCT FROM 'buyer'
    OR result#>>'{exception,events,0,reason}' IS DISTINCT FROM command->>'reason' THEN
    RAISE EXCEPTION 'Buyer cannot trace the active request';
  END IF;
  result:=public.list_purchase_focus('{}');
  IF jsonb_array_length(result)<>1 OR result#>>'{0,task}' IS DISTINCT FROM 'supply'
    OR result#>>'{0,invoiceId}' IS DISTINCT FROM invoice::text
    OR result#>>'{0,emailId}' IS NOT NULL OR result#>>'{0,reason}' IS DISTINCT FROM command->>'reason'
    OR public.list_purchase_focus(ARRAY[gen_random_uuid()]) IS DISTINCT FROM '[]'::jsonb
  THEN RAISE EXCEPTION 'Inbox focus disclosed missing evidence, ignored account scope or lost the task'; END IF;

  result:=public.prepare_purchase_evidence_request(handoff);
  draft:=(result#>>'{request,draftId}')::uuid;
  IF draft IS NULL OR result#>>'{request,sourceId}' IS DISTINCT FROM source::text
    OR public.prepare_purchase_evidence_request(handoff)#>>'{request,draftId}' IS DISTINCT FROM draft::text
  THEN RAISE EXCEPTION 'Evidence request did not reuse its owned draft'; END IF;
  SELECT jsonb_build_object('sourceAccountId',mailbox,'replyToEmailId',source,'subject',d.subject,
    'text',d.body,'to',jsonb_build_array('vendor@example.test'),'cc','[]'::jsonb,'bcc','[]'::jsonb)
  INTO envelope FROM private.reply_drafts d WHERE d.id=draft;
  IF position(command->>'reason' IN envelope->>'text')=0 THEN RAISE EXCEPTION 'Accountant request reason was lost'; END IF;
  PERFORM public.prepare_reply_send(buyer,draft,1,envelope,repeat('a',64));
  approval:=public.read_reply_approval(buyer,draft);
  receipt:=public.begin_reply_send(buyer,mailbox,draft,(approval->>'key')::uuid,repeat('a',64),
    (envelope-ARRAY['sourceAccountId','replyToEmailId']) || '{"from":{"address":"buying-request@example.test"},"inReplyTo":"<invoice-request@example.test>"}');
  PERFORM public.finish_mail_send(buyer,mailbox,(receipt->>'id')::uuid,'accepted');
  PERFORM public.schedule_reply_followup(draft,private.reply_followup_today(),NULL);
  reminder:=public.read_reply_followup_preview(draft);
  IF reminder IS NULL OR position(command->>'reason' IN reminder->>'text')=0 THEN
    RAISE EXCEPTION 'Reminder did not preserve the document request'; END IF;
  INSERT INTO public.emails(user_id,source_account_id,message_id,from_address,reply_references)
  VALUES(buyer,alternate_mailbox,'<wrong-account-request@example.test>','vendor@example.test',ARRAY[receipt->>'messageId']);
  IF public.read_purchase_evidence_request(handoff)#>>'{request,replyId}' IS NOT NULL THEN
    RAISE EXCEPTION 'Wrong account completed request'; END IF;
  INSERT INTO public.emails(id,user_id,source_account_id,message_id,subject,from_address,reply_references,body_text)
  VALUES(response,buyer,mailbox,'<ack-request@example.test>','Re: [PO-914] Hóa đơn','vendor@example.test',
    ARRAY[receipt->>'messageId'],'Đã nhận yêu cầu, chưa có chứng từ.');
  result:=public.prepare_purchase_evidence_request(handoff);
  next_draft:=(result#>>'{request,draftId}')::uuid;
  IF next_draft=draft OR result#>>'{request,sourceId}' IS DISTINCT FROM response::text
    OR (SELECT stage FROM private.purchase_due_exceptions WHERE origin_handoff=handoff)<>'buyer'
    OR (SELECT tracking_at FROM private.reply_drafts WHERE id=draft) IS NOT NULL
  THEN RAISE EXCEPTION 'Acknowledgement closed the exception or lost the next reply source'; END IF;
  SELECT jsonb_build_object('sourceAccountId',mailbox,'replyToEmailId',response,'subject',d.subject,
    'text',d.body,'to',jsonb_build_array('vendor@example.test'),'cc','[]'::jsonb,'bcc','[]'::jsonb)
  INTO envelope FROM private.reply_drafts d WHERE d.id=next_draft;
  PERFORM public.prepare_reply_send(buyer,next_draft,1,envelope,repeat('b',64));
  approval:=public.read_reply_approval(buyer,next_draft);
  UPDATE private.purchase_due_exceptions SET stage='reviewer',response_handoff=handoff WHERE origin_handoff=handoff;
  BEGIN
    PERFORM public.begin_reply_send(buyer,mailbox,next_draft,(approval->>'key')::uuid,repeat('b',64),
      (envelope-ARRAY['sourceAccountId','replyToEmailId']) || '{"from":{"address":"buying-request@example.test"},"inReplyTo":"<ack-request@example.test>"}');
    RAISE EXCEPTION 'Stale request dispatched after handoff';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  UPDATE private.purchase_due_exceptions SET stage='buyer',response_handoff=NULL WHERE origin_handoff=handoff;
  receipt:=public.begin_reply_send(buyer,mailbox,next_draft,(approval->>'key')::uuid,repeat('b',64),
    (envelope-ARRAY['sourceAccountId','replyToEmailId']) || '{"from":{"address":"buying-request@example.test"},"inReplyTo":"<ack-request@example.test>"}');
  PERFORM public.finish_mail_send(buyer,mailbox,(receipt->>'id')::uuid,'accepted');
  PERFORM public.schedule_reply_followup(next_draft,private.reply_followup_today(),NULL);
  UPDATE private.purchase_due_exceptions SET stage='closed',response_handoff=handoff WHERE origin_handoff=handoff;
  result:=public.read_purchase_evidence_request(handoff);
  IF result#>>'{canRequest}'<>'false' OR result#>>'{request,tracking}'<>'false'
    OR result#>>'{request,followupOn}' IS NOT NULL OR private.reply_followup_preview(buyer,next_draft) IS NOT NULL
  THEN RAISE EXCEPTION 'Closed exception continued tracking'; END IF;
  UPDATE private.purchase_due_exceptions SET stage='buyer',response_handoff=NULL WHERE origin_handoff=handoff;
  PERFORM public.schedule_reply_followup(next_draft,private.reply_followup_today(),NULL);
  reminder:=public.read_reply_followup_preview(next_draft);
  receipt:=public.begin_reply_followup(buyer,mailbox,next_draft,(reminder->>'key')::uuid,reminder->>'proof',
    reminder-ARRAY['key','proof','followupOn','accountId','sourceId']);
  PERFORM public.finish_mail_send(buyer,mailbox,(receipt->>'id')::uuid,'unknown');
  UPDATE private.purchase_due_exceptions SET stage='closed',response_handoff=handoff WHERE origin_handoff=handoff;
  IF public.read_reply_followup_receipt(next_draft) IS NULL OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.list_reply_work('{}')) work WHERE work->>'id'=next_draft::text
      AND work->>'reminderState'='unknown'
  ) THEN RAISE EXCEPTION 'Closure hid an uncertain receipt instead of preserving reconciliation'; END IF;
  -- Restore the active fixture for the existing visibility assertions below.
  UPDATE private.purchase_due_exceptions SET stage='buyer',response_handoff=NULL WHERE origin_handoff=handoff;
  PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
  result:=public.list_purchase_dues(0);
  IF result#>>'{items,0,exception,stage}' IS DISTINCT FROM 'buyer'
    OR result#>>'{items,0,status}' IS DISTINCT FROM 'review'
    OR result#>>'{items,0,canRequestEvidence}' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Reviewer board did not show an active exception exactly once';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN
    PERFORM public.read_purchase_evidence_request(handoff);
    RAISE EXCEPTION 'Outsider read request';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  BEGIN
    PERFORM public.prepare_purchase_evidence_request(handoff);
    RAISE EXCEPTION 'Outsider created request';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF public.list_purchase_dues(0) IS DISTINCT FROM '{"items":[],"hasMore":false}'::jsonb
    OR public.list_purchase_focus('{}') IS DISTINCT FROM '[]'::jsonb
    OR public.list_purchase_supplement_sources(ARRAY[handoff]) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Outsider gained visibility into another tenant exception';
  END IF;
  IF public.read_purchase_supplement_progress(outsider,ARRAY[handoff]) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Outsider read supplemental review progress';
  END IF;
  BEGIN
    PERFORM public.save_purchase_supplement_progress(outsider,handoff,invoice,'[{}]');
    RAISE EXCEPTION 'Outsider wrote supplemental review progress';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  BEGIN
    PERFORM public.read_purchase_approval_scan(outsider,handoff);
    RAISE EXCEPTION 'Outsider read the approval verification scope';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF has_table_privilege('authenticated','private.purchase_due_exceptions','SELECT')
    OR has_table_privilege('authenticated','private.purchase_evidence_requests','SELECT')
    OR has_table_privilege('service_role','private.purchase_evidence_requests','INSERT')
    OR has_function_privilege('anon','public.prepare_purchase_evidence_request(uuid)','EXECUTE')
    OR has_function_privilege('service_role','public.read_purchase_evidence_request(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','private.begin_unlinked_reply_send(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    OR has_table_privilege('service_role','private.purchase_due_exception_events','UPDATE')
    OR has_function_privilege('anon','public.read_purchase_handoff(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.confirm_purchase_handoff(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.confirm_purchase_handoff(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.read_purchase_approval_scan(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_purchase_approval_scan(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_purchase_supplement_progress(uuid,uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.save_purchase_supplement_progress(uuid,uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.save_purchase_supplement_progress(uuid,uuid,uuid,jsonb)','EXECUTE')
    OR has_table_privilege('service_role','private.purchase_supplement_checks','INSERT')
    OR has_function_privilege('service_role','private.apply_purchase_due_handoff(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','private.confirm_purchase_handoff(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.list_purchase_focus(uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.list_purchase_supplement_sources(uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','public.inspect_purchase_supplement(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.confirm_purchase_supplement(uuid,uuid,uuid,jsonb,text)','EXECUTE')
    OR (SELECT count(*) FROM pg_class WHERE oid IN (
      'private.purchase_due_exceptions'::regclass,'private.purchase_due_exception_events'::regclass) AND relrowsecurity)<>2
  THEN RAISE EXCEPTION 'Exception migration provides an unscoped access path'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: one attributed evidence request, replay, current assignee, preserved approval and scoped debt visibility' AS result;
SELECT 'PASS: document requests reuse drafts, match reply headers within account, keep acknowledgements open and block stale dispatch after handoff or closure' AS result;
