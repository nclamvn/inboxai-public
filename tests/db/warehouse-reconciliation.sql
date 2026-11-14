BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  warehouse uuid := gen_random_uuid();
  supplier text := 'supplier-warehouse@example.test';
  warehouse_sender text := 'warehouse-receiver@example.test';
  case_ref text := 'PO-9653';
  origin public.emails;
  shipped public.emails;
  partial public.emails;
  duplicate public.emails;
  wrong public.emails;
  final_receipt public.emails;
  commitment uuid;
  key text;
  state jsonb := '{"title":"Giao 200 bộ thiết bị","ownerEmail":"supplier-warehouse@example.test","ownerName":null,"dueOn":"2026-11-21","dueAt":null,"status":"open","delivery":{"ordered":200,"delivered":0,"unit":"bộ"}}';
  payload jsonb;
  result jsonb;
  replay_key uuid := gen_random_uuid();
  final_key uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email) VALUES(actor,'test-receiving@example.test'),(outsider,'other-receiving@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
    (buyer,actor,'buyer-receiving@example.test','custom'),(warehouse,actor,'warehouse-inbox@example.test','custom');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,buyer,'[PO-9653] Thiết bị',supplier,'Chúng tôi xác nhận giao 200 bộ thiết bị ngày 21/11/2026.','2026-11-04T01:00:00Z','inbound')
    RETURNING * INTO origin;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  key := private.commitment_case_key(buyer,supplier,case_ref);
  result := public.confirm_commitment_detection(gen_random_uuid(),origin.id,private.commitment_detection_fingerprint(origin),
    NULL,NULL,key,state,jsonb_build_array(jsonb_build_object('emailId',origin.id,'field','body_text','quote',origin.body_text)));
  commitment := (result->>'id')::uuid;

  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),jsonb_build_object('operation','configure','expectedVersion',1,
      'accountId',warehouse,'sender',supplier));
    RAISE EXCEPTION 'supplier was configured as warehouse';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),jsonb_build_object('operation','configure','expectedVersion',1,
    'accountId',warehouse,'sender',warehouse_sender));

  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,buyer,'[PO-9653] Đã giao',supplier,'Chúng tôi đã giao đủ 200/200 bộ.','2026-11-08T01:00:00Z','inbound')
    RETURNING * INTO shipped;
  state := jsonb_set(state,'{delivery,delivered}','200') ||
    jsonb_build_object('receiving',jsonb_build_object('accountId',warehouse,'sender',warehouse_sender,'received',0));
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),shipped.id,private.commitment_detection_fingerprint(shipped),
      commitment,2,key,state||'{"status":"completed"}',jsonb_build_array(jsonb_build_object('emailId',shipped.id,'field','body_text','quote',shipped.body_text)));
    RAISE EXCEPTION 'supplier closed reconciled commitment';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM public.confirm_commitment_detection(gen_random_uuid(),shipped.id,private.commitment_detection_fingerprint(shipped),
    commitment,2,key,state,jsonb_build_array(jsonb_build_object('emailId',shipped.id,'field','body_text','quote',shipped.body_text)));

  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,warehouse,'[PO-9653] Kho',warehouse_sender,'Biên nhận PN-9002 – thực nhập 180 bộ.','2026-11-10T01:00:00Z','inbound')
    RETURNING * INTO partial;
  payload := jsonb_build_object('operation','receive','expectedVersion',3,'emailId',partial.id,
    'sourceFingerprint',private.commitment_detection_fingerprint(partial),'quote',partial.body_text);
  result := public.confirm_commitment_receiving(commitment,replay_key,payload);
  IF result->>'version'<>'4' THEN RAISE EXCEPTION 'partial receipt missing'; END IF;
  IF (public.confirm_commitment_receiving(commitment,replay_key,payload)->>'replayed') IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'receipt did not replay'; END IF;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,replay_key,payload||'{"quote":"changed"}');
    RAISE EXCEPTION 'request key reused for different command';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),'{"operation":"close","expectedVersion":4}');
    RAISE EXCEPTION 'short delivery closed';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,warehouse,'[PO-9653] Kho bản lặp',warehouse_sender,partial.body_text,'2026-11-12T01:00:00Z','inbound')
    RETURNING * INTO duplicate;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),jsonb_build_object('operation','receive','expectedVersion',4,
      'emailId',duplicate.id,'sourceFingerprint',private.commitment_detection_fingerprint(duplicate),'quote',duplicate.body_text));
    RAISE EXCEPTION 'duplicate warehouse receipt was counted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,buyer,'[PO-9653] Kho sai hộp thư',warehouse_sender,'Phiếu nhập PN-9001: kho nhận 20 bộ.','2026-11-07T01:00:00Z','inbound')
    RETURNING * INTO wrong;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),jsonb_build_object('operation','receive','expectedVersion',4,
      'emailId',wrong.id,'sourceFingerprint',private.commitment_detection_fingerprint(wrong),'quote',wrong.body_text));
    RAISE EXCEPTION 'receipt outside configured inbox was counted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),commitment,4,NULL,jsonb_set(state,'{receiving,received}','200')||'{"status":"completed"}',
      NULL,jsonb_build_array(jsonb_build_object('emailId',partial.id,'field','body_text','quote',partial.body_text)));
    RAISE EXCEPTION 'manual save bypassed receiving';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,warehouse,'[PO-9653] Kho phiếu đến muộn',warehouse_sender,wrong.body_text,'2026-11-07T01:00:00Z','inbound')
    RETURNING * INTO final_receipt;
  PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),jsonb_build_object('operation','receive','expectedVersion',4,
    'emailId',final_receipt.id,'sourceFingerprint',private.commitment_detection_fingerprint(final_receipt),'quote',final_receipt.body_text));

  UPDATE public.emails SET body_text='Phiếu đã sửa' WHERE emails.id=partial.id;
  IF public.ask_warehouse_reconciliation(case_ref,'{}') <> '{}' THEN RAISE EXCEPTION 'changed source still supports answer'; END IF;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),'{"operation":"close","expectedVersion":5}');
    RAISE EXCEPTION 'changed source allowed closing';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  UPDATE public.emails SET body_text=partial.body_text WHERE emails.id=partial.id;
  result := public.ask_warehouse_reconciliation(case_ref,'{}');
  IF result->>'received' IS DISTINCT FROM '200' OR jsonb_array_length(result->'receipts')<>2
  THEN RAISE EXCEPTION 'receipt evidence missing'; END IF;
  result := public.confirm_commitment_receiving(commitment,final_key,'{"operation":"close","expectedVersion":5}');
  IF result->>'version' IS DISTINCT FROM '6' OR
    (public.confirm_commitment_receiving(commitment,final_key,'{"operation":"close","expectedVersion":5}')->>'replayed') IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'close approval did not replay'; END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  IF public.ask_warehouse_reconciliation(case_ref,'{}') <> '{}' THEN RAISE EXCEPTION 'tenant leaked warehouse answer'; END IF;
  BEGIN
    PERFORM public.confirm_commitment_receiving(commitment,gen_random_uuid(),'{"operation":"close","expectedVersion":6}');
    RAISE EXCEPTION 'foreign tenant approved receiving';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF has_function_privilege('anon','public.confirm_commitment_receiving(uuid,uuid,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','private.commitment_warehouse_receipts','INSERT')
  THEN RAISE EXCEPTION 'warehouse grants are too broad'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: warehouse scope, late receipt, duplicate number, approval replay, stale evidence and tenant boundaries' AS result;
