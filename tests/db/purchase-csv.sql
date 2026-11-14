BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid:=gen_random_uuid();
  buyer uuid:=gen_random_uuid();
  warehouse uuid:=gen_random_uuid();
  order_mail public.emails;
  receipt uuid;
  file_id uuid;
  target uuid;
  source_binding text;
  csv text;
  bad text;
  preview jsonb;
  approval jsonb;
  result jsonb;
  proof uuid;
  approval_key uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email) VALUES(actor,'csv-sql@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
    (buyer,actor,'buyer-csv@example.test','gmail'),(warehouse,actor,'warehouse-csv@example.test','gmail');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
  VALUES(actor,buyer,'[PO-4100] Đặt hàng','supplier-csv@example.test',
    'Đơn mua hàng nhiều dòng, hạn 2026-11-20: A 100 bộ + B 100 bộ + C 100 bộ + D 100 bộ.',
    '2026-11-04Z','inbound','gmail','csv-order-sql') RETURNING * INTO order_mail;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','create',
    'emailId',order_mail.id,'fingerprint',private.commitment_detection_fingerprint(order_mail),'quote',order_mail.body_text));
  target:=(result->>'id')::uuid;
  PERFORM public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','configure','id',target,
    'version',1,'accountId',warehouse,'sender','stock-csv@example.test'));

  csv:=E'po,document,corrects,line,quantity,unit\nPO-4100,PN-77,,A,110,bộ\nPO-4100,PN-77,,B,90,bộ\nPO-4100,PN-77,,C,40,bộ\nPO-4100,PN-77,,D,35,bộ\n';
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
  VALUES(actor,warehouse,'[PO-4100] Kho','stock-csv@example.test','Đính kèm phiếu.','2026-11-10Z','inbound','gmail','csv-receipt-sql')
    RETURNING id INTO receipt;
  INSERT INTO public.attachments(email_id,filename,content_type,size,sync_part_key)
  VALUES(receipt,'count.csv','text/csv',octet_length(csv),'1') RETURNING id INTO file_id;
  source_binding:=public.check_purchase_csv_source(receipt,file_id);
  preview:=public.preview_purchase_csv(actor,receipt,file_id,source_binding,csv);
  approval:=preview->'approval';
  IF jsonb_array_length(preview->'rows') IS DISTINCT FROM 4 OR (public.read_commitment(target,10,NULL)->>'version') IS DISTINCT FROM '2'
  THEN RAISE EXCEPTION 'preview changed the ledger or missed rows'; END IF;
  FOREACH bad IN ARRAY ARRAY[replace(csv,',B,90',',,90'),replace(csv,',B,90',',A,90'),replace(csv,',B,90',',B,=90')]
  LOOP
    BEGIN
      PERFORM public.preview_purchase_csv(actor,receipt,file_id,source_binding,bad);
      RAISE EXCEPTION 'invalid row passed preview';
    EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.confirm_purchase_csv(actor,approval_key,approval,replace(csv,',B,90',',B,91'));
    RAISE EXCEPTION 'changed bytes accepted with the old digest';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;

  result:=public.confirm_purchase_csv(actor,approval_key,approval,csv);
  IF result->>'version' IS DISTINCT FROM '3' OR
    public.read_purchase_csv_receipt(approval_key,approval)->>'replayed' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'CSV approval did not replay'; END IF;
  result:=public.read_commitment(target,10,NULL);
  IF jsonb_array_length(result#>'{history,0,sources}') IS DISTINCT FROM 4
    OR result#>>'{state,purchaseOrder,lines,3,received}' IS DISTINCT FROM '35'
  THEN RAISE EXCEPTION 'the four rows were not saved together'; END IF;
  proof:=(result#>>'{history,0,sources,0,attachment,proofId}')::uuid;
  IF public.read_purchase_csv_proof(proof)->>'attachmentId' IS DISTINCT FROM file_id::text
  THEN RAISE EXCEPTION 'source link lost its attachment identity'; END IF;
  BEGIN
    PERFORM public.preview_purchase_csv(actor,receipt,file_id,source_binding,csv);
    RAISE EXCEPTION 'same document posted twice';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;
  UPDATE public.attachments SET filename='changed.csv' WHERE id=file_id;
  IF public.ask_purchase_order('PO-4100','{}') IS DISTINCT FROM '{"unavailable":true}'::jsonb
  THEN RAISE EXCEPTION 'changed source metadata still supported an answer'; END IF;
  BEGIN
    PERFORM public.read_purchase_csv_proof(proof);
    RAISE EXCEPTION 'changed source metadata still allowed download';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF public.read_purchase_csv_receipt(approval_key,approval)->>'replayed' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'approval replay incorrectly depends on the provider'; END IF;
  IF has_function_privilege('authenticated','public.confirm_purchase_csv(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.preview_purchase_csv(uuid,uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.read_purchase_csv_proof(uuid)','EXECUTE')
    OR has_table_privilege('service_role','private.purchase_csv_documents','INSERT')
  THEN RAISE EXCEPTION 'CSV mutation or proof grants are too broad'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: CSV rows commit together, invalid rows and stale bytes fail closed, proof metadata and service-only grants are enforced' AS result;
