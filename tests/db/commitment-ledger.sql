BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users (id,email) VALUES
 ('00000000-0000-0000-0000-000000000061','ledger-owner@example.test'),
 ('00000000-0000-0000-0000-000000000062','ledger-other@example.test');
INSERT INTO public.emails (id,user_id,from_address,subject,body_text) VALUES
 ('20000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000061','supplier@example.test','Lịch giao ban đầu','Nhà cung cấp xác nhận giao 200 bộ ngày 15/11.'),
 ('20000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000061','supplier@example.test','Lùi hạn giao','Ngày giao mới là 19/11.'),
 ('20000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000061','supplier@example.test','Ngày giao chưa thống nhất','Đội vận tải vẫn báo ngày 18/11.'),
 ('20000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000062','supplier@example.test','Thư thuộc người dùng khác','Bằng chứng thuộc tài khoản khác.'),
 ('20000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000061','warehouse@example.test','Đã giao đủ','Kho đã nhận đủ 200 bộ.');

DO $$ BEGIN
 IF has_table_privilege('authenticated','private.commitment_revisions','INSERT')
    OR has_table_privilege('authenticated','private.commitments','SELECT')
    OR has_table_privilege('service_role','private.commitment_revisions','SELECT')
    OR has_function_privilege('anon','public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.read_commitment(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.list_commitments(integer,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'private ledger privileges leaked';
 END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000061',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  commitment_id uuid;
  receipt jsonb;
  current jsonb;
  key_one constant uuid := 'e0000000-0000-4000-8000-000000000061';
  initial constant jsonb := '{"title":"Giao 200 bộ","ownerName":"Nhà cung cấp","ownerEmail":"supplier@example.test","dueOn":"2026-11-15","dueAt":null,"status":"open"}';
  original_source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000061","field":"body_text","quote":"giao 200 bộ ngày 15/11"}]';
  moved_source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000062","field":"body_text","quote":"Ngày giao mới là 19/11"}]';
  conflict_source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000063","field":"body_text","quote":"vẫn báo ngày 18/11"}]';
  foreign_source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000064","field":"subject","quote":"Thư thuộc người dùng khác"}]';
  completed_source constant jsonb := '[{"emailId":"20000000-0000-0000-0000-000000000065","field":"body_text","quote":"Kho đã nhận đủ 200 bộ"}]';
  moved jsonb := jsonb_set(initial,'{dueOn}','"2026-11-19"');
BEGIN
  receipt := public.save_commitment(key_one,NULL,NULL,'po-1042:delivery',initial,NULL,original_source);
  commitment_id := (receipt->>'id')::uuid;
  PERFORM set_config('inboxai.test_commitment_id',commitment_id::text,true);
  IF receipt->>'version' IS DISTINCT FROM '1' OR receipt->>'replayed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'create failed'; END IF;

  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'po-1042:delivery',moved,NULL,moved_source);
    RAISE EXCEPTION 'duplicate reference created';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),commitment_id,1,NULL,moved,NULL,foreign_source);
    RAISE EXCEPTION 'foreign evidence linked';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'rollback-source',initial,NULL,
      jsonb_set(original_source,'{0,quote}','"invented quote"'));
    RAISE EXCEPTION 'fabricated quote accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

  receipt := public.save_commitment(gen_random_uuid(),commitment_id,1,NULL,moved,NULL,moved_source);
  IF receipt->>'id' IS DISTINCT FROM commitment_id::text OR receipt->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'deadline created a new identity'; END IF;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),commitment_id,1,NULL,initial,NULL,original_source);
    RAISE EXCEPTION 'stale revision accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),commitment_id,2,NULL,NULL,'{"kind":"conflicting","note":"Ngày giao khác nhau"}',conflict_source);
    RAISE EXCEPTION 'unsubstantiated conflict accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

  PERFORM public.save_commitment(gen_random_uuid(),commitment_id,2,NULL,NULL,
    '{"kind":"conflicting","note":"Ngày giao khác nhau"}',moved_source || conflict_source);
  current := public.read_commitment(commitment_id,2,NULL);
  IF current#>>'{state,dueOn}' IS DISTINCT FROM '2026-11-19' OR current#>>'{state,review,kind}' IS DISTINCT FROM 'conflicting'
    OR current#>'{history,0,changedFields}' IS DISTINCT FROM '["review"]' OR jsonb_array_length(current#>'{history,0,sources}') IS DISTINCT FROM 2
    OR current#>>'{history,1,sources,0,quote}' IS DISTINCT FROM 'Ngày giao mới là 19/11'
    OR current->>'nextBeforeVersion' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'conflict or history pagination mismatch: %', current; END IF;
  IF public.read_commitment(commitment_id,2,2)#>>'{history,0,state,dueOn}' IS DISTINCT FROM '2026-11-15' THEN
    RAISE EXCEPTION 'original deadline lost';
  END IF;

  PERFORM public.save_commitment(gen_random_uuid(),commitment_id,3,NULL,jsonb_set(moved,'{status}','"completed"'),NULL,completed_source);
  current := public.read_commitment(commitment_id,50,NULL);
  IF current#>>'{state,status}' IS DISTINCT FROM 'completed' OR current#>'{state,review}' IS DISTINCT FROM 'null' OR
    current#>'{history,0,changedFields}' IS DISTINCT FROM '["review","status"]' THEN RAISE EXCEPTION 'completion did not record confirmation'; END IF;
  receipt := public.save_commitment(key_one,NULL,NULL,'po-1042:delivery',initial,NULL,original_source);
  IF receipt->>'version' IS DISTINCT FROM '1' OR receipt->>'replayed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'replay returned wrong revision'; END IF;
  BEGIN
    PERFORM public.save_commitment(key_one,NULL,NULL,'po-1042:delivery',moved,NULL,moved_source);
    RAISE EXCEPTION 'key reused with altered data';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'rollback-source',
    jsonb_set(jsonb_set(initial,'{dueOn}','null'),'{dueAt}','"2026-11-21T16:00:00+07:00"'),NULL,original_source);
  current := public.list_commitments(1,NULL);
  IF current#>>'{items,0,state,dueAt}' IS DISTINCT FROM '2026-11-21T09:00:00.000000Z' OR current->>'nextBeforeId' IS NULL THEN
    RAISE EXCEPTION 'timed deadline or list cursor mismatch';
  END IF;
  IF public.list_commitments(1,(current->>'nextBeforeId')::uuid)#>>'{items,0,id}' IS DISTINCT FROM commitment_id::text THEN
    RAISE EXCEPTION 'list pagination lost a commitment';
  END IF;
END $$;
RESET ROLE;

UPDATE public.emails SET body_text='Nội dung đã thay thế.' WHERE id='20000000-0000-0000-0000-000000000062';
DELETE FROM public.emails WHERE id='20000000-0000-0000-0000-000000000061';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  commitment_id uuid := current_setting('inboxai.test_commitment_id')::uuid;
  history jsonb := public.read_commitment(commitment_id,50,NULL)->'history';
BEGIN
  IF history#>>'{2,sources,0,availability}' IS DISTINCT FROM 'changed' OR history#>'{2,sources,0,quote}' IS DISTINCT FROM 'null' OR
     history#>>'{3,sources,0,availability}' IS DISTINCT FROM 'unavailable' OR history#>'{3,sources,0,href}' IS DISTINCT FROM 'null' OR
     history#>>'{3,sources,0,emailId}' IS DISTINCT FROM '20000000-0000-0000-0000-000000000061' THEN
    RAISE EXCEPTION 'changed/deleted source provenance failed';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000062',true);
  IF public.list_commitments(50,NULL)->'items' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'foreign list leak'; END IF;
  BEGIN
    PERFORM public.read_commitment(commitment_id,50,NULL);
    RAISE EXCEPTION 'foreign history leak';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.list_commitments(1,commitment_id);
    RAISE EXCEPTION 'foreign cursor leak';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.save_commitment(gen_random_uuid(),commitment_id,4,NULL,NULL,'{"kind":"ambiguous","note":"foreign"}',
      '[{"emailId":"20000000-0000-0000-0000-000000000064","field":"subject","quote":"Thư thuộc người dùng khác"}]');
    RAISE EXCEPTION 'foreign revision allowed';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;

SET CONSTRAINTS ALL IMMEDIATE;
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000061';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM private.commitments) OR EXISTS (SELECT 1 FROM private.commitment_revisions) THEN
    RAISE EXCEPTION 'tenant deletion left ledger data';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: commitment identity, versioning, conflict, completion, evidence retention, pagination and tenant isolation' AS result;
