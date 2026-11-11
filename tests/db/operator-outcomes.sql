BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000122','operator-outcomes@example.test'),
 ('00000000-0000-0000-0000-000000000123','operator-outcomes-other@example.test');
INSERT INTO public.emails(id,user_id,from_address,subject,direction,is_read,is_archived) VALUES
 ('20000000-0000-0000-0000-000000000122','00000000-0000-0000-0000-000000000122','read@example.test','Null read','inbound',NULL,false),
 ('20000000-0000-0000-0000-000000000123','00000000-0000-0000-0000-000000000122','read@example.test','False read','inbound',false,false),
 ('20000000-0000-0000-0000-000000000124','00000000-0000-0000-0000-000000000122','archive@example.test','Newer activity','inbound',false,NULL),
 ('20000000-0000-0000-0000-000000000125','00000000-0000-0000-0000-000000000122','archive@example.test','Later removed','inbound',false,false),
 ('20000000-0000-0000-0000-000000000126','00000000-0000-0000-0000-000000000122','archive@example.test','Still matching','inbound',false,false);

DO $$
BEGIN
  IF has_function_privilege('anon','public.operator_outcome_action(uuid,text,uuid,text)','EXECUTE') OR
     has_function_privilege('service_role','public.operator_outcome_action(uuid,text,uuid,text)','EXECUTE') OR
     has_function_privilege('authenticated','private.operator_plan_action(uuid,text,text,uuid[])','EXECUTE') OR
     has_table_privilege('authenticated','private.operator_effects','INSERT') THEN
    RAISE EXCEPTION 'Outcome permissions allow bypass';
  END IF;
END $$;

CREATE FUNCTION pg_temp.fail_operator_undo_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('operator.test_fail_undo',true) = '1' THEN
    RAISE EXCEPTION 'Synthetic audit rejection' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_operator_undo_audit BEFORE INSERT ON private.operator_outcome_events
  FOR EACH ROW WHEN (NEW.event = 'undone') EXECUTE FUNCTION pg_temp.fail_operator_undo_audit();

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000122',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  first constant uuid := '20000000-0000-0000-0000-000000000122';
  second constant uuid := '20000000-0000-0000-0000-000000000123';
  changed constant uuid := '20000000-0000-0000-0000-000000000124';
  deleted constant uuid := '20000000-0000-0000-0000-000000000125';
  intact constant uuid := '20000000-0000-0000-0000-000000000126';
  id uuid;
  plan jsonb;
  approval jsonb;
  result jsonb;
  undo_hash text;
  verify_key uuid := gen_random_uuid();
  undo_key uuid := gen_random_uuid();
BEGIN
  plan := public.create_operator_plan(gen_random_uuid(),'mark_read',NULL,NULL,NULL,'read@example.test',false);
  id := (plan->>'id')::uuid;
  BEGIN
    PERFORM public.operator_outcome_action(id,'verify',verify_key,NULL);
    RAISE EXCEPTION 'verified an unexecuted plan';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  approval := public.operator_plan_action(id,'approve',plan->>'previewHash',ARRAY[first,second]);
  PERFORM public.operator_plan_action(id,'execute',approval->>'approvedHash',NULL);
  PERFORM public.operator_plan_action(id,'execute',approval->>'approvedHash',NULL);
  plan := public.read_operator_plan(id);
  undo_hash := plan#>>'{outcome,undoHash}';
  IF plan#>>'{outcome,tracked}' IS DISTINCT FROM 'true' OR undo_hash IS NULL OR
     plan#>>'{outcome,events,0,matched}' IS DISTINCT FROM '2' OR jsonb_array_length(plan#>'{outcome,events}') <> 1 THEN
    RAISE EXCEPTION 'missing or duplicate automatic verification';
  END IF;
  result := public.operator_outcome_action(id,'verify',verify_key,NULL);
  IF result->>'matched' IS DISTINCT FROM '2' OR public.operator_outcome_action(id,'verify',verify_key,NULL)->>'replayed' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'verification does not replay'; END IF;
  BEGIN
    PERFORM public.operator_outcome_action(id,'undo',verify_key,undo_hash);
    RAISE EXCEPTION 'verification key accepted for undo';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM set_config('operator.test_fail_undo','1',true);
  BEGIN
    PERFORM public.operator_outcome_action(id,'undo',undo_key,undo_hash);
    RAISE EXCEPTION 'undo accepted without its audit entry';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  PERFORM set_config('operator.test_fail_undo','0',true);
  IF (SELECT is_read FROM public.emails WHERE public.emails.id = first) IS NOT TRUE OR
    (SELECT is_read FROM public.emails WHERE public.emails.id = second) IS NOT TRUE OR
    jsonb_array_length(public.read_operator_plan(id)#>'{outcome,events}') <> 2
  THEN RAISE EXCEPTION 'audit failure did not roll back the undo'; END IF;
  result := public.operator_outcome_action(id,'undo',undo_key,undo_hash);
  IF result->>'event' IS DISTINCT FROM 'undone' OR
    (SELECT is_read FROM public.emails WHERE public.emails.id = first) IS NOT NULL OR
    (SELECT is_read FROM public.emails WHERE public.emails.id = second) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'undo did not restore exact original flags';
  END IF;
  UPDATE public.emails SET is_read=true WHERE public.emails.id=first;
  IF public.operator_outcome_action(id,'undo',gen_random_uuid(),undo_hash)->>'id' IS DISTINCT FROM undo_key::text OR
    (SELECT is_read FROM public.emails WHERE public.emails.id = first) IS NOT TRUE OR
    jsonb_array_length(public.read_operator_plan(id)#>'{outcome,events}') <> 3 THEN
    RAISE EXCEPTION 'undo replay altered newer state or audit';
  END IF;

  plan := public.create_operator_plan(gen_random_uuid(),'archive',NULL,NULL,NULL,'archive@example.test',false);
  id := (plan->>'id')::uuid;
  approval := public.operator_plan_action(id,'approve',plan->>'previewHash',ARRAY[changed,deleted,intact]);
  PERFORM public.operator_plan_action(id,'execute',approval->>'approvedHash',NULL);
  UPDATE public.emails SET is_archived=false WHERE public.emails.id=changed;
  UPDATE public.emails SET is_archived=true WHERE public.emails.id=changed;
  UPDATE public.emails SET provider_deleted=true WHERE public.emails.id=deleted;
  plan := public.read_operator_plan(id);
  undo_hash := plan#>>'{outcome,undoHash}';
  result := public.operator_outcome_action(id,'undo',gen_random_uuid(),undo_hash);
  IF result->>'event' IS DISTINCT FROM 'undo_blocked' OR result->>'changed' IS DISTINCT FROM '1'
    OR result->>'unavailable' IS DISTINCT FROM '1' OR result->>'matched' IS DISTINCT FROM '1'
    OR (SELECT is_archived FROM public.emails WHERE public.emails.id = intact) IS NOT TRUE THEN
    RAISE EXCEPTION 'undo overwrote changed/restored flag or partially applied';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000123',true);
  BEGIN
    PERFORM public.operator_outcome_action(id,'undo',gen_random_uuid(),undo_hash);
    RAISE EXCEPTION 'foreign undo accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Operator verify, exact false/null undo, request replay, ABA and missing-source guards, atomic audit and tenant isolation' AS result;
