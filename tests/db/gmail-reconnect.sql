BEGIN;

DO $$
DECLARE
  actor uuid := '90000000-0000-0000-0000-000000000001';
  other_actor uuid := gen_random_uuid();
  account uuid := '91000000-0000-0000-0000-000000000001';
  envelope jsonb := '{"v":1,"alg":"A256GCM","kid":"local1","iv":"AAAAAAAAAAAAAAAA","tag":"AAAAAAAAAAAAAAAAAAAAAA","ct":"AA"}';
  cursor_before jsonb := '{"provider":"gmail","phase":"history","historyId":"107"}';
  saved_at timestamptz := clock_timestamp()-interval '2 hours';
  lease jsonb;
  snapshot jsonb;
BEGIN
  IF has_function_privilege('authenticated','public.mark_gmail_reconnect(uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('anon','public.store_gmail_reconnect(uuid,uuid,integer,jsonb,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','private.gmail_reconnect_required','SELECT')
  THEN RAISE EXCEPTION 'Gmail grant privileges too broad'; END IF;

  PERFORM public.store_account_credential(actor,account,'google',envelope,0);
  UPDATE public.source_accounts SET last_sync_at=saved_at WHERE id=account AND user_id=actor;
  lease := public.claim_account_sync(actor,account,'gmail');
  IF lease IS NULL THEN RAISE EXCEPTION 'initial lease missing'; END IF;
  PERFORM public.commit_account_sync_page(actor,account,(lease->>'id')::uuid,(lease->>'fence')::bigint,0,
    cursor_before,'gmail','[]'::jsonb,'[]'::jsonb);

  IF public.mark_gmail_reconnect(other_actor,account,1) OR public.mark_gmail_reconnect(actor,account,0)
  THEN RAISE EXCEPTION 'wrong owner or stale credential could block account'; END IF;
  IF NOT public.mark_gmail_reconnect(actor,account,1) THEN RAISE EXCEPTION 'current credential failed to block'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  snapshot := public.read_commitment_catchup_status(ARRAY[account])->0;
  IF snapshot->>'status' IS DISTINCT FROM 'reconnect' OR (snapshot->>'lastSyncAt')::timestamptz IS DISTINCT FROM saved_at
  THEN RAISE EXCEPTION 'blocked status lost the last completed sync'; END IF;

  BEGIN
    PERFORM public.store_gmail_reconnect(other_actor,account,1,envelope);
    RAISE EXCEPTION 'wrong owner replaced credential';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.store_gmail_reconnect(actor,account,0,envelope);
    RAISE EXCEPTION 'stale OAuth flow replaced credential';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF NOT private.gmail_needs_reconnect(actor,account)
  THEN RAISE EXCEPTION 'failed OAuth cleared the Gmail block'; END IF;

  IF public.store_gmail_reconnect(actor,account,1,envelope)<>2
  THEN RAISE EXCEPTION 'fresh credential revision was not saved'; END IF;
  IF private.gmail_needs_reconnect(actor,account) OR public.mark_gmail_reconnect(actor,account,1)
  THEN RAISE EXCEPTION 'new authorization did not clear or was overwritten by an old failure'; END IF;
  BEGIN
    PERFORM public.release_account_sync(actor,account,(lease->>'id')::uuid,(lease->>'fence')::bigint,true,'provider');
    RAISE EXCEPTION 'old worker wrote after new authorization';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  lease := public.claim_account_sync(actor,account,'gmail');
  IF lease IS NULL OR lease->'cursor' IS DISTINCT FROM cursor_before OR lease->>'revision' IS DISTINCT FROM '1'
  THEN RAISE EXCEPTION 'reconnect lost checkpoint'; END IF;
END $$;

ROLLBACK;
SELECT 'PASS: Gmail reconnect owner and credential fences, old worker rejection, preserved checkpoint and last success' AS result;
