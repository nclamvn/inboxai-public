BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.claim_account_sync('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','gmail');
 RAISE EXCEPTION 'anonymous sync RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE lease jsonb; v_revision integer; cursor jsonb:='{"provider":"gmail","phase":"history","historyId":"100"}'; BEGIN
 lease:=public.claim_account_sync('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','gmail');
 IF lease IS NULL THEN RAISE EXCEPTION 'initial claim rejected'; END IF;
 IF public.claim_account_sync('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','gmail') IS NOT NULL THEN
   RAISE EXCEPTION 'overlapping lease allowed'; END IF;
 BEGIN
  PERFORM public.commit_account_sync_page('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',(lease->>'id')::uuid,(lease->>'fence')::bigint,0,
   cursor,'gmail','[{"uid":"must-rollback","from_address":"synthetic@example.test","received_at":"bad-date","attachments":[]}]','[]');
  RAISE EXCEPTION 'malformed page accepted'; EXCEPTION WHEN invalid_datetime_format THEN NULL; END;
 v_revision:=public.commit_account_sync_page('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',(lease->>'id')::uuid,(lease->>'fence')::bigint,0,cursor,'gmail','[{"uid":"valid-page","message_id":"same-rfc@example.test","from_address":"synthetic@example.test","subject":"SQL fixture","body_text":"Synthetic","received_at":"2026-11-11T00:00:00Z","is_read":false,"is_starred":false,"is_archived":false,"is_deleted":false,"direction":"inbound","attachments":[{"part_key":"0","filename":"same.txt","content_type":"text/plain","size":3}]}]','[]');
 IF v_revision<>1 THEN RAISE EXCEPTION 'valid commit failed'; END IF;
 BEGIN
  PERFORM public.commit_account_sync_page('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',(lease->>'id')::uuid,(lease->>'fence')::bigint,0,cursor,'gmail','[]','[]');
  RAISE EXCEPTION 'stale revision allowed'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.release_account_sync('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',(lease->>'id')::uuid,(lease->>'fence')::bigint,false);
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.emails WHERE original_uid='must-rollback') THEN RAISE EXCEPTION 'rollback left partial row'; END IF;
 IF has_schema_privilege('authenticated','private','USAGE') OR has_table_privilege('authenticated','private.account_sync','SELECT') THEN
   RAISE EXCEPTION 'private checkpoint exposed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: sync RPC grants, lease exclusion, atomic rollback and revision fencing' AS result;
