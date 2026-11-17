BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000196','review-owner@example.test'),('00000000-0000-0000-0000-000000000197','review-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000000196','00000000-0000-0000-0000-000000000196','review-work@example.test','custom');
INSERT INTO public.emails(id,user_id,source_account_id,thread_id,from_address,subject,body_text,received_at) VALUES
 ('20000000-0000-0000-0000-000000000196','00000000-0000-0000-0000-000000000196','10000000-0000-0000-0000-000000000196','review-thread','a@example.test',repeat('x',501)||'A','Tôi sẽ gửi tài liệu ngày 20/11/2026.','2026-11-17T02:00:00Z');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000196',true);
DO $$ DECLARE actor uuid:='00000000-0000-0000-0000-000000000196'; source uuid:='20000000-0000-0000-0000-000000000196';
 analysis uuid; again uuid; moved uuid; request uuid:=gen_random_uuid(); undo_request uuid:=gen_random_uuid(); events jsonb; result jsonb; initial_count integer;
 st jsonb:='{"title":"Tài liệu","ownerName":null,"ownerEmail":"a@example.test","dueOn":"2026-11-20","dueAt":null,"status":"open"}';
BEGIN
 events:=jsonb_build_array(jsonb_build_object('source',source,'origin',source,'item',1,'kind','create','certainty','firm','blocked',NULL,'owner','a@example.test','due','2026-11-20',
  'referenceKey','living:review-memory','quote','Tôi sẽ gửi tài liệu ngày 20/11/2026.'));
 analysis:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-v3',events,'{}');
 SELECT count(*) INTO initial_count FROM private.commitment_revisions WHERE user_id=actor;
 result:=public.decide_living_review(analysis,0,0,NULL,request,'dismiss','not_relevant');
 IF result->>'version'<>'1' OR result->>'active'<>'true' THEN RAISE EXCEPTION 'Dismissal missing';END IF;
 IF public.decide_living_review(analysis,0,0,NULL,request,'dismiss','not_relevant')->>'replayed'<>'true' THEN RAISE EXCEPTION 'Lost ack not replayed';END IF;
 BEGIN PERFORM public.decide_living_review(analysis,0,0,NULL,request,'dismiss','duplicate');RAISE EXCEPTION 'Key reuse';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.decide_living_review(analysis,0,0,NULL,gen_random_uuid(),'dismiss','duplicate');RAISE EXCEPTION 'Old tab';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.confirm_living_event(analysis,0,NULL,gen_random_uuid(),st);RAISE EXCEPTION 'Dismissed approved';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 -- A model version/title/index change is not new evidence and cannot erase memory.
 again:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-new-model',jsonb_set(events,'{0,title}','"Tên khác"'),'{}');
 IF public.read_living_review(again)->'events'->0->'disposition'->>'active'<>'true' THEN RAISE EXCEPTION 'Reanalysis forgot dismissal';END IF;
 moved:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-reordered',jsonb_build_array((events->0)||jsonb_build_object('kind','cancelled','quote','Không có dữ liệu.','blocked','Unsupported'))||events,'{}');
 IF public.read_living_review(moved)->'events'->1->'disposition'->>'active'<>'true' THEN RAISE EXCEPTION 'Reordering forgot dismissal';END IF;
 PERFORM public.decide_living_review(again,0,1,NULL,undo_request,'restore',NULL);
 BEGIN PERFORM public.confirm_living_event(again,0,NULL,request,st);RAISE EXCEPTION 'Review key reused as approval';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.decide_living_review(analysis,0,1,NULL,gen_random_uuid(),'restore',NULL);RAISE EXCEPTION 'Old undo';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 PERFORM public.decide_living_review(again,0,2,NULL,gen_random_uuid(),'dismiss','not_commitment');
 IF public.decide_living_review(again,0,1,NULL,undo_request,'restore',NULL)->>'replayed'<>'true' OR public.read_living_review(again)->'events'->0->'disposition'->>'active'<>'true' THEN RAISE EXCEPTION 'Old undo replay overwrote newer dismissal';END IF;
 IF (SELECT count(*) FROM private.commitment_revisions WHERE user_id=actor)<>initial_count THEN RAISE EXCEPTION 'Review changed ledger';END IF;
 IF (SELECT count(*) FROM private.living_review_history WHERE user_id=actor)<>3 THEN RAISE EXCEPTION 'Audit lost or replay duplicated';END IF;
 -- Subject tails outside the older shared 501-character detection window
 -- still invalidate review memory. Preserve the original test state afterwards.
 UPDATE public.emails SET subject=repeat('x',501)||'B' WHERE id=source;
 moved:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-subject-tail',events,'{}');
 IF public.read_living_review(moved)->'events'->0->>'disposition' IS NOT NULL THEN RAISE EXCEPTION 'Changed subject tail inherited dismissal';END IF;
 UPDATE public.emails SET subject=repeat('x',501)||'A' WHERE id=source;
 -- An unrelated later message preserves unchanged dismissal, but its genuinely
 -- new deadline is a different review key and must surface.
 INSERT INTO public.emails(id,user_id,source_account_id,thread_id,from_address,body_text,received_at,created_at) VALUES
 ('20000000-0000-0000-0000-000000000198',actor,'10000000-0000-0000-0000-000000000196','review-thread','a@example.test','Tôi đổi hạn gửi tài liệu sang ngày 23/11/2026.','2026-11-18T02:00:00Z',clock_timestamp()+interval '1 second');
 BEGIN PERFORM public.decide_living_review(analysis,0,3,NULL,gen_random_uuid(),'restore',NULL);RAISE EXCEPTION 'Stale source';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 events:=events||jsonb_build_array((events->0)||jsonb_build_object('source','20000000-0000-0000-0000-000000000198','kind','deadline','due','2026-11-23','quote','Tôi đổi hạn gửi tài liệu sang ngày 23/11/2026.'));
 again:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-new-evidence',events,'{}');
 IF public.read_living_review(again)->'events'->0->'disposition'->>'active'<>'true' THEN RAISE EXCEPTION 'Unchanged promise repeated';END IF;
 IF public.read_living_review(again)->'events'->1->>'disposition' IS NOT NULL THEN RAISE EXCEPTION 'New change hidden';END IF;
 UPDATE public.emails SET body_text='Tôi sẽ gửi tài liệu ngày 21/11/2026.' WHERE id=source;
 events:=jsonb_set(jsonb_set(events,'{0,quote}','"Tôi sẽ gửi tài liệu ngày 21/11/2026."'),'{0,due}','"2026-11-21"');
 again:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','review-edited-evidence',events,'{}');
 IF public.read_living_review(again)->'events'->0->>'disposition' IS NOT NULL THEN RAISE EXCEPTION 'Edited evidence hidden';END IF;
 events:=jsonb_build_array((events->0)||jsonb_build_object('source','unknown-model-id','origin','unknown-model-id','blocked','Nguồn ngoài hội thoại.'));
 analysis:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','unknown-alias',events,'{}');
 IF public.read_living_review(analysis)->'events'->0->>'blocked' IS NULL THEN RAISE EXCEPTION 'Unknown model source became actionable';END IF;
 BEGIN PERFORM public.decide_living_review(analysis,0,0,NULL,gen_random_uuid(),'dismiss','duplicate');RAISE EXCEPTION 'Non-owned evidence key';EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000197',true);
 BEGIN PERFORM public.decide_living_review(again,0,0,NULL,gen_random_uuid(),'dismiss','duplicate');RAISE EXCEPTION 'Foreign write';EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.decide_living_review(again,0,0,NULL,gen_random_uuid(),'dismiss','duplicate');RAISE EXCEPTION 'Anonymous';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
-- Private audit cannot be read or rewritten directly by clients.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM private.living_review_history;RAISE EXCEPTION 'Audit exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Living review memory is append-only, source-bound, versioned, idempotent, reversible and tenant-isolated' AS result;
