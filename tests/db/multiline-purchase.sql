BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  buyer uuid:=gen_random_uuid();
  warehouse uuid:=gen_random_uuid();
  supplier text:='supplier-multiline@example.test';
  warehouse_sender text:='warehouse-multiline@example.test';
  order_email public.emails;
  event_email public.emails;
  command jsonb;
  outcome jsonb;
  target uuid;
  key uuid;
  body text;
  i int;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(actor,'buyer-multiline@example.test'),(outsider,'other-multiline@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
    (buyer,actor,'buy-multiline@example.test','custom'),(warehouse,actor,'receive-multiline@example.test','custom');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,buyer,'[PO-4112] Đặt hàng',supplier,'Đơn mua hàng nhiều dòng, hạn 2026-11-20: A 100 bộ + B 100 bộ.',
      '2026-11-04Z','inbound') RETURNING * INTO order_email;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  command:=jsonb_build_object('operation','create','emailId',order_email.id,
    'fingerprint',private.commitment_detection_fingerprint(order_email),'quote',order_email.body_text);
  outcome:=public.confirm_purchase_order(gen_random_uuid(),command);
  target:=(outcome->>'id')::uuid;
  IF outcome->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'order creation failed'; END IF;
  PERFORM public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','configure','id',target,
    'version',1,'accountId',warehouse,'sender',warehouse_sender));

  FOR i IN 1..2 LOOP
    body:='Báo giao dòng ' || (ARRAY['A','B'])[i] || ': 100 bộ.';
    INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
      VALUES(actor,buyer,'[PO-4112] Báo giao',supplier,body,'2026-11-10Z','inbound') RETURNING * INTO event_email;
    PERFORM public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','ship','id',target,'version',i+1,
      'emailId',event_email.id,'fingerprint',private.commitment_detection_fingerprint(event_email),'quote',body));
  END LOOP;

  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at,direction)
    VALUES(actor,warehouse,'[PO-4112] Hai dòng giao cùng phiếu',warehouse_sender,
      E'Phiếu nhập PN-4112 dòng A: kho thực nhận 110 bộ.\nPhiếu nhập PN-4112 dòng B: kho thực nhận 90 bộ.',
      '2026-11-12Z','inbound') RETURNING * INTO event_email;
  FOR i IN 1..2 LOOP
    command:=jsonb_build_object('operation','receive','id',target,'version',i+3,'emailId',event_email.id,
      'fingerprint',private.commitment_detection_fingerprint(event_email),'quote',split_part(event_email.body_text,E'\n',i));
    key:=gen_random_uuid();
    outcome:=public.confirm_purchase_order(key,command);
    IF outcome->>'version' IS DISTINCT FROM (i+4)::text OR
      (public.confirm_purchase_order(key,command)->>'replayed') IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'receipt did not advance exactly once'; END IF;
  END LOOP;
  BEGIN
    PERFORM public.confirm_purchase_order(key,command || '{"version":6}');
    RAISE EXCEPTION 'a replay key accepted a different command';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  outcome:=public.ask_purchase_order('PO-4112','{}');
  IF outcome#>>'{lines,0,received}' IS DISTINCT FROM '110' OR outcome#>>'{lines,1,received}' IS DISTINCT FROM '90'
    OR jsonb_array_length(outcome->'sources') IS DISTINCT FROM 5
  THEN RAISE EXCEPTION 'line totals or citations missing'; END IF;
  BEGIN
    PERFORM public.confirm_purchase_order(gen_random_uuid(),jsonb_build_object('operation','close','id',target,'version',6));
    RAISE EXCEPTION 'equal aggregate bypassed line reconciliation';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),target,6,NULL,'{"status":"completed"}',NULL,'[]');
    RAISE EXCEPTION 'generic save mutated purchase state';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;

  UPDATE public.emails SET body_text='Receipt no longer available' WHERE user_id=actor AND id=event_email.id;
  IF public.ask_purchase_order('PO-4112','{}') IS DISTINCT FROM '{"unavailable":true}'::jsonb
  THEN RAISE EXCEPTION 'changed warehouse evidence still supported answer'; END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  IF public.ask_purchase_order('PO-4112','{}') <> '{}'::jsonb
  THEN RAISE EXCEPTION 'outside user obtained purchase evidence'; END IF;
  IF has_function_privilege('anon','public.confirm_purchase_order(uuid,jsonb)','EXECUTE') OR
    has_table_privilege('authenticated','private.purchase_order_events','SELECT')
  THEN RAISE EXCEPTION 'grants expose purchase operations or audit events'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: purchase order line-level close, same-document split, approval replay, generic guard, evidence invalidation and tenant isolation' AS result;
