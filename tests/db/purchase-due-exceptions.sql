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
  command jsonb;
  result jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (buyer,'buyer-exception-sql@example.test',now()),(reviewer,'reviewer-exception-sql@example.test',now()),
    (outsider,'outsider-exception-sql@example.test',now());
  INSERT INTO private.commitments(id,user_id,reference_key,version,detection_reference)
  VALUES(po,buyer,'exception-sql-po',1,'PO-914');
  INSERT INTO private.commitment_revisions(user_id,commitment_id,version,request_key,request_hash,kind,state,changed_fields,anchors)
  VALUES(buyer,po,1,gen_random_uuid(),sha256('exception-test'::bytea),'created','{"status":"open"}','{}','[{"field":"subject"}]');
  INSERT INTO private.purchase_payment_documents(id,user_id,commitment_id,kind,number,email_id,attachment_id,filename,binding,digest,source_at,lines)
  VALUES(invoice,buyer,po,'invoice','INV-914',gen_random_uuid(),gen_random_uuid(),'invoice.csv','binding','digest','2026-08-01Z',
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
  PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
  result:=public.list_purchase_dues(0);
  IF result#>>'{items,0,exception,stage}' IS DISTINCT FROM 'buyer'
    OR result#>>'{items,0,status}' IS DISTINCT FROM 'review'
    OR result#>>'{items,0,canRequestEvidence}' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Reviewer board did not show an active exception exactly once';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  IF public.list_purchase_dues(0) IS DISTINCT FROM '{"items":[],"hasMore":false}'::jsonb
    OR public.list_purchase_focus('{}') IS DISTINCT FROM '[]'::jsonb
    OR public.list_purchase_supplement_sources(ARRAY[handoff]) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Outsider gained visibility into another tenant exception';
  END IF;
  IF has_table_privilege('authenticated','private.purchase_due_exceptions','SELECT')
    OR has_table_privilege('service_role','private.purchase_due_exception_events','UPDATE')
    OR has_function_privilege('anon','public.read_purchase_handoff(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.confirm_purchase_handoff(uuid,uuid,jsonb)','EXECUTE')
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
