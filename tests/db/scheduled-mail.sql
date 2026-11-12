BEGIN;

DO $$
DECLARE
  actor uuid := '90000000-0000-0000-0000-000000000001';
  account uuid := '91000000-0000-0000-0000-000000000001';
  draft_id uuid := gen_random_uuid();
  schedule_id uuid := gen_random_uuid();
  send_at timestamptz := statement_timestamp()+interval '1 hour';
  digest text := repeat('a',64);
  input jsonb := jsonb_build_object('sourceAccountId',account,'to',jsonb_build_array('recipient@example.test'),
    'cc','[]'::jsonb,'bcc','[]'::jsonb,'subject','Scheduled fixture','text','Synthetic draft');
  payload jsonb := (input-'sourceAccountId')||'{"from":{"name":"Fixture","address":"legacy-vault@example.test"}}';
  receipt jsonb;
  approval uuid;
  lease uuid;
BEGIN
  IF has_function_privilege('anon','public.list_scheduled_mail()','EXECUTE')
     OR has_function_privilege('authenticated','public.claim_scheduled_mail()','EXECUTE')
     OR has_function_privilege('service_role','private.begin_mail_send(uuid,uuid,uuid,text,jsonb)','EXECUTE')
     OR has_table_privilege('authenticated','private.scheduled_mail','SELECT')
  THEN RAISE EXCEPTION 'scheduled send grants too broad'; END IF;

  INSERT INTO private.file_compose_drafts(id,user_id,account_id,fields,file_ids)
  VALUES(draft_id,actor,account,'{"to":"recipient@example.test","cc":"","subject":"Scheduled fixture","body":"Synthetic draft"}','{}');
  IF public.create_scheduled_mail(actor,'compose',draft_id,1,send_at,schedule_id,input,digest)<>schedule_id
    OR public.create_scheduled_mail(actor,'compose',draft_id,1,send_at,schedule_id,input,digest)<>schedule_id
  THEN RAISE EXCEPTION 'stable schedule confirmation failed'; END IF;
  IF public.claim_scheduled_mail()<>'[]'::jsonb THEN RAISE EXCEPTION 'claimed before due'; END IF;
  SELECT request_key INTO STRICT approval FROM private.file_compose_drafts WHERE id=draft_id;
  BEGIN
    PERFORM public.begin_mail_send(actor,account,approval,digest,payload);
    RAISE EXCEPTION 'generic route bypassed the schedule';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.begin_file_compose(actor,account,draft_id,approval,digest,payload);
    RAISE EXCEPTION 'compose route bypassed the schedule';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  UPDATE private.scheduled_mail SET send_at=statement_timestamp()-interval '1 second' WHERE id=schedule_id;
  lease := (public.claim_scheduled_mail()->0->>'lease')::uuid;
  IF lease IS NULL OR public.claim_scheduled_mail()<>'[]'::jsonb THEN RAISE EXCEPTION 'lease did not fence overlapping workers'; END IF;
  BEGIN
    PERFORM public.begin_scheduled_mail_send(actor,account,schedule_id,gen_random_uuid(),approval,digest,payload);
    RAISE EXCEPTION 'stale worker could dispatch';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  BEGIN
    PERFORM public.change_scheduled_mail(schedule_id,1,'cancel');
    RAISE EXCEPTION 'cancel won after the worker acquired the lease';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  receipt := public.begin_scheduled_mail_send(actor,account,schedule_id,lease,approval,digest,payload);
  IF NOT (receipt->>'claimed')::boolean THEN RAISE EXCEPTION 'leased worker did not claim'; END IF;
  IF (public.begin_scheduled_mail_send(actor,account,schedule_id,lease,approval,digest,payload)->>'claimed')::boolean
  THEN RAISE EXCEPTION 'lease replay won a second dispatch'; END IF;

  -- Expire the worker without finish to model a process exit during dispatch.
  UPDATE private.scheduled_mail SET lease_until=clock_timestamp()-interval '1 second' WHERE id=schedule_id;
  IF (public.claim_scheduled_mail()->0->>'lease')::uuid IS NOT DISTINCT FROM lease
  THEN RAISE EXCEPTION 'expired lease was not replaced'; END IF;
  IF public.begin_mail_send(actor,account,approval,digest)->>'id' IS DISTINCT FROM receipt->>'id'
  THEN RAISE EXCEPTION 'process exit lost the durable send receipt'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: schedule grants, future-time fence, claim race, cancellation fence and durable receipt after worker exit' AS result;
