BEGIN;
UPDATE public.registration_policy SET enabled=true;
DO $$
DECLARE
  actor uuid := gen_random_uuid(); buyer uuid := gen_random_uuid(); technical uuid := gen_random_uuid();
  origin public.emails; update_mail public.emails; proposal public.emails; receipt jsonb; result jsonb;
  key text;
  state jsonb := '{"title":"Giao 200 bộ gá","ownerEmail":"supplier@example.test","ownerName":null,"dueOn":"2026-11-15","dueAt":null,"status":"open","delivery":{"ordered":200,"delivered":0,"unit":"bộ"}}';
BEGIN
  INSERT INTO auth.users(id,email) VALUES(actor,'delivery-test@example.test');
  INSERT INTO public.source_accounts(id,user_id,email_address,provider)
    VALUES(buyer,actor,'buyer@example.test','custom'),(technical,actor,'technical@example.test','custom');
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at)
    VALUES(actor,buyer,'[PO-1031] Đơn vật tư','supplier@example.test',
      'Chúng tôi xác nhận giao 200 bộ gá vào ngày 15/11/2026.','2026-11-10T01:00:00Z') RETURNING * INTO origin;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  key := private.commitment_case_key(buyer,'supplier@example.test','PO-1031');
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),origin.id,private.commitment_detection_fingerprint(origin),
      NULL,NULL,key,state||'{"dueOn":"2026-11-19"}',
      jsonb_build_array(jsonb_build_object('emailId',origin.id,'field','body_text','quote',origin.body_text)));
    RAISE EXCEPTION 'original evidence authorized a different deadline';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  receipt := public.confirm_commitment_detection(gen_random_uuid(),origin.id,private.commitment_detection_fingerprint(origin),
    NULL,NULL,key,state,jsonb_build_array(jsonb_build_object('emailId',origin.id,'field','body_text','quote',origin.body_text)));
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at)
    VALUES(actor,buyer,'[PO-1031] Đề nghị','supplier@example.test',
      'Bên em đề nghị dời lịch giao sang 19/11/2026.','2026-11-11T01:00:00Z') RETURNING * INTO proposal;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),(receipt->>'id')::uuid,1,NULL,state-'delivery',NULL,
      jsonb_build_array(jsonb_build_object('emailId',proposal.id,'field','body_text','quote',proposal.body_text)));
    RAISE EXCEPTION 'generic edit removed delivery terms';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),(receipt->>'id')::uuid,1,NULL,state||'{"dueOn":"2026-11-19"}',NULL,
      jsonb_build_array(jsonb_build_object('emailId',proposal.id,'field','body_text','quote',proposal.body_text)));
    RAISE EXCEPTION 'generic edit changed delivery date without confirmation';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),proposal.id,private.commitment_detection_fingerprint(proposal),
      (receipt->>'id')::uuid,1,key,state||'{"dueOn":"2026-11-19"}',
      jsonb_build_array(jsonb_build_object('emailId',proposal.id,'field','body_text','quote',proposal.body_text)));
    RAISE EXCEPTION 'unconfirmed date became effective';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  INSERT INTO public.emails(user_id,source_account_id,subject,from_address,body_text,received_at)
    VALUES(actor,technical,'[PO-1031] Giao một phần','supplier@example.test',
      'Chúng tôi đã giao lũy kế 50/200 bộ.','2026-11-12T01:00:00Z') RETURNING * INTO update_mail;
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),update_mail.id,private.commitment_detection_fingerprint(update_mail),
      (receipt->>'id')::uuid,1,key,state||'{"status":"completed","delivery":{"ordered":200,"delivered":200,"unit":"bộ"}}',
      jsonb_build_array(jsonb_build_object('emailId',update_mail.id,'field','body_text','quote',update_mail.body_text)));
    RAISE EXCEPTION 'partial evidence became full delivery';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  result := public.confirm_commitment_detection(gen_random_uuid(),update_mail.id,private.commitment_detection_fingerprint(update_mail),
    (receipt->>'id')::uuid,1,key,jsonb_set(state,'{delivery,delivered}','50'),
    jsonb_build_array(jsonb_build_object('emailId',update_mail.id,'field','body_text','quote',update_mail.body_text)));
  IF result->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'partial delivery revision missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.commitment_revisions AS revision
    WHERE revision.user_id=actor AND revision.commitment_id=(receipt->>'id')::uuid
      AND revision.version=2 AND revision.state->>'status'='open' AND revision.state->>'dueOn'='2026-11-15'
      AND revision.state#>>'{delivery,delivered}'='50')
  THEN RAISE EXCEPTION 'partial delivery mutated confirmed terms'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: confirmed date cannot be replaced by a request, and partial evidence cannot close delivery' AS result;
