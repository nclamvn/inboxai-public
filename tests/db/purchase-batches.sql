BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  buyer uuid:=gen_random_uuid();
  maker uuid:=gen_random_uuid();
  approver uuid:=gen_random_uuid();
  source_account uuid:=gen_random_uuid();
  target uuid;
  selected_invoice uuid;
  handoff uuid;
  source_row public.emails;
  file_row public.attachments;
  doc record;
  command jsonb;
  decision uuid;
  proposal jsonb;
  batch uuid;
  approval uuid:=gen_random_uuid();
  first_payment uuid;
  movement text;
  remaining bigint;
  approved_day date;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (buyer,'buyer-batch-sql@example.test',now()),(maker,'maker-batch-sql@example.test',now()),
    (approver,'approver-batch-sql@example.test',now());
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(source_account,buyer,'source-batch-sql@example.test','gmail');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
  VALUES(buyer,source_account,'[PO-4550] Đơn gốc','supplier@example.test','Đơn gốc.','2026-11-04Z','inbound','gmail','batch-order')
  RETURNING * INTO source_row;
  PERFORM set_config('request.jwt.claim.sub',buyer::text,true);
  target:=(private.save_commitment(gen_random_uuid(),NULL,NULL,'batch-sql-case',
    '{"title":"PO-4550","ownerName":null,"ownerEmail":"supplier@example.test","dueOn":null,"dueAt":null,"status":"open",
      "purchaseOrder":{"reference":"PO-4550","warehouse":null,
        "lines":[{"code":"A","ordered":100,"reported":90,"received":90,"unit":"bộ"},{"code":"B","ordered":100,"reported":90,"received":90,"unit":"bộ"}]}}',
    NULL,jsonb_build_array(jsonb_build_object('emailId',source_row.id,'field','body_text','quote','Đơn gốc.')))->>'id')::uuid;
  UPDATE private.commitments SET detection_reference='PO-4550' WHERE id=target AND user_id=buyer;
  INSERT INTO private.purchase_order_events(user_id,commitment_id,version,operation,source_at,source_fingerprint)
  VALUES(buyer,target,1,'create',source_row.received_at,private.commitment_detection_fingerprint(source_row));

  FOR doc IN SELECT * FROM (VALUES ('price','BG-550'),('invoice','INV-550')) input(kind,number) LOOP
    INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
    VALUES(buyer,source_account,'[PO-4550] Chứng từ','supplier@example.test','Xem đính kèm.','2026-11-05Z','inbound','gmail','batch-'||doc.kind)
    RETURNING * INTO source_row;
    INSERT INTO public.attachments(email_id,filename,content_type,size,sync_part_key)
    VALUES(source_row.id,doc.kind||'.csv','text/csv',20,'1') RETURNING * INTO file_row;
    INSERT INTO private.purchase_payment_documents(user_id,commitment_id,kind,number,email_id,attachment_id,filename,binding,digest,source_at,lines)
    VALUES(buyer,target,doc.kind,doc.number,source_row.id,file_row.id,file_row.filename,private.purchase_csv_binding(source_row,file_row),
      repeat('a',64),source_row.received_at,'[{"row":2,"code":"B","quantity":10,"unit":"bộ","price":2000,"quote":"B,10","paymentDue":"2026-12-01"}]')
    RETURNING id INTO selected_invoice;
  END LOOP;

  command:=jsonb_build_object('action','submit','commitmentId',target,'invoiceId',selected_invoice,
    'proof',public.read_purchase_payment(target)#>>'{command,proof}','reviewer','maker-batch-sql@example.test');
  handoff:=(public.confirm_purchase_handoff(buyer,gen_random_uuid(),command)->>'id')::uuid;
  decision:=(public.confirm_purchase_handoff(maker,gen_random_uuid(),jsonb_build_object('action','approve','handoffId',handoff))->>'decisionId')::uuid;
  PERFORM set_config('request.jwt.claim.sub',maker::text,true);
  proposal:=public.preview_purchase_batch(ARRAY[handoff]);
  IF proposal->'approvers' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Approver was assigned implicitly'; END IF;
  command:=jsonb_build_object('action','submit','approverId',approver,
    'lines',jsonb_build_array(jsonb_build_object('handoffId',handoff,'proof',proposal#>>'{lines,0,proof}')));
  BEGIN
    PERFORM public.confirm_purchase_batch(maker,gen_random_uuid(),command);
    RAISE EXCEPTION 'Unconfigured approver was accepted';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;
  INSERT INTO private.purchase_batch_approvers VALUES(maker,approver);
  batch:=(public.confirm_purchase_batch(maker,gen_random_uuid(),command)->>'id')::uuid;
  BEGIN
    PERFORM public.confirm_purchase_batch(maker,gen_random_uuid(),command);
    RAISE EXCEPTION 'Installment was reserved twice';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;
  command:=jsonb_build_object('action','approve','id',batch);
  BEGIN
    PERFORM public.confirm_purchase_batch(maker,gen_random_uuid(),command);
    RAISE EXCEPTION 'Submitter approved their own proposal';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;
  PERFORM public.confirm_purchase_batch(approver,approval,command);
  IF public.confirm_purchase_batch(approver,approval,command)->>'replayed' IS DISTINCT FROM 'true'
    OR (SELECT count(*) FROM private.purchase_batch_events WHERE batch_id=batch AND action='approve')<>1
    OR (SELECT count(*) FROM private.purchase_batch_entries WHERE batch_id=batch)<>0
  THEN RAISE EXCEPTION 'Approval duplicated or recorded a ledger movement'; END IF;
  approved_day:=private.purchase_batch_approval_day(batch);
  BEGIN
    INSERT INTO private.purchase_settlements(owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
      reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest)
    VALUES(buyer,target,selected_invoice,selected_invoice,decision,handoff,maker,'maker-batch-sql@example.test','BANK-BATCH-SQL-OLD',
      approved_day-1,10000,gen_random_uuid(),gen_random_uuid(),'fake-bank.csv','binding','digest');
    RAISE EXCEPTION 'A transfer predating approval was assigned to the batch';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;

  FOREACH movement IN ARRAY ARRAY['BANK-BATCH-SQL-1','BANK-BATCH-SQL-2'] LOOP
    INSERT INTO private.purchase_settlements(owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
      reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest)
    VALUES(buyer,target,selected_invoice,selected_invoice,decision,handoff,maker,'maker-batch-sql@example.test',movement,
      approved_day,10000,gen_random_uuid(),gen_random_uuid(),'fake-bank.csv','binding','digest')
    RETURNING id INTO first_payment;
  END LOOP;
  IF public.read_purchase_batch(batch)->>'stage' IS DISTINCT FROM 'closed'
    OR (SELECT count(*) FROM private.purchase_batch_events WHERE batch_id=batch AND action='close')<>1
    OR EXISTS (SELECT 1 FROM private.purchase_batch_lines WHERE batch_id=batch AND reserved)
  THEN RAISE EXCEPTION 'Full reconciliation did not close and release the batch exactly once'; END IF;

  INSERT INTO private.purchase_settlements(owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
    reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest,reversal_of)
  VALUES(buyer,target,selected_invoice,selected_invoice,decision,handoff,maker,'maker-batch-sql@example.test','BANK-BATCH-SQL-RETURN',
    approved_day,10000,gen_random_uuid(),gen_random_uuid(),'fake-return.csv','binding','digest',first_payment);
  remaining:=(public.read_purchase_batch(batch)#>>'{lines,0,paid}')::bigint;
  IF remaining<>10000 OR public.read_purchase_batch(batch)->>'hasReturn' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'A return did not adjust the original batch and surface review';
  END IF;

  IF has_table_privilege('authenticated','private.purchase_batch_approvers','INSERT')
    OR has_table_privilege('service_role','private.purchase_batch_entries','INSERT')
    OR has_function_privilege('authenticated','public.confirm_purchase_batch(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.read_purchase_batch(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Batch controls can be bypassed outside the scoped RPC'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: payment batch permissions, exclusive reservation, approval replay, reconciliation close and linked returns' AS result;
