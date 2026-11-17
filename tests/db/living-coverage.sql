BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000193','coverage-owner@example.test'),('00000000-0000-0000-0000-000000000194','coverage-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000000193','00000000-0000-0000-0000-000000000193','coverage-work@example.test','custom'),
 ('10000000-0000-0000-0000-000000000195','00000000-0000-0000-0000-000000000193','coverage-second@example.test','custom'),
 ('10000000-0000-0000-0000-000000000194','00000000-0000-0000-0000-000000000194','coverage-other@example.test','custom');
INSERT INTO public.emails(id,user_id,source_account_id,thread_id,from_address,body_text) VALUES
 ('20000000-0000-0000-0000-000000000193','00000000-0000-0000-0000-000000000193','10000000-0000-0000-0000-000000000193','coverage-thread','a@example.test','Chị An, tôi gửi tài liệu ngày 20/11/2026.'),
 ('20000000-0000-0000-0000-000000000195','00000000-0000-0000-0000-000000000193','10000000-0000-0000-0000-000000000195','coverage-thread','a@example.test','Chị An, tôi gửi tài liệu ngày 20/11/2026.'),
 ('20000000-0000-0000-0000-000000000194','00000000-0000-0000-0000-000000000194','10000000-0000-0000-0000-000000000194','coverage-thread','a@example.test','Chị An, tôi gửi tài liệu ngày 20/11/2026.');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000193',true);
DO $$ DECLARE actor uuid:='00000000-0000-0000-0000-000000000193'; source uuid:='20000000-0000-0000-0000-000000000193';
 st jsonb:='{"title":"Tài liệu đã chỉnh tay","ownerName":null,"ownerEmail":"a@example.test","dueOn":"2026-11-20","dueAt":null,"status":"open"}';
 evidence jsonb; original jsonb; analysis uuid; events jsonb;
BEGIN
 evidence:=jsonb_build_array(jsonb_build_object('emailId',source,'field','body_text','quote','tôi gửi tài liệu ngày 20/11/2026.'));
 original:=public.save_commitment(gen_random_uuid(),NULL,NULL,'living:legacy-short-quote',st,NULL,evidence);
 events:=jsonb_build_array(jsonb_build_object('source',source,'origin',source,'item',1,'kind','create','certainty','firm','blocked',NULL,
  'referenceKey','living:new-full-quote','quote','Chị An, tôi gửi tài liệu ngày 20/11/2026.'));
 analysis:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','new-code',events,'{"coverage":{"messages":1}}');
 IF public.read_living_review(analysis)->'events'->0->>'target' IS DISTINCT FROM original->>'id' THEN RAISE EXCEPTION 'Exact original evidence lost its confirmed ledger';END IF;
 IF public.read_living_review(analysis)->'events'->0->'previous'->>'title'<>'Tài liệu đã chỉnh tay' THEN RAISE EXCEPTION 'User correction lost'; END IF;
 events:=jsonb_build_array(jsonb_build_object('source','20000000-0000-0000-0000-000000000195','origin','20000000-0000-0000-0000-000000000195','item',1,'kind','create','certainty','firm','blocked',NULL,
  'referenceKey','living:second-account','quote','Chị An, tôi gửi tài liệu ngày 20/11/2026.'));
 analysis:=public.store_living_analysis(actor,'20000000-0000-0000-0000-000000000195',public.read_living_scope('20000000-0000-0000-0000-000000000195')->>'fingerprint','second-account',events,'{}');
 IF public.read_living_review(analysis)->'events'->0->>'target' IS NOT NULL THEN RAISE EXCEPTION 'Cross-account evidence match';END IF;
 -- Byte-identical evidence from a different tenant must never supply a target.
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000194',true);
 events:=jsonb_build_array(jsonb_build_object('source','20000000-0000-0000-0000-000000000194','origin','20000000-0000-0000-0000-000000000194','item',1,'kind','create','certainty','firm','blocked',NULL,
  'referenceKey','living:other','quote','Chị An, tôi gửi tài liệu ngày 20/11/2026.'));
 analysis:=public.store_living_analysis('00000000-0000-0000-0000-000000000194','20000000-0000-0000-0000-000000000194',public.read_living_scope('20000000-0000-0000-0000-000000000194')->>'fingerprint','other',events,'{}');
 IF public.read_living_review(analysis)->'events'->0->>'target' IS NOT NULL THEN RAISE EXCEPTION 'Cross-tenant evidence match';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Two genuinely different confirmed tasks in the same source are ambiguous
 -- for an over-broad new quote. Do not pick either or create a third task.
 UPDATE public.emails SET body_text=body_text||' Tôi nộp bảng kiểm ngày 23/11/2026.' WHERE id=source;
 evidence:=jsonb_build_array(jsonb_build_object('emailId',source,'field','body_text','quote','Tôi nộp bảng kiểm ngày 23/11/2026.'));
 PERFORM public.save_commitment(gen_random_uuid(),NULL,NULL,'living:second-task',st||'{"title":"Bảng kiểm"}',NULL,evidence);
 events:=jsonb_build_array(jsonb_build_object('source',source,'origin',source,'item',1,'kind','create','certainty','firm','blocked',NULL,
  'referenceKey','living:ambiguous','quote','Chị An, tôi gửi tài liệu ngày 20/11/2026. Tôi nộp bảng kiểm ngày 23/11/2026.'));
 analysis:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','ambiguous',events,'{}');
 IF public.read_living_review(analysis)->'events'->0->>'blocked' NOT LIKE '%khớp nhiều%' THEN RAISE EXCEPTION 'Ambiguous source was silently merged';END IF;
 BEGIN PERFORM public.confirm_living_event(analysis,0,NULL,gen_random_uuid(),st);RAISE EXCEPTION 'Ambiguous proposal approved';EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;END;
 UPDATE public.emails SET body_text='Tôi sẽ gửi tài liệu mới ngày 25/11/2026.' WHERE id=source;
 events:=jsonb_build_array(jsonb_build_object('source',source,'origin',source,'item',1,'kind','create','certainty','firm','blocked',NULL,
  'referenceKey','living:changed-origin','quote','Tôi sẽ gửi tài liệu mới ngày 25/11/2026.'));
 analysis:=public.store_living_analysis(actor,source,public.read_living_scope(source)->>'fingerprint','changed-origin',events,'{}');
 IF public.read_living_review(analysis)->'events'->0->>'blocked' NOT LIKE '%không còn khớp%' THEN RAISE EXCEPTION 'Changed original evidence allowed a duplicate creation'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: Living coverage preserves user edits across quote changes, isolates tenants and refuses ambiguous evidence matches' AS result;
