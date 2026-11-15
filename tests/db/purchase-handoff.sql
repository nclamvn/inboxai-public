DO $$
DECLARE
  buyer uuid:='fb910000-0000-4000-8000-000000000001';
  target uuid:='fb910000-0000-4000-8000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.purchase_payment_decisions
    WHERE user_id=buyer AND commitment_id=target AND proof='old-approval' AND approved_by IS NULL)
    OR (SELECT allocation.lines#>>'{0,quantity}' FROM private.purchase_installment_allocations(buyer,target) allocation) IS DISTINCT FROM '100'
    OR EXISTS (SELECT 1 FROM private.purchase_handoff_orders WHERE owner_id=buyer AND commitment_id=target)
  THEN RAISE EXCEPTION 'Handoff upgrade altered the legacy approval, attribution or PO policy'; END IF;
END;
$$;
DELETE FROM auth.users WHERE id='fb910000-0000-4000-8000-000000000001';
SELECT 'PASS: handoff upgrade preserves legacy approval and attribution without enabling handoff for legacy POs' AS result;

BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  owner uuid:=gen_random_uuid();
  reviewer uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  source_account uuid:=gen_random_uuid();
  target uuid:=gen_random_uuid();
  selected_invoice uuid:=gen_random_uuid();
  selected_file uuid:=gen_random_uuid();
  source_row public.emails;
  file_row public.attachments;
  command jsonb;
  owner_command jsonb;
  outcome jsonb;
  item uuid;
  fresh uuid;
  approval_key uuid:=gen_random_uuid();
  doc record;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (owner,'buyer-handoff-sql@example.test',now()),(reviewer,'reviewer-handoff-sql@example.test',now()),
    (outsider,'other-handoff-sql@example.test',now());
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(source_account,owner,'source-handoff-sql@example.test','gmail');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
  VALUES(owner,source_account,'[PO-4500] Đơn gốc','supplier@example.test','Đơn gốc.','2026-11-04Z','inbound','gmail','handoff-order')
  RETURNING * INTO source_row;
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  SELECT (private.save_commitment(gen_random_uuid(),NULL,NULL,'handoff-sql-case',
    '{"title":"PO-4500","ownerName":null,"ownerEmail":"supplier@example.test","dueOn":null,"dueAt":null,"status":"open",
    "purchaseOrder":{"reference":"PO-4500","warehouse":null,
      "lines":[{"code":"A","ordered":100,"reported":90,"received":90,"unit":"bộ"},{"code":"B","ordered":100,"reported":90,"received":90,"unit":"bộ"}]}}',
    NULL,jsonb_build_array(jsonb_build_object('emailId',source_row.id,'field','body_text','quote','Đơn gốc.')))->>'id')::uuid INTO target;
  UPDATE private.commitments SET detection_reference='PO-4500' WHERE id=target AND user_id=owner;
  INSERT INTO private.purchase_order_events(user_id,commitment_id,version,operation,source_at,source_fingerprint)
  VALUES(owner,target,1,'create',source_row.received_at,private.commitment_detection_fingerprint(source_row));

  FOR doc IN SELECT * FROM (VALUES ('price','BG-10'),('invoice','INV-10')) input(kind,number) LOOP
    INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
    VALUES(owner,source_account,'[PO-4500] Chứng từ','supplier@example.test','Xem đính kèm.','2026-11-05Z','inbound','gmail','handoff-'||doc.kind)
    RETURNING * INTO source_row;
    INSERT INTO public.attachments(email_id,filename,content_type,size,sync_part_key)
    VALUES(source_row.id,doc.kind||'.csv','text/csv',20,'1') RETURNING * INTO file_row;
    INSERT INTO private.purchase_payment_documents(user_id,commitment_id,kind,number,email_id,attachment_id,filename,binding,digest,source_at,lines)
    VALUES(owner,target,doc.kind,doc.number,source_row.id,file_row.id,file_row.filename,private.purchase_csv_binding(source_row,file_row),
      repeat('a',64),source_row.received_at,'[{"row":2,"code":"B","quantity":10,"unit":"bộ","price":2000,"quote":"B,10"}]')
    RETURNING id INTO selected_invoice;
    selected_file:=file_row.id;
  END LOOP;

  owner_command:=public.read_purchase_payment(target)->'command';
  command:=jsonb_build_object('action','submit','commitmentId',target,'invoiceId',selected_invoice,
    'proof',owner_command->>'proof','reviewer','reviewer-handoff-sql@example.test');
  outcome:=public.confirm_purchase_handoff(owner,gen_random_uuid(),command);
  item:=(outcome->>'id')::uuid;
  BEGIN
    PERFORM public.confirm_purchase_payment(owner,gen_random_uuid(),owner_command);
    RAISE EXCEPTION 'owner bypassed separated approval via the payment RPC';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_purchase_handoff_files(outsider,item);
    RAISE EXCEPTION 'outsider received a privileged file manifest';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
  outcome:=public.read_purchase_handoff(item);
  IF outcome->>'status' IS DISTINCT FROM 'pending' OR outcome#>>'{snapshot,invoice,evidence,emailId}' IS NOT NULL OR
    outcome#>>'{snapshot,invoice,evidence,attachmentId}' IS DISTINCT FROM selected_file::text
  THEN RAISE EXCEPTION 'assigned evidence is missing or not sanitized'; END IF;
  PERFORM public.confirm_purchase_handoff(reviewer,gen_random_uuid(),jsonb_build_object('action','return','handoffId',item,'reason','Xin xem lại'));
  fresh:=(public.confirm_purchase_handoff(owner,gen_random_uuid(),command)->>'id')::uuid;
  IF fresh=item THEN RAISE EXCEPTION 'fresh delegation reused the returned link'; END IF;
  BEGIN
    PERFORM public.confirm_purchase_handoff(reviewer,gen_random_uuid(),jsonb_build_object('action','approve','handoffId',item));
    RAISE EXCEPTION 'returned link approved';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;

  command:=jsonb_build_object('action','approve','handoffId',fresh);
  outcome:=public.confirm_purchase_handoff(reviewer,approval_key,command);
  IF outcome->>'decisionId' IS NULL OR
    public.read_purchase_handoff_receipt(approval_key,command)->>'decisionId' IS DISTINCT FROM outcome->>'decisionId'
    OR (SELECT approved_by FROM private.purchase_payment_decisions WHERE id=(outcome->>'decisionId')::uuid) IS DISTINCT FROM reviewer
    OR (SELECT count(*) FROM private.purchase_payment_decisions WHERE user_id=owner AND commitment_id=target)<>1
  THEN RAISE EXCEPTION 'reviewer approval did not persist and replay exactly once'; END IF;
  IF has_function_privilege('authenticated','public.resolve_purchase_handoff_files(uuid,uuid)','EXECUTE') OR
    has_function_privilege('authenticated','public.confirm_purchase_handoff(uuid,uuid,jsonb)','EXECUTE') OR
    has_function_privilege('service_role','private.confirm_purchase_payment(uuid,uuid,jsonb,text)','EXECUTE') OR
    has_function_privilege('anon','public.read_purchase_handoff(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'handoff RPC grants are too broad'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: delegated scope, owner RPC bypass blocked, returned documents immutable, reviewer attribution and replay' AS result;
