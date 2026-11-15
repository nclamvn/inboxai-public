\if :seed_commitment_legacy
BEGIN;
CREATE TEMP TABLE commitment_upgrade_policy AS SELECT enabled FROM public.registration_policy;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-0000-0000-000000000141','commitment-legacy@example.test'),
  ('00000000-0000-0000-0000-000000000142','commitment-foreign@example.test');
UPDATE public.registration_policy SET enabled = (SELECT enabled FROM commitment_upgrade_policy LIMIT 1);
INSERT INTO public.source_accounts(id,user_id,email_address,provider)
VALUES('30000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000141','buyer@example.test','custom');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject,body_text,received_at,created_at)
VALUES
 ('20000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000141',
  '30000000-0000-0000-0000-000000000141','Vendor@Example.test','Re: [QA-841] qa-841',
  'I will send the report.', '2026-11-12T08:00:00Z','2026-11-12T08:00:00Z'),
 ('20000000-0000-0000-0000-000000000142','00000000-0000-0000-0000-000000000141',
  '30000000-0000-0000-0000-000000000141','Vendor@Example.test','Re: [QA-841] completion',
  'I have completed the commitment.', '2026-11-13T08:00:00Z','2026-11-13T08:00:00Z');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000141',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  email_id constant uuid := '20000000-0000-0000-0000-000000000141';
  ref constant text := 'mail:' || encode(sha256(convert_to(
    '["30000000-0000-0000-0000-000000000141","vendor@example.test","QA-841"]', 'UTF8')), 'hex');
  fp text := public.scan_commitment_mail(NULL)#>>'{messages,1,fingerprint}';
BEGIN
  PERFORM public.confirm_commitment_detection(gen_random_uuid(),email_id,fp,NULL,NULL,ref,
    '{"title":"send the report","ownerName":null,"ownerEmail":"vendor@example.test","dueOn":null,"dueAt":null,"status":"open"}',
    jsonb_build_array(jsonb_build_object('emailId',email_id,'field','body_text','quote','I will send the report.')));
END $$;
COMMIT;
\else
BEGIN;
DO $$
BEGIN
  IF has_function_privilege('anon','public.read_commitment_lifecycle_targets(text[])','EXECUTE')
    OR has_function_privilege('authenticated','private.commitment_lifecycle_targets(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'lifecycle target grants too broad'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000141',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  email_id constant uuid := '20000000-0000-0000-0000-000000000142';
  target jsonb := public.read_commitment_lifecycle_targets(ARRAY['QA-841'])->0;
  fp text := public.scan_commitment_mail(NULL)#>>'{messages,0,fingerprint}';
  evidence jsonb := jsonb_build_array(jsonb_build_object('emailId',email_id,'field','body_text','quote','I have completed the commitment.'));
  completed jsonb := '{"title":"send the report","ownerName":null,"ownerEmail":"vendor@example.test","dueOn":null,"dueAt":null,"status":"completed"}';
  receipt jsonb;
BEGIN
  IF target->>'originId' IS DISTINCT FROM '20000000-0000-0000-0000-000000000141'
    OR target->>'version' IS DISTINCT FROM '1' OR target->>'multiOrigin' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'legacy origin missing'; END IF;

  UPDATE public.emails SET body_text = 'New body' WHERE id='20000000-0000-0000-0000-000000000141';
  BEGIN
    PERFORM public.confirm_commitment_detection(gen_random_uuid(),email_id,fp,(target->>'id')::uuid,1,
      target->>'referenceKey',completed,evidence);
    RAISE EXCEPTION 'history with changed evidence accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  UPDATE public.emails SET body_text = 'I will send the report.' WHERE id='20000000-0000-0000-0000-000000000141';
  receipt := public.confirm_commitment_detection(gen_random_uuid(),email_id,fp,(target->>'id')::uuid,1,
    target->>'referenceKey',completed,evidence);
  IF receipt->>'id' IS DISTINCT FROM target->>'id' OR receipt->>'version' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'legacy commitment did not revise in place';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000142',true);
  IF public.read_commitment_lifecycle_targets(ARRAY['QA-841']) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'foreign commitment leaked by case reference';
  END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000142');
COMMIT;
SELECT 'PASS: legacy detection identity survives upgrade; altered historical quotes and foreign case reads fail closed' AS result;
\endif
