\if :seed_operator_legacy
CREATE TEMP TABLE operator_upgrade_policy AS SELECT enabled FROM public.registration_policy;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000121','operator-legacy@example.test');
INSERT INTO public.emails(id,user_id,from_address,subject,direction,is_archived)
VALUES('20000000-0000-0000-0000-000000000121','00000000-0000-0000-0000-000000000121',
  'legacy-vendor@example.test','Legacy receipt','inbound',NULL);
UPDATE public.registration_policy SET enabled = (SELECT enabled FROM operator_upgrade_policy LIMIT 1);
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000121',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  plan jsonb := public.create_operator_plan(gen_random_uuid(),'archive',NULL,NULL,NULL,'legacy-vendor@example.test',false);
  id uuid := (plan->>'id')::uuid;
  approval jsonb;
BEGIN
  approval := public.operator_plan_action(id,'approve',plan->>'previewHash',ARRAY['20000000-0000-0000-0000-000000000121'::uuid]);
  IF public.operator_plan_action(id,'execute',approval->>'approvedHash',NULL)->>'status' <> 'executed' THEN
    RAISE EXCEPTION 'legacy fixture did not execute';
  END IF;
END $$;
COMMIT;
\else
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000121',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  id uuid := (public.list_operator_plans()#>>'{0,id}')::uuid;
  plan jsonb := public.read_operator_plan(id);
  receipt jsonb;
BEGIN
  IF plan#>>'{outcome,tracked}' IS DISTINCT FROM 'false' OR plan#>>'{outcome,undoHash}' IS NOT NULL
    OR plan#>>'{outcome,targets,0,state}' IS DISTINCT FROM 'matched'
    THEN RAISE EXCEPTION 'legacy outcome incorrectly reversible or lost'; END IF;
  receipt := public.operator_outcome_action(id,'verify',gen_random_uuid(),NULL);
  IF receipt->>'matched' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'legacy flag check failed'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000121';
COMMIT;
SELECT 'PASS: M5-B upgrade verifies a real pre-migration execution without fabricating undo state' AS result;
\endif
