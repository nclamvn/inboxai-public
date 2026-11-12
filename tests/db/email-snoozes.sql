BEGIN;

CREATE OR REPLACE FUNCTION private.email_snooze_now() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$ SELECT TIMESTAMPTZ '2030-01-03 09:00+07' $$;

DO $test$
DECLARE
  actor uuid := '90000000-0000-0000-0000-000000000001';
  account uuid := '91000000-0000-0000-0000-000000000001';
  target uuid;
  request uuid := gen_random_uuid();
  due timestamptz := TIMESTAMPTZ '2030-01-03 10:00+07';
  moved timestamptz := TIMESTAMPTZ '2030-01-03 11:00+07';
  result jsonb;
BEGIN
  IF has_function_privilege('anon','public.change_email_snooze(uuid,integer,timestamptz,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','private.email_snooze_receipts','SELECT') THEN
    RAISE EXCEPTION 'Schedule permissions are too broad';
  END IF;

  INSERT INTO public.emails(user_id,source_account_id,original_uid,sync_namespace,from_address,subject,received_at,direction,is_starred)
    VALUES(actor,account,'snooze-sql','gmail','snooze@example.test','Same schedule',
      '2026-01-01 00:00+00','inbound',true) RETURNING id INTO target;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.change_email_snooze(target,0,due,request);
  IF result->>'version'<>'1' THEN RAISE EXCEPTION 'Schedule not versioned'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.emails e WHERE id=target AND public.email_is_snoozed(e)
    AND inbox_appearance_at=due AND is_starred AND NOT is_archived) THEN RAISE EXCEPTION 'Future schedule or flags incorrect'; END IF;

  IF public.change_email_snooze(target,0,due,request)<>result THEN RAISE EXCEPTION 'Replay changed receipt'; END IF;
  BEGIN
    PERFORM public.change_email_snooze(target,0,moved,request);
    RAISE EXCEPTION 'Replay accepted changed input';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM public.change_email_snooze(target,1,moved,gen_random_uuid());
  BEGIN
    PERFORM public.change_email_snooze(target,1,NULL,gen_random_uuid());
    RAISE EXCEPTION 'Outdated cancellation accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF (public.email_snooze_clock(ARRAY[account])->>'nextAt')::timestamptz IS DISTINCT FROM moved THEN
    RAISE EXCEPTION 'Clock did not return moved deadline';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
    PERFORM public.change_email_snooze(target,2,NULL,gen_random_uuid());
    RAISE EXCEPTION 'Foreign schedule was changed';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  IF public.email_snooze_clock(ARRAY[account])->>'nextAt' IS NOT NULL THEN RAISE EXCEPTION 'Foreign deadline exposed'; END IF;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  EXECUTE $clock$CREATE OR REPLACE FUNCTION private.email_snooze_now() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path='' AS $$ SELECT TIMESTAMPTZ '2030-01-03 11:00+07' $$ $clock$;
  IF NOT EXISTS(SELECT 1 FROM public.emails e WHERE id=target AND NOT public.email_is_snoozed(e) AND snooze_version=2) THEN
    RAISE EXCEPTION 'Schedule did not become visible exactly at the deadline';
  END IF;
  PERFORM public.change_email_snooze(target,2,NULL,gen_random_uuid());
  IF NOT EXISTS(SELECT 1 FROM public.emails WHERE id=target AND snoozed_until IS NULL
    AND inbox_appearance_at=received_at AND snooze_version=3 AND is_starred) THEN
    RAISE EXCEPTION 'Cancellation did not restore default ordering';
  END IF;
END $test$;

ROLLBACK;
SELECT 'PASS: snooze tenant grants, replay, stale cancellation, exact deadline and preserved flags' AS result;
