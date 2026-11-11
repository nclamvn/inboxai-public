BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000081','detect-owner@example.test'),
 ('00000000-0000-0000-0000-000000000082','detect-other@example.test');
INSERT INTO public.emails(id,user_id,from_address,subject,body_text,created_at,provider_deleted)
VALUES
 ('20000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000081','vendor@example.test','PO-418','We will send the test invoice.', '2026-11-12',false),
 ('20000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000082','vendor@example.test','PO-418','We will deliver the test cable.', '2026-11-13',false),
 ('20000000-0000-0000-0000-000000000083','00000000-0000-0000-0000-000000000081','vendor@example.test','PO-418','We have completed the commitment.', '2026-11-14',true);
INSERT INTO public.emails(user_id,from_address,subject,created_at)
SELECT '00000000-0000-0000-0000-000000000081','vendor@example.test','Older fixture','2026-11-10'
FROM generate_series(1,24);

DO $$
BEGIN
  IF has_function_privilege('anon','public.scan_commitment_mail(uuid)','EXECUTE') OR
     has_function_privilege('anon','public.read_commitment_detection_targets(text[])','EXECUTE') OR
     has_function_privilege('anon','public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb)','EXECUTE') OR
     has_function_privilege('service_role','public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'unexpected detection grant'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  own constant uuid := '20000000-0000-0000-0000-000000000081';
  foreign_id constant uuid := '20000000-0000-0000-0000-000000000082';
  ref constant text := 'mail:' || repeat('1',64);
  request_id constant uuid := gen_random_uuid();
  snapshot constant jsonb := '{"title":"send the test invoice","ownerName":null,"ownerEmail":"vendor@example.test","dueOn":null,"dueAt":null,"status":"open"}';
  evidence constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000081","field":"body_text","quote":"We will send the test invoice."}]';
  page jsonb := public.scan_commitment_mail(NULL);
  first_digest text := page#>>'{messages,0,fingerprint}';
  receipt jsonb;
BEGIN
  IF jsonb_array_length(page->'messages') <> 24 OR page#>>'{messages,0,id}' IS DISTINCT FROM own::text OR
     jsonb_array_length(public.scan_commitment_mail((page->>'nextBeforeId')::uuid)->'messages') <> 1 OR
     jsonb_array_length(public.list_commitments(10,NULL)->'items') <> 0 THEN
    RAISE EXCEPTION 'scan leaked, omitted or wrote a ledger row';
  END IF;
  BEGIN
    PERFORM public.scan_commitment_mail(foreign_id);
    RAISE EXCEPTION 'foreign cursor accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;

  UPDATE public.emails SET body_text = body_text || ' Additional context' WHERE id = own;
  BEGIN
    PERFORM public.confirm_commitment_detection(request_id,own,first_digest,NULL,NULL,ref,snapshot,evidence);
    RAISE EXCEPTION 'stale preview accepted although its quote is still present';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  first_digest := public.scan_commitment_mail(NULL)#>>'{messages,0,fingerprint}';
  receipt := public.confirm_commitment_detection(request_id,own,first_digest,NULL,NULL,ref,snapshot,evidence);
  IF (receipt->>'version')::integer <> 1 OR public.scan_commitment_mail(NULL)#>>'{messages,0,used}' <> 'true' OR
     public.read_commitment_detection_targets(ARRAY[ref])#>>'{0,id}' <> receipt->>'id' THEN
    RAISE EXCEPTION 'approval did not atomically publish the ledger and consumed source';
  END IF;
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),own,first_digest,NULL,NULL,'mail:'||repeat('2',64),snapshot,evidence);
    RAISE EXCEPTION 'same source accepted twice';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  DELETE FROM public.emails WHERE id = own;
  IF public.confirm_commitment_detection(request_id,own,first_digest,NULL,NULL,ref,snapshot,evidence)->>'replayed' <> 'true' OR
     public.read_commitment_detection_targets(ARRAY[ref])#>>'{0,lastSourceAt}' IS NOT NULL THEN
    RAISE EXCEPTION 'receipt replay or missing-source chronology failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000082',true);
  IF public.read_commitment_detection_targets(ARRAY[ref]) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'foreign detection target leaked';
  END IF;
  BEGIN
    PERFORM public.confirm_commitment_detection(request_id,own,first_digest,NULL,NULL,ref,snapshot,evidence);
    RAISE EXCEPTION 'foreign confirmation replay accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: detection scan cursor, stale source, confirmed receipt, tenant isolation and replay' AS result;
