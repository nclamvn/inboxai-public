BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid:=gen_random_uuid();
  buyer uuid:=gen_random_uuid();
  warehouse uuid:=gen_random_uuid();
  origin public.emails;
  target uuid;
  email_id uuid;
  file_id uuid;
  csv text;
  binding text;
  command jsonb;
  proof jsonb;
  approval_key uuid:=gen_random_uuid();
  result jsonb;
  step record;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(actor,'payment-sql@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
    (buyer,actor,'buyer-payment@example.test','gmail'),(warehouse,actor,'warehouse-payment@example.test','gmail');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
  VALUES(actor,buyer,'[PO-4400] Đặt hàng','supplier-payment@example.test',
    'Đơn mua hàng nhiều dòng, hạn 2026-11-20: A 10 bộ + B 10 bộ.','2026-11-04Z','inbound','gmail','payment-order-sql')
  RETURNING * INTO origin;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  target:=(public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','create','emailId',origin.id,
    'fingerprint',private.commitment_detection_fingerprint(origin),'quote',origin.body_text))->>'id')::uuid;
  PERFORM public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','configure','id',target,
    'version',1,'accountId',warehouse,'sender','stock-payment@example.test'));

  FOR step IN SELECT * FROM (VALUES
    (1,buyer,'supplier-payment@example.test',E'po,price_sheet,line,quantity,unit,unit_price,currency\nPO-4400,BG-92,A,10,bộ,1000,VND\nPO-4400,BG-92,B,10,bộ,2000,VND\n'),
    (2,buyer,'supplier-payment@example.test',E'po,invoice,replaces,line,quantity,unit,unit_price,currency\nPO-4400,INV-92,,A,10,bộ,1000,VND\nPO-4400,INV-92,,B,10,bộ,2000,VND\n'),
    (3,warehouse,'stock-payment@example.test',E'po,document,corrects,line,quantity,unit\nPO-4400,PN-92,,A,10,bộ\nPO-4400,PN-92,,B,10,bộ\n')
  ) steps(seq,account,sender,contents) ORDER BY seq LOOP
    csv:=step.contents;
    INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction,sync_namespace,original_uid)
    VALUES(actor,step.account,'[PO-4400] Chứng từ',step.sender,'Xem đính kèm.',
      '2026-11-05Z'::timestamptz+step.seq*INTERVAL '1 day','inbound','gmail','payment-source-sql-' || step.seq)
    RETURNING id INTO email_id;
    INSERT INTO public.attachments(email_id,filename,content_type,size,sync_part_key)
    VALUES(email_id,'payment.csv','text/csv',octet_length(csv),'1') RETURNING id INTO file_id;
    binding:=public.check_purchase_csv_source(email_id,file_id);
    IF step.seq=3 THEN
      command:=public.preview_purchase_csv(actor,email_id,file_id,binding,csv)->'approval';
      PERFORM public.confirm_purchase_csv(actor,gen_random_uuid(),command,csv);
    ELSE
      command:=public.preview_purchase_payment(actor,email_id,file_id,binding,csv)->'command';
      PERFORM public.confirm_purchase_payment(actor,gen_random_uuid(),command,csv);
    END IF;
    IF step.seq=2 THEN
      IF public.read_purchase_payment(target)->>'status' IS DISTINCT FROM 'blocked'
      THEN RAISE EXCEPTION 'no receipt should block'; END IF;
      BEGIN
        PERFORM public.confirm_purchase_payment(actor,gen_random_uuid(),jsonb_build_object('action','approve','id',target,'proof',repeat('a',64)));
        RAISE EXCEPTION 'blocked invoice was approved directly';
      EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
      END;
    END IF;
  END LOOP;

  proof:=public.read_purchase_payment(target)->'command';
  IF proof IS NULL OR jsonb_typeof(proof)<>'object' THEN RAISE EXCEPTION 'ready invoice missing command'; END IF;
  result:=public.confirm_purchase_payment(actor,approval_key,proof);
  IF public.read_purchase_payment_receipt(approval_key,proof)->>'decisionId' IS DISTINCT FROM result->>'decisionId'
    OR public.read_purchase_payment(target)->>'status' IS DISTINCT FROM 'approved'
  THEN RAISE EXCEPTION 'failed to persist the approval'; END IF;
  BEGIN
    PERFORM public.confirm_purchase_payment(actor,gen_random_uuid(),proof);
    RAISE EXCEPTION 'second key created another approval';
  EXCEPTION WHEN SQLSTATE 'PT432' THEN NULL;
  END;
  UPDATE public.attachments SET filename='changed.csv' WHERE id=file_id;
  IF public.read_purchase_payment(target)->>'status' IS DISTINCT FROM 'unavailable'
    OR public.read_purchase_payment_receipt(approval_key,proof)->>'decisionId' IS DISTINCT FROM result->>'decisionId'
  THEN RAISE EXCEPTION 'invalidated evidence should remove current approval but preserve audit receipt'; END IF;
  IF has_function_privilege('authenticated','public.confirm_purchase_payment(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.read_purchase_payment(uuid)','EXECUTE')
    OR has_table_privilege('service_role','private.purchase_payment_documents','INSERT')
  THEN RAISE EXCEPTION 'payment mutation boundary exposes excessive grants'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: three-way payment gate, authorized mutation only, single decision across keys and proof invalidation after evidence drift' AS result;
