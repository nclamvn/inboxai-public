BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000111','operator-owner@example.test'),
 ('00000000-0000-0000-0000-000000000112','operator-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address) VALUES
 ('10000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000111','operator-work@example.test'),
 ('10000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000112','operator-other-mail@example.test');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject,received_at,direction,is_read,attachment_count,provider_deleted)
VALUES
 ('20000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','Within date','2026-11-10T16:59:59.999999Z','inbound',false,0,false),
 ('20000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','Older backup','2026-11-09T04:00Z','inbound',false,0,false),
 ('20000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','At midnight UTC+7','2026-11-10T17:00Z','inbound',false,0,false),
 ('20000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','Attachment retained','2026-11-09T17:00Z','inbound',false,1,false),
 ('20000000-0000-0000-0000-000000000115','00000000-0000-0000-0000-000000000112','10000000-0000-0000-0000-000000000112',
  'vendor@example.test','Foreign tenant','2026-11-09T17:00Z','inbound',false,0,false),
 ('20000000-0000-0000-0000-000000000116','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','Removed','2026-11-09T17:00Z','inbound',false,0,true),
 ('20000000-0000-0000-0000-000000000117','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'expiry@example.test','Expired plan source','2026-11-10T20:00Z','inbound',false,0,false),
 ('20000000-0000-0000-0000-000000000118','00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111',
  'vendor@example.test','Outbound','2026-11-09T17:00Z','outbound',false,0,false);
INSERT INTO public.emails(user_id,source_account_id,from_address,subject,direction,received_at)
SELECT '00000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000111','bulk@example.test','Bulk fixture','inbound','2026-11-13T00:00Z'::timestamptz
FROM generate_series(1,41);

DO $$
BEGIN
  IF has_function_privilege('anon','public.create_operator_plan(uuid,text,uuid,integer,date,text,boolean)','EXECUTE') OR
     has_function_privilege('service_role','public.operator_plan_action(uuid,text,text,uuid[])','EXECUTE') OR
     has_table_privilege('authenticated','private.operator_plans','UPDATE') OR
     has_table_privilege('authenticated','private.operator_events','INSERT')
  THEN RAISE EXCEPTION 'unexpected Operator privilege'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  first constant uuid := '20000000-0000-0000-0000-000000000111';
  second constant uuid := '20000000-0000-0000-0000-000000000112';
  foreign_mail constant uuid := '20000000-0000-0000-0000-000000000115';
  account constant uuid := '10000000-0000-0000-0000-000000000111';
  key uuid := gen_random_uuid();
  plan jsonb := public.create_operator_plan(key,'archive',account,NULL,'2026-11-11',NULL,true);
  plan_id uuid := (plan->>'id')::uuid;
  scope_hash text := plan->>'previewHash';
  detail jsonb := public.read_operator_plan(plan_id);
  approval jsonb;
  receipt jsonb;
  stale jsonb;
  stale_id uuid;
  new_match uuid;
BEGIN
  IF jsonb_array_length(detail->'targets') <> 2 OR detail#>>'{targets,0,id}' IS DISTINCT FROM second::text
    OR detail#>>'{targets,1,id}' IS DISTINCT FROM first::text OR detail#>>'{events,0,event}' IS DISTINCT FROM 'planned'
    OR EXISTS (SELECT 1 FROM public.emails WHERE id IN (first,second) AND is_archived IS TRUE)
    THEN RAISE EXCEPTION 'preview scope or read-only plan failed: %',detail; END IF;
  IF public.create_operator_plan(key,'archive',account,NULL,'2026-11-11',NULL,true)->>'replayed' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'plan retry duplicated the snapshot';
  END IF;
  BEGIN
    PERFORM public.create_operator_plan(key,'mark_read',account,NULL,'2026-11-11',NULL,true);
    RAISE EXCEPTION 'request key accepted changed command';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.operator_plan_action(plan_id,'execute',scope_hash,NULL);
    RAISE EXCEPTION 'execution without approval accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.operator_plan_action(plan_id,'approve',scope_hash,ARRAY[first,foreign_mail]);
    RAISE EXCEPTION 'scope expansion accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  approval := public.operator_plan_action(plan_id,'approve',scope_hash,ARRAY[first]);
  IF approval->>'status' IS DISTINCT FROM 'approved' OR EXISTS (SELECT 1 FROM public.emails WHERE id = first AND is_archived IS TRUE)
    THEN RAISE EXCEPTION 'approval changed an email'; END IF;
  IF public.operator_plan_action(plan_id,'approve',scope_hash,ARRAY[first])->>'replayed' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'approval retry not replayed';
  END IF;
  BEGIN
    PERFORM public.operator_plan_action(plan_id,'approve',scope_hash,ARRAY[first,second]);
    RAISE EXCEPTION 'existing approval accepted changed scope';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  INSERT INTO public.emails(user_id,source_account_id,from_address,subject,received_at,direction)
    VALUES('00000000-0000-0000-0000-000000000111',account,'vendor@example.test','Arrived after approval','2026-11-10T04:00Z','inbound')
    RETURNING id INTO new_match;
  receipt := public.operator_plan_action(plan_id,'execute',approval->>'approvedHash',NULL);
  IF receipt->>'appliedCount' IS DISTINCT FROM '1' OR receipt->>'status' IS DISTINCT FROM 'executed'
    OR (SELECT is_archived FROM public.emails WHERE id = first) IS NOT TRUE
    OR EXISTS (SELECT 1 FROM public.emails WHERE id IN (second,new_match) AND is_archived IS TRUE)
    THEN RAISE EXCEPTION 'execution escaped the approval'; END IF;
  UPDATE public.emails SET is_archived=false WHERE id=first;
  IF public.operator_plan_action(plan_id,'execute',approval->>'approvedHash',NULL)->>'replayed' IS DISTINCT FROM 'true'
    OR (SELECT is_archived FROM public.emails WHERE id=first) IS TRUE
    OR jsonb_array_length(public.read_operator_plan(plan_id)->'events') <> 3
    THEN RAISE EXCEPTION 'retry wrote data or duplicated audit'; END IF;

  stale := public.create_operator_plan(gen_random_uuid(),'mark_read',account,NULL,'2026-11-11',NULL,true);
  stale_id := (stale->>'id')::uuid;
  approval := public.operator_plan_action(stale_id,'approve',stale->>'previewHash',ARRAY[first,second]);
  UPDATE public.emails SET subject = 'Edited after approval' WHERE id=second;
  receipt := public.operator_plan_action(stale_id,'execute',approval->>'approvedHash',NULL);
  IF receipt->>'status' IS DISTINCT FROM 'stale' OR EXISTS (SELECT 1 FROM public.emails WHERE id IN (first,second) AND is_read IS TRUE)
    OR public.read_operator_plan(stale_id)#>>'{events,2,event}' IS DISTINCT FROM 'stale'
    THEN RAISE EXCEPTION 'stale batch wrote a subset or failed to audit'; END IF;
  IF public.create_operator_plan(gen_random_uuid(),'archive',NULL,NULL,NULL,'bulk@example.test',false)->>'status' IS DISTINCT FROM 'too_broad' THEN
    RAISE EXCEPTION 'over-cap scan produced partial approval';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000112',true);
  IF public.list_operator_plans() IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'history leaked across tenant'; END IF;
  BEGIN
    PERFORM public.read_operator_plan(plan_id);
    RAISE EXCEPTION 'foreign detail accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.operator_plan_action(plan_id,'execute',scope_hash,NULL);
    RAISE EXCEPTION 'foreign execution accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
  PERFORM public.create_operator_plan('11111111-1111-4111-8111-111111111111','archive',account,NULL,NULL,'expiry@example.test',false);
END $$;
RESET ROLE;
UPDATE private.operator_plans SET expires_at=clock_timestamp() - INTERVAL '1 second'
WHERE request_key='11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  plan jsonb := public.create_operator_plan('11111111-1111-4111-8111-111111111111','archive',
    '10000000-0000-0000-0000-000000000111',NULL,NULL,'expiry@example.test',false);
  id uuid := (plan->>'id')::uuid;
  mail uuid := '20000000-0000-0000-0000-000000000117';
  receipt jsonb;
BEGIN
  receipt := public.operator_plan_action(id,'approve',plan->>'previewHash',ARRAY[mail]);
  IF receipt->>'status' IS DISTINCT FROM 'expired'
    OR public.read_operator_plan(id)#>>'{events,1,event}' IS DISTINCT FROM 'expired'
    OR (SELECT is_archived FROM public.emails WHERE public.emails.id=mail) IS TRUE
  THEN RAISE EXCEPTION 'expired plan accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Operator immutable subset, no approval bypass, atomic stale rejection, expiration, tenant isolation and replay' AS result;
