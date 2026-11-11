\if :seed_ask_mail
CREATE TEMP TABLE ask_upgrade_policy AS SELECT enabled FROM public.registration_policy;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email)
VALUES ('00000000-0000-0000-0000-000000000095','ask-upgrade@example.test');
INSERT INTO public.emails(id,user_id,from_address,subject,body_text)
VALUES ('20000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000095',
  'vendor@example.test','Hồ sơ cũ JQ-841','Tài liệu đã tồn tại trước khi lập chỉ mục.');
UPDATE public.registration_policy SET enabled = (SELECT enabled FROM ask_upgrade_policy LIMIT 1);
\else
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000095',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.ask_inbox_search('JQ-841','{}',NULL,10)#>>'{hits,0,id}' IS DISTINCT FROM '20000000-0000-0000-0000-000000000095'
    OR jsonb_array_length(public.ask_inbox_pending('{}')) <> 1
  THEN RAISE EXCEPTION 'pre-migration email was lost or cannot be backfilled'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000095';
COMMIT;
SELECT 'PASS: M4-A upgrade finds existing mail and queues its first local embedding' AS result;
\endif
