BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000091','ask-owner@example.test'),
 ('00000000-0000-0000-0000-000000000092','ask-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address) VALUES
 ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091','work@example.test'),
 ('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000091','personal@example.test'),
 ('10000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000092','foreign@example.test');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject,body_text,received_at,provider_deleted)
VALUES
 ('20000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000091',
 'buyer@example.test','Phiếu chi QZ-751','Nhà cung cấp đã nhận tiền.','2026-11-09T17:00Z',false),
 ('20000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000092',
 'buyer@example.test','Biên bản vận chuyển','Xác nhận lô hàng đến trễ.','2026-11-10T16:59:59.999999Z',false),
 ('20000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000092','10000000-0000-0000-0000-000000000093',
 'buyer@example.test','Phiếu chi QZ-751','Chứng cứ của tenant khác.','2026-11-10T18:00Z',false),
 ('20000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-000000000091',NULL,
 'buyer@example.test','Phiếu chi QZ-751','Đã xóa ở provider.','2026-11-11T00:00Z',true);

CREATE TEMP TABLE ask_fixture AS
SELECT e.id,e.user_id,private.ask_fingerprint(e) AS fingerprint,
  ARRAY[1::real] || array_fill(0::real,ARRAY[383]) AS vector
FROM public.emails e WHERE e.id::text LIKE '20000000-0000-0000-0000-00000000009%';
GRANT SELECT ON ask_fixture TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon','public.ask_inbox_search(text,jsonb,real[],integer)','EXECUTE') OR
     has_function_privilege('authenticated','public.ask_inbox_store(uuid,jsonb)','EXECUTE') OR
     has_table_privilege('authenticated','private.ask_inbox_vectors','SELECT') THEN
    RAISE EXCEPTION 'search grants violate isolation';
  END IF;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE f ask_fixture;
BEGIN
  SELECT * INTO f FROM ask_fixture WHERE id::text LIKE '%092';
  IF public.ask_inbox_store(f.user_id,jsonb_build_array(jsonb_build_object('id',f.id,
    'fingerprint',f.fingerprint,'vectors',jsonb_build_array(f.vector)))) <> 1 THEN
    RAISE EXCEPTION 'owned embedding failed';
  END IF;
  SELECT * INTO f FROM ask_fixture WHERE id::text LIKE '%093';
  IF public.ask_inbox_store('00000000-0000-0000-0000-000000000091',jsonb_build_array(jsonb_build_object('id',f.id,
    'fingerprint',f.fingerprint,'vectors',jsonb_build_array(f.vector)))) <> 0 THEN
    RAISE EXCEPTION 'foreign embedding accepted';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  result jsonb;
  filters constant jsonb := '{"fromAt":"2026-11-09T17:00Z","beforeAt":"2026-11-10T17:00Z"}';
  vector real[] := ARRAY[1::real] || array_fill(0::real,ARRAY[383]);
  other_account constant jsonb := '{"accounts":["10000000-0000-0000-0000-000000000093"]}';
BEGIN
  result := public.ask_inbox_search('phieu chi QZ-751','{}',NULL,20);
  IF jsonb_array_length(result->'hits') <> 1 OR result#>>'{hits,0,citation,quote}' IS DISTINCT FROM 'Phiếu chi QZ-751' THEN
    RAISE EXCEPTION 'folded keyword, verbatim citation or tenant filtering failed: %',result;
  END IF;
  result := public.ask_inbox_search('',filters,NULL,20);
  IF jsonb_array_length(result->'hits') <> 2 THEN RAISE EXCEPTION 'UTC+7 date boundary mismatch'; END IF;
  result := public.ask_inbox_search('unknown words',filters,vector,20);
  IF result#>>'{hits,0,account}' IS DISTINCT FROM 'personal@example.test' OR
     result#>>'{hits,0,citation,quote}' IS DISTINCT FROM 'Xác nhận lô hàng đến trễ.' OR
     result#>>'{coverage,indexed}' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'scoped semantic citation failed: %',result;
  END IF;
  BEGIN
    PERFORM public.ask_inbox_search('test',other_account,vector,20);
    RAISE EXCEPTION 'foreign account filter accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.ask_inbox_pending(other_account);
    RAISE EXCEPTION 'foreign account index scan accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  UPDATE public.emails SET body_text = 'Thư đã sửa. Nội dung mới.' WHERE id::text LIKE '20000000-0000-0000-0000-000000000092';
  IF jsonb_array_length(public.ask_inbox_search('unknown words',filters,vector,20)->'hits') <> 0 OR
     jsonb_array_length(public.ask_inbox_pending(filters)) <> 2 THEN
    RAISE EXCEPTION 'stale vector still visible after source edit';
  END IF;
  PERFORM public.update_search_history('phiếu QZ-751','recent');
  PERFORM public.update_search_history('phiếu QZ-751','save');
  IF NOT EXISTS (SELECT 1 FROM public.user_preferences WHERE saved_searches = ARRAY['phiếu QZ-751']
    AND recent_searches = ARRAY['phiếu QZ-751']) THEN RAISE EXCEPTION 'saved query was not persisted'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
  IF EXISTS (SELECT 1 FROM public.user_preferences) THEN RAISE EXCEPTION 'search history leaked to another tenant'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE f ask_fixture;
BEGIN
  SELECT * INTO f FROM ask_fixture WHERE id::text LIKE '%092';
  IF public.ask_inbox_store(f.user_id,jsonb_build_array(jsonb_build_object('id',f.id,
    'fingerprint',f.fingerprint,'vectors',jsonb_build_array(f.vector)))) <> 0 THEN
    RAISE EXCEPTION 'stale write accepted';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE e public.emails;
BEGIN
  SELECT * INTO e FROM public.emails WHERE id::text LIKE '20000000-0000-0000-0000-000000000092';
  PERFORM public.ask_inbox_store(e.user_id,jsonb_build_array(jsonb_build_object('id',e.id,
    'fingerprint',private.ask_fingerprint(e),'vectors',jsonb_build_array(ARRAY[1::real] || array_fill(0::real,ARRAY[383])))));
  UPDATE public.emails SET provider_deleted=true WHERE id=e.id;
  IF EXISTS (SELECT 1 FROM private.ask_inbox_vectors WHERE email_id=e.id) THEN RAISE EXCEPTION 'tombstone retained vectors'; END IF;
  UPDATE public.emails SET provider_deleted=false WHERE id=e.id;
  PERFORM public.ask_inbox_store(e.user_id,jsonb_build_array(jsonb_build_object('id',e.id,
    'fingerprint',private.ask_fingerprint(e),'vectors',jsonb_build_array(ARRAY[1::real] || array_fill(0::real,ARRAY[383])))));
  DELETE FROM public.emails WHERE id=e.id;
  IF EXISTS (SELECT 1 FROM private.ask_inbox_vectors WHERE email_id=e.id) THEN RAISE EXCEPTION 'hard deletion retained vectors'; END IF;
END $$;

ROLLBACK;
SELECT 'PASS: Ask Inbox index ownership, literal citations, date scope, edited-source invalidation, tombstone and hard deletion' AS result;
