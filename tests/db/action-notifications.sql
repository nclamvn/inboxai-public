BEGIN;

UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-0000-0000-000000001901','notifications-one@example.test'),
  ('00000000-0000-0000-0000-000000001902','notifications-two@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider,auth_type,is_active) VALUES
  ('00000000-0000-0000-0000-000000001911','00000000-0000-0000-0000-000000001901','mail-one@example.test','gmail','oauth_google',true),
  ('00000000-0000-0000-0000-000000001912','00000000-0000-0000-0000-000000001902','mail-two@example.test','gmail','oauth_google',true);
INSERT INTO private.gmail_reconnect_required(account_id,user_id) VALUES
  ('00000000-0000-0000-0000-000000001911','00000000-0000-0000-0000-000000001901'),
  ('00000000-0000-0000-0000-000000001912','00000000-0000-0000-0000-000000001902');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject) VALUES
  ('00000000-0000-0000-0000-000000001921','00000000-0000-0000-0000-000000001901','00000000-0000-0000-0000-000000001911','sender@example.test','Owned'),
  ('00000000-0000-0000-0000-000000001922','00000000-0000-0000-0000-000000001902','00000000-0000-0000-0000-000000001912','sender@example.test','Foreign');

DO $$
DECLARE actor uuid := '00000000-0000-0000-0000-000000001901';
  event text := repeat('a',64);
  receipt jsonb;
  first_alert text;
BEGIN
  IF has_function_privilege('anon','public.read_action_notification_context()','EXECUTE')
    OR has_function_privilege('anon','public.read_action_notification_seen(text[])','EXECUTE')
    OR has_function_privilege('anon','public.read_action_notification_sources(uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','public.mark_action_notification_seen(uuid,text)','EXECUTE')
    OR has_table_privilege('authenticated','private.action_notification_seen','SELECT')
    OR has_table_privilege('authenticated','private.action_notification_seen','INSERT')
  THEN RAISE EXCEPTION 'Notification grants expose other users or unauthorized writes'; END IF;

  PERFORM public.mark_action_notification_seen(actor,event);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  receipt := public.read_action_notification_seen(ARRAY[event]);
  first_alert := public.read_action_notification_context()->'reconnect'->0->>'eventId';
  IF public.read_action_notification_sources(ARRAY[
    '00000000-0000-0000-0000-000000001921','00000000-0000-0000-0000-000000001922']::uuid[])
    <> '{"00000000-0000-0000-0000-000000001921":"mail-one@example.test"}'::jsonb
  THEN RAISE EXCEPTION 'Notification source lookup crossed tenants'; END IF;
  IF NOT receipt ? event THEN RAISE EXCEPTION 'The owner did not receive the view receipt'; END IF;
  PERFORM public.mark_action_notification_seen(actor,event);
  IF receipt IS DISTINCT FROM public.read_action_notification_seen(ARRAY[event])
    OR (SELECT count(*) FROM private.action_notification_seen WHERE user_id=actor) <> 1
    OR jsonb_array_length(public.read_action_notification_context()->'reconnect') <> 1
    OR (public.read_action_notification_context()->'reconnect'->0->>'email') IS DISTINCT FROM 'mail-one@example.test'
  THEN RAISE EXCEPTION 'Retry changed the receipt or viewing changed the open account alert'; END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001902',true);
  IF public.read_action_notification_seen(ARRAY[event]) <> '{}'::jsonb
    OR jsonb_array_length(public.read_action_notification_context()->'reconnect') <> 1
    OR (public.read_action_notification_context()->'reconnect'->0->>'email') IS DISTINCT FROM 'mail-two@example.test'
  THEN RAISE EXCEPTION 'The second tenant can read the first tenant alert or receipt'; END IF;

  DELETE FROM private.gmail_reconnect_required WHERE user_id=actor;
  INSERT INTO private.gmail_reconnect_required(account_id,user_id)
    VALUES ('00000000-0000-0000-0000-000000001911',actor);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF first_alert IS NULL OR first_alert = public.read_action_notification_context()->'reconnect'->0->>'eventId'
  THEN RAISE EXCEPTION 'Distinct Gmail alerts share an event identity'; END IF;
END $$;

ROLLBACK;
SELECT 'PASS: notification receipt replay, distinct reconnect events and tenant grants' AS result;
