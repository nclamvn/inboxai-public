BEGIN;

DO $$
DECLARE
  today constant jsonb := '{"status":"open","dueOn":"2026-11-12"}';
  crossing constant timestamptz := '2026-11-12T17:00:00Z';
BEGIN
  IF private.commitment_board_group(today,'mine',crossing - interval '1 second') IS DISTINCT FROM 'mine' OR
     private.commitment_board_group(today,'mine',crossing) IS DISTINCT FROM 'overdue' OR
     private.commitment_board_group('{"status":"open","dueAt":"2026-11-12T17:00:00Z"}','waiting',crossing) IS DISTINCT FROM 'waiting' OR
     private.commitment_board_group('{"status":"open","dueAt":"2026-11-12T17:00:00Z"}','waiting',crossing + interval '1 second') IS DISTINCT FROM 'overdue' OR
     private.commitment_board_group('{"status":"completed","dueOn":"2026-11-11"}','mine',crossing) IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'deadline grouping drifted at UTC+7 midnight or an exact instant';
  END IF;
  IF has_function_privilege('anon','public.list_commitment_board(text,integer,uuid)','EXECUTE') OR
     has_function_privilege('authenticated','private.commitment_board_group(jsonb,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected board grant';
  END IF;
END $$;

UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users (id,email) VALUES
 ('00000000-0000-0000-0000-000000000071','ledger-board-owner@example.test'),
 ('00000000-0000-0000-0000-000000000072','ledger-board-other@example.test');
INSERT INTO public.source_accounts (user_id,email_address) VALUES
 ('00000000-0000-0000-0000-000000000071','alias@example.test'),
 ('00000000-0000-0000-0000-000000000072','foreign-alias@example.test');
INSERT INTO public.emails (id,user_id,from_address,subject) VALUES
 ('20000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000071','supplier@example.test','Board evidence');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  state constant jsonb := '{"title":"Board item","ownerName":null,"ownerEmail":null,"dueOn":null,"dueAt":null,"status":"open"}';
  source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000071","field":"subject","quote":"Board evidence"}]';
  page jsonb;
BEGIN
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'mine-login',state || '{"ownerEmail":"ledger-board-owner@example.test"}',NULL,source);
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'mine-alias',state || '{"ownerEmail":"ALIAS@example.test"}',NULL,source);
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'waiting',state || '{"ownerEmail":"foreign-alias@example.test"}',NULL,source);
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'overdue',state || '{"ownerEmail":"alias@example.test","dueOn":"2000-01-01"}',NULL,source);
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'unassigned',state || '{"ownerName":"Unverified name"}',NULL,source);
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'closed',state || '{"status":"cancelled","dueOn":"2000-01-01"}',NULL,source);

  page := public.list_commitment_board('mine',1,NULL);
  IF page->'totals' IS DISTINCT FROM '{"mine":2,"waiting":1,"overdue":1,"unassigned":1,"closed":1}'::jsonb OR
     page#>>'{items,0,referenceKey}' IS DISTINCT FROM 'mine-alias' OR page->>'nextBeforeId' IS NULL THEN
    RAISE EXCEPTION 'board counts or first cursor did not cover the entire tenant';
  END IF;
  IF public.list_commitment_board('mine',1,(page->>'nextBeforeId')::uuid)#>>'{items,0,referenceKey}' IS DISTINCT FROM 'mine-login' OR
     public.list_commitment_board('overdue',20,NULL)#>>'{items,0,responsibility}' IS DISTINCT FROM 'mine' THEN
    RAISE EXCEPTION 'board cursor or underlying responsibility lost';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000072',true);
  IF public.list_commitment_board('mine',20,NULL)->'totals' IS DISTINCT FROM '{"mine":0,"waiting":0,"overdue":0,"unassigned":0,"closed":0}'::jsonb THEN
    RAISE EXCEPTION 'tenant counts leaked';
  END IF;
  BEGIN
    PERFORM public.list_commitment_board('mine',20,(page->>'nextBeforeId')::uuid);
    RAISE EXCEPTION 'foreign cursor accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: commitment board ownership, UTC+7 date boundary, exact instant, group totals, cursors and tenant isolation' AS result;
