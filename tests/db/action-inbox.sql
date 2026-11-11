BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000041', 'action-owner@example.test'),
 ('00000000-0000-0000-0000-000000000042', 'action-other@example.test');
INSERT INTO public.emails (id,user_id,from_address,body_text,is_archived) VALUES
 ('20000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000041','sender@example.test',repeat('ả', 600),false),
 ('20000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000042','sender@example.test','Foreign private body',false),
 ('20000000-0000-0000-0000-000000000043','00000000-0000-0000-0000-000000000041','sender@example.test','Archived',true);

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF has_function_privilege(current_user, 'public.set_inbox_priority(uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege(current_user, 'public.inbox_preview(public.emails)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous Action Inbox execute';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
 own_id constant uuid := '20000000-0000-0000-0000-000000000041';
 other_id constant uuid := '20000000-0000-0000-0000-000000000042';
 archived_id constant uuid := '20000000-0000-0000-0000-000000000043';
 target_id uuid;
BEGIN
 IF (SELECT inbox_priority IS NOT NULL OR inbox_priority_version <> 0 FROM public.emails WHERE id = own_id) THEN
   RAISE EXCEPTION 'legacy email did not start automatic';
 END IF;
 IF (SELECT length(public.inbox_preview(e)) FROM public.emails e WHERE id=own_id) <> 480 OR
    EXISTS (SELECT public.inbox_preview(e) FROM public.emails e WHERE id=other_id) THEN
   RAISE EXCEPTION 'preview bound or tenant policy failed';
 END IF;
 IF public.set_inbox_priority(own_id,'action',0) <> '{"status":"saved","choice":"action","version":1}'::jsonb
    OR public.set_inbox_priority(own_id,'action',0) <> '{"status":"saved","choice":"action","version":1}'::jsonb
    OR public.set_inbox_priority(own_id,'later',0) <> '{"status":"conflict","choice":"action","version":1}'::jsonb THEN
   RAISE EXCEPTION 'save/replay/conflict mismatch';
 END IF;
 UPDATE public.emails SET category = 'transaction', priority = 1, is_read = true WHERE id=own_id;
 IF (SELECT inbox_priority FROM public.emails WHERE id=own_id) <> 'action' THEN
   RAISE EXCEPTION 'classifier or read update overwrote correction';
 END IF;
 IF public.set_inbox_priority(own_id,NULL,1) <> '{"status":"saved","choice":null,"version":2}'::jsonb THEN
   RAISE EXCEPTION 'reset failed';
 END IF;
 BEGIN
   PERFORM public.set_inbox_priority(own_id,'invalid',2);
   RAISE EXCEPTION 'accepted invalid priority';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 FOREACH target_id IN ARRAY ARRAY[other_id, archived_id] LOOP
   BEGIN
     PERFORM public.set_inbox_priority(target_id,'later',0);
     RAISE EXCEPTION 'accepted unavailable source';
   EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
   END;
 END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Action Inbox preview, tenant isolation, correction, reset and stale replay' AS result;
