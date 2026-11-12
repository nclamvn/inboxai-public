BEGIN;
DO $$
DECLARE
  actor uuid := '90000000-0000-0000-0000-000000000001';
  account uuid := '91000000-0000-0000-0000-000000000001';
  target uuid;
  operation uuid := gen_random_uuid();
  lease jsonb;
  job jsonb;
  sync_lease jsonb;
  sync_message jsonb := '{"uid":"triage-sql","message_id":"<triage@example.test>","from_address":"fixture@example.test",
    "subject":"Label ordering","body_text":"Fixture","received_at":"2026-11-11T00:00:00Z","is_read":false,
    "is_starred":false,"is_archived":false,"is_deleted":false,"direction":"inbound","attachments":[],"gmail_label_revision":"100"}';
BEGIN
  IF has_function_privilege('anon','public.gmail_triage_list(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.gmail_triage_create(uuid,uuid,text,boolean,uuid[],uuid)','EXECUTE')
    OR has_table_privilege('authenticated','private.gmail_triage_items','SELECT') THEN
    RAISE EXCEPTION 'Label work leaked outside the service boundary';
  END IF;

  sync_lease:=public.claim_account_sync(actor,account,'gmail');
  PERFORM public.commit_account_sync_page(actor,account,(sync_lease->>'id')::uuid,(sync_lease->>'fence')::bigint,0,
    '{"provider":"gmail","phase":"history","historyId":"100"}','gmail',jsonb_build_array(sync_message),'[]');
  SELECT id INTO STRICT target FROM public.emails WHERE user_id=actor AND source_account_id=account AND original_uid='triage-sql';

  PERFORM public.gmail_triage_create(actor,operation,'archived',true,ARRAY[target],NULL);
  PERFORM public.gmail_triage_create(actor,operation,'archived',true,ARRAY[target],NULL);
  BEGIN
    PERFORM public.gmail_triage_create(actor,operation,'read',true,ARRAY[target],NULL);
    RAISE EXCEPTION 'Replayed key accepted different scope';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF public.gmail_triage_list(gen_random_uuid(),operation) <> '[]'::jsonb THEN RAISE EXCEPTION 'Foreign job returned'; END IF;
  IF public.gmail_triage_claim(gen_random_uuid(),operation,target) IS NOT NULL THEN RAISE EXCEPTION 'Foreign claim acquired'; END IF;

  lease:=public.gmail_triage_claim(actor,operation,target);
  IF lease IS NULL OR public.gmail_triage_claim(actor,operation,target) IS NOT NULL THEN
    RAISE EXCEPTION 'Expected exactly one lease';
  END IF;
  PERFORM public.gmail_triage_record(actor,operation,target,(lease->>'lease')::uuid,'before','100',false);
  PERFORM public.gmail_triage_record(actor,operation,target,(lease->>'lease')::uuid,'receipt','102');
  PERFORM public.gmail_triage_record(actor,operation,target,(lease->>'lease')::uuid,'verified','102',NULL,
    '{"archived":true,"read":false,"starred":false}','applied');

  PERFORM public.commit_account_sync_page(actor,account,(sync_lease->>'id')::uuid,(sync_lease->>'fence')::bigint,1,
    '{"provider":"gmail","phase":"history","historyId":"101"}','gmail',
    jsonb_build_array(sync_message || '{"gmail_label_revision":"101"}'::jsonb),'[]');
  IF NOT EXISTS(SELECT 1 FROM public.emails WHERE id=target AND is_archived AND gmail_label_revision=102
    AND sync_provider_flags->>'archived'='true') THEN RAISE EXCEPTION 'Stale sync page regressed a verified label'; END IF;

  PERFORM public.commit_account_sync_page(actor,account,(sync_lease->>'id')::uuid,(sync_lease->>'fence')::bigint,2,
    '{"provider":"gmail","phase":"history","historyId":"103"}','gmail',
    jsonb_build_array(sync_message || '{"gmail_label_revision":"103"}'::jsonb),'[]');
  IF NOT EXISTS(SELECT 1 FROM public.emails WHERE id=target AND NOT is_archived AND gmail_label_revision=103)
    THEN RAISE EXCEPTION 'New provider change not imported'; END IF;
  job:=public.gmail_triage_list(actor,operation)->0;
  IF job->'items'->0->>'state'<>'verified' THEN RAISE EXCEPTION 'Verification receipt was lost'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: Gmail triage service grants, replay scope, exclusive claims and monotonic labels' AS result;
