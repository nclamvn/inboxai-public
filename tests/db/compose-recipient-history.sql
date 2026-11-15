BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000002001','compose-history-owner@example.test'),
 ('00000000-0000-0000-0000-000000002002','compose-history-foreign@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000002001','buying@example.test','gmail'),
 ('10000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000002001','finance@example.test','gmail'),
 ('10000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000002002','foreign@example.test','gmail');
INSERT INTO public.emails(user_id,source_account_id,from_address,from_name,to_addresses,direction,send_status,provider_deleted,is_deleted) VALUES
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002001','buying@example.test',NULL,'["own-contact@example.test"]','outbound','sent',false,false),
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002001','buying@example.test',NULL,'["partial@example.test"]','outbound','partial',false,false),
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002001','buying@example.test',NULL,'["trash@example.test"]','outbound',NULL,false,true),
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002001','buying@example.test',NULL,'["deleted@example.test"]','outbound',NULL,true,false),
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002002','finance@example.test',NULL,'["finance-contact@example.test"]','outbound','sent',false,false),
 ('00000000-0000-0000-0000-000000002002','10000000-0000-0000-0000-000000002003','foreign@example.test',NULL,'["foreign-contact@example.test"]','outbound','sent',false,false),
 ('00000000-0000-0000-0000-000000002001','10000000-0000-0000-0000-000000002001','own-contact@example.test','Đặng Minh Anh','[]','inbound',NULL,false,false),
 ('00000000-0000-0000-0000-000000002002','10000000-0000-0000-0000-000000002003','foreign-contact@example.test','Other tenant','[]','inbound',NULL,false,false);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE own constant uuid := '10000000-0000-0000-0000-000000002001';
  other constant uuid := '10000000-0000-0000-0000-000000002003';
  result jsonb;
BEGIN
  IF has_function_privilege('anon','public.read_compose_recipient_history(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.read_compose_recipient_names(uuid,text[])','EXECUTE')
  THEN RAISE EXCEPTION 'Recipient RPC is accessible without authentication'; END IF;
  result := public.read_compose_recipient_history(own);
  IF result->>'account' IS DISTINCT FROM 'buying@example.test' OR jsonb_array_length(result->'messages')<>1
    OR result->'messages'->0->'to' IS DISTINCT FROM '["own-contact@example.test"]'::jsonb
  THEN RAISE EXCEPTION 'Recipient history leaked another account, deleted mail or a partial delivery'; END IF;
  IF public.read_compose_recipient_names(own,ARRAY['own-contact@example.test','foreign-contact@example.test'])
    <> '{"own-contact@example.test":"Đặng Minh Anh"}'::jsonb
  THEN RAISE EXCEPTION 'The recipient name lookup crossed accounts or tenants'; END IF;
  BEGIN
    PERFORM public.read_compose_recipient_history(other);
    RAISE EXCEPTION 'Other tenant recipient history was accessible';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
  BEGIN
    PERFORM public.read_compose_recipient_names(other,ARRAY['foreign-contact@example.test']);
    RAISE EXCEPTION 'Other tenant recipient names were accessible';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;

SELECT 'PASS: recipient history includes only eligible sent mail, name evidence stays in the selected account and tenant grants are enforced' AS result;
