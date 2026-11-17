BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000191','living-owner@example.test'),('00000000-0000-0000-0000-000000000192','living-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000191','living-work@example.test','custom'),
 ('10000000-0000-0000-0000-000000000192','00000000-0000-0000-0000-000000000192','living-foreign@example.test','custom');
INSERT INTO public.emails(id,user_id,source_account_id,thread_id,from_address,subject,body_text,created_at,received_at) VALUES
 ('20000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000191','10000000-0000-0000-0000-000000000191','same-thread','a@example.test','Bản vẽ','Tôi gửi bản vẽ ngày 20/11/2026.','2026-11-17','2026-11-17'),
 ('20000000-0000-0000-0000-000000000192','00000000-0000-0000-0000-000000000192','10000000-0000-0000-0000-000000000192','same-thread','a@example.test','Bản vẽ','Foreign source','2026-11-17','2026-11-17');
DO $$ BEGIN
 IF has_table_privilege('authenticated','private.living_analyses','SELECT') OR has_table_privilege('service_role','private.living_decisions','INSERT')
 OR has_function_privilege('authenticated','public.store_living_analysis(uuid,uuid,text,text,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.read_living_scope(uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.confirm_living_event(uuid,integer,integer,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected Living grants';END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
CREATE TEMP TABLE living_test(id uuid,source_id uuid);
INSERT INTO living_test SELECT public.store_living_analysis('00000000-0000-0000-0000-000000000191','20000000-0000-0000-0000-000000000191',
  public.read_living_scope('20000000-0000-0000-0000-000000000191')->>'fingerprint','synthetic-model',
  '[{"source":"20000000-0000-0000-0000-000000000191","origin":"20000000-0000-0000-0000-000000000191","item":1,"kind":"create","certainty":"firm","blocked":null,"referenceKey":"living:test-191","title":"Gửi bản vẽ","owner":"a@example.test","due":"2026-11-20","quote":"Tôi gửi bản vẽ ngày 20/11/2026."}]','{}'),
 '20000000-0000-0000-0000-000000000191';
GRANT SELECT ON living_test TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a uuid:=(SELECT id FROM living_test); k uuid:=gen_random_uuid(); result jsonb;
 st jsonb:='{"title":"Gửi bản vẽ","ownerName":null,"ownerEmail":"a@example.test","dueOn":"2026-11-20","dueAt":null,"status":"open"}';
BEGIN
 IF jsonb_array_length(public.read_living_scope('20000000-0000-0000-0000-000000000191')->'messages')<>1 THEN RAISE EXCEPTION 'Thread crossed tenant'; END IF;
 BEGIN PERFORM public.read_living_scope('20000000-0000-0000-0000-000000000192');RAISE EXCEPTION 'Foreign source accepted';EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;END;
 BEGIN PERFORM public.confirm_living_event(a,0,NULL,k,st||'{"purchaseOrder":{}}');RAISE EXCEPTION 'Financial fields accepted';EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
 result:=public.confirm_living_event(a,0,NULL,k,st);
 IF result->>'version'<>'1' OR public.confirm_living_event(a,0,NULL,k,st)->>'replayed'<>'true' THEN RAISE EXCEPTION 'Receipt replay failed'; END IF;
 BEGIN PERFORM public.confirm_living_event(a,0,NULL,gen_random_uuid(),st);RAISE EXCEPTION 'Event duplicated';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.confirm_living_event(a,0,NULL,k,st||'{"title":"changed"}');RAISE EXCEPTION 'Key payload altered';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000192',true);
 BEGIN PERFORM public.read_living_review(a);RAISE EXCEPTION 'Foreign cache visible';EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;END;
 BEGIN PERFORM public.confirm_living_event(a,0,NULL,k,st);RAISE EXCEPTION 'Foreign replay visible';EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
DO $$ DECLARE a uuid:=(SELECT id FROM living_test); repeated uuid; first_receipt jsonb;
BEGIN
 SELECT public.read_living_review(a)->'events'->0->'receipt' INTO first_receipt;
 repeated:=public.store_living_analysis('00000000-0000-0000-0000-000000000191','20000000-0000-0000-0000-000000000191',
   public.read_living_scope('20000000-0000-0000-0000-000000000191')->>'fingerprint','synthetic-new-inference',
   (SELECT events FROM private.living_analyses WHERE id=a),'{}');
 IF public.read_living_review(repeated)->'events'->0->'receipt' IS DISTINCT FROM first_receipt THEN
   RAISE EXCEPTION 'Fresh analysis re-proposes an already confirmed exact event'; END IF;
END $$;
DO $$ DECLARE source uuid:='20000000-0000-0000-0000-000000000191'; a uuid; snapshot text; st jsonb;
BEGIN
 snapshot:=public.read_living_scope(source)->>'fingerprint';
 a:=public.store_living_analysis('00000000-0000-0000-0000-000000000191',source,snapshot,'synthetic-second',
 '[{"source":"20000000-0000-0000-0000-000000000191","kind":"create","certainty":"firm","blocked":null,"referenceKey":"living:stale-191","quote":"Tôi gửi bản vẽ ngày 20/11/2026."}]','{}');
 UPDATE public.emails SET body_text=body_text||' Nội dung bổ sung.' WHERE id=source;
 IF NOT (public.read_living_review(a)->>'stale')::boolean THEN RAISE EXCEPTION 'Analysis not stale';END IF;
 st:='{"title":"Bản khác","ownerName":null,"ownerEmail":"a@example.test","dueOn":"2026-11-20","dueAt":null,"status":"open"}';
 BEGIN PERFORM public.confirm_living_event(a,0,NULL,gen_random_uuid(),st);RAISE EXCEPTION 'Stale source accepted';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.store_living_analysis('00000000-0000-0000-0000-000000000191',source,snapshot,'old','[]','{}');RAISE EXCEPTION 'Old inference cached';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
END $$;
ROLLBACK;
SELECT 'PASS: Living Commitments private grants, same-thread tenant isolation, exact approval replay, immutable request, ordinary field scope and source-change rejection' AS result;
