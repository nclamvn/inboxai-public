BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000096','answer-owner@example.test'),
 ('00000000-0000-0000-0000-000000000097','answer-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address) VALUES
 ('10000000-0000-0000-0000-000000000096','00000000-0000-0000-0000-000000000096','answer-work@example.test'),
 ('10000000-0000-0000-0000-000000000097','00000000-0000-0000-0000-000000000097','answer-foreign@example.test');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject,body_text,received_at,provider_deleted,is_deleted)
VALUES
 ('20000000-0000-0000-0000-000000000096','00000000-0000-0000-0000-000000000096','10000000-0000-0000-0000-000000000096',
 'vendor@example.test','Invoice INV-841','Payment due: 2026-11-19.','2026-11-09T17:00Z',false,false),
 ('20000000-0000-0000-0000-000000000097','00000000-0000-0000-0000-000000000096',NULL,
 'ops@example.test','Receipt','INV-841 Invoice total: 100 USD.','2026-11-10T16:59:59.999999Z',false,false),
 ('20000000-0000-0000-0000-000000000098','00000000-0000-0000-0000-000000000097','10000000-0000-0000-0000-000000000097',
 'vendor@example.test','Invoice INV-841','Payment due: 2026-11-30.','2026-11-10T20:00Z',false,false),
 ('20000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000096',NULL,
 'vendor@example.test','Invoice INV-8410','Longer ID should be skipped.','2026-11-12T00:00Z',false,false),
 ('20000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000096',NULL,
 'vendor@example.test','Invoice INV-841-2','A distinct ID must be skipped.','2026-11-12T00:00Z',false,false),
 ('20000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000096',NULL,
 'vendor@example.test','Invoice INV-841','Removed in provider.','2026-11-12T00:00Z',true,false),
 ('20000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000096',NULL,
 'vendor@example.test','Invoice INV-841','Moved to trash.','2026-11-12T00:00Z',false,true);
INSERT INTO public.emails(user_id,from_address,subject,body_text)
SELECT '00000000-0000-0000-0000-000000000096','vendor@example.test','Batch REF-221',
  CASE WHEN n = 25 THEN repeat('x ',12200) ELSE 'Payment due: 2026-11-19.' END
FROM generate_series(1,25) n;

DO $$
BEGIN
  IF has_function_privilege('anon','public.ask_inbox_reference_evidence(text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','public.ask_inbox_reference_evidence(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.ask_inbox_source_status(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'unexpected answer access grant'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000096',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  evidence jsonb := public.ask_inbox_reference_evidence('INV-841','{}');
  current_id constant uuid := '20000000-0000-0000-0000-000000000096';
  v text := evidence#>>'{sources,1,version}';
  capped jsonb;
BEGIN
  IF jsonb_array_length(evidence->'sources') <> 2 OR evidence#>>'{sources,0,id}' IS DISTINCT FROM '20000000-0000-0000-0000-000000000097'
    OR evidence#>>'{sources,1,id}' IS DISTINCT FROM current_id::text OR evidence->>'capped' IS DISTINCT FROM 'false'
    OR public.ask_inbox_source_status(current_id,v) IS DISTINCT FROM 'current'
  THEN RAISE EXCEPTION 'reference boundaries, visibility, order or fingerprint failed: %',evidence; END IF;
  IF jsonb_array_length(public.ask_inbox_reference_evidence('INV-841',
     '{"accounts":["10000000-0000-0000-0000-000000000096"],"fromAt":"2026-11-09T17:00:00Z","beforeAt":"2026-11-10T17:00:00Z"}')->'sources') <> 1 THEN
    RAISE EXCEPTION 'answer filters not intersected';
  END IF;
  capped := public.ask_inbox_reference_evidence('REF-221','{}');
  IF capped->>'capped' IS DISTINCT FROM 'true' OR jsonb_array_length(capped->'sources') <> 24 THEN
    RAISE EXCEPTION 'evidence cap was not surfaced';
  END IF;
  BEGIN
    PERFORM public.ask_inbox_reference_evidence('INV-841','{"accounts":["10000000-0000-0000-0000-000000000097"]}');
    RAISE EXCEPTION 'foreign account accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;

  UPDATE public.emails SET body_text = 'Payment due: 2026-11-22.' WHERE id = current_id;
  IF public.ask_inbox_source_status(current_id,v) IS DISTINCT FROM 'changed' THEN RAISE EXCEPTION 'edited source stayed current'; END IF;
  UPDATE public.emails SET provider_deleted = true WHERE id = current_id;
  IF public.ask_inbox_source_status(current_id,v) IS DISTINCT FROM 'unavailable' THEN RAISE EXCEPTION 'deleted source stayed accessible'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000097',true);
  IF public.ask_inbox_source_status(current_id,v) IS DISTINCT FROM 'unavailable' OR
    jsonb_array_length(public.ask_inbox_reference_evidence('INV-841','{}')->'sources') <> 1 THEN
    RAISE EXCEPTION 'other tenant can see a foreign source';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Ask Inbox answer scope, exact references, capped sources, and citation versions across edits and deletion' AS result;
