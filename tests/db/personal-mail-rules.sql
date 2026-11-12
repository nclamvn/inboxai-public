BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000181','rules-owner@example.test'),
 ('00000000-0000-0000-0000-000000000182','rules-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000181','rules-gmail@example.test','gmail'),
 ('10000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-000000000182','rules-other@gmail.example.test','gmail');
INSERT INTO public.emails(id,user_id,source_account_id,sync_namespace,from_address,category,subject) VALUES
 ('20000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000181','10000000-0000-0000-0000-000000000181','gmail','Notify@example.test','work','Source'),
 ('20000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-000000000181','10000000-0000-0000-0000-000000000181','gmail','notify@example.test','work','Keep'),
 ('20000000-0000-0000-0000-000000000183','00000000-0000-0000-0000-000000000182','10000000-0000-0000-0000-000000000182','gmail','notify@example.test','work','Other tenant');

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF has_function_privilege(current_user,'public.list_personal_mail_rules()','EXECUTE')
    OR has_function_privilege(current_user,'public.preview_personal_mail_rule(uuid,text,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous rule access';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000181',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE source_id constant uuid := '20000000-0000-0000-0000-000000000181';
  manual_id constant uuid := '20000000-0000-0000-0000-000000000182';
  foreign_id constant uuid := '20000000-0000-0000-0000-000000000183';
  rule_id constant uuid := '30000000-0000-0000-0000-000000000181';
  snapshot jsonb; receipt jsonb;
BEGIN
  snapshot := public.preview_personal_mail_rule(source_id,'promotion',true);
  IF jsonb_array_length(snapshot->'items')<>2 OR public.list_personal_mail_rules()<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Preview included a foreign email or wrote a rule';
  END IF;
  receipt := public.confirm_personal_mail_rule(source_id,'promotion',true,snapshot->>'token',rule_id);
  IF (receipt->>'applied')::integer<>2 OR receipt IS DISTINCT FROM
     public.confirm_personal_mail_rule(source_id,'promotion',true,snapshot->>'token',rule_id) THEN
    RAISE EXCEPTION 'Apply or retry failed';
  END IF;
  -- Automatic writes refresh the baseline while the personal label stays visible.
  UPDATE public.emails SET category='transaction' WHERE id=source_id;
  IF (SELECT public.mail_category(e) FROM public.emails e WHERE id=source_id) IS DISTINCT FROM 'promotion' THEN
    RAISE EXCEPTION 'Automatic write replaced a personal rule';
  END IF;
  -- Selecting the same visible label is still a manual decision.
  PERFORM public.set_personal_mail_category(ARRAY[manual_id],'promotion');
  BEGIN
    PERFORM public.set_personal_mail_category(ARRAY[source_id,foreign_id],'personal');
    RAISE EXCEPTION 'Allowed foreign write';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  receipt := public.undo_personal_mail_rule(rule_id);
  IF receipt->>'restored'<>'1' OR receipt->>'kept'<>'1' OR receipt IS DISTINCT FROM public.undo_personal_mail_rule(rule_id)
    OR (SELECT public.mail_category(e) FROM public.emails e WHERE id=source_id) IS DISTINCT FROM 'transaction'
    OR (SELECT public.mail_category(e) FROM public.emails e WHERE id=manual_id) IS DISTINCT FROM 'promotion' THEN
    RAISE EXCEPTION 'Undo lost the refreshed baseline or a manual choice';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000182',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.list_personal_mail_rules()<>'[]'::jsonb THEN RAISE EXCEPTION 'Rule history leaked'; END IF;
  BEGIN
    PERFORM public.preview_personal_mail_rule('20000000-0000-0000-0000-000000000181','promotion',true);
    RAISE EXCEPTION 'Foreign source accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: sender rule preview, idempotent confirmation and undo, manual choice, refreshed baseline and tenant isolation' AS result;
