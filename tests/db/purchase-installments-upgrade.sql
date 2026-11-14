\if :seed_installments
BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('fb910000-0000-4000-8000-000000000001','installment-upgrade@example.test');
UPDATE public.registration_policy SET enabled=false;
INSERT INTO private.commitments(id,user_id,reference_key,version)
VALUES('fb910000-0000-4000-8000-000000000002','fb910000-0000-4000-8000-000000000001','upgrade-installments',1);
INSERT INTO private.commitment_revisions(user_id,commitment_id,version,request_key,request_hash,kind,state,changed_fields,anchors)
VALUES('fb910000-0000-4000-8000-000000000001','fb910000-0000-4000-8000-000000000002',1,gen_random_uuid(),
  sha256('upgrade'::bytea),'created','{"status":"open"}','{}','[{"field":"subject"}]');
INSERT INTO private.purchase_payment_documents(id,user_id,commitment_id,kind,number,replaces,email_id,attachment_id,filename,binding,digest,source_at,lines)
SELECT d.id,'fb910000-0000-4000-8000-000000000001','fb910000-0000-4000-8000-000000000002','invoice',
  d.number,d.replaces,gen_random_uuid(),gen_random_uuid(),'upgrade.csv','binding','digest',d.at::timestamptz,
  jsonb_build_array(jsonb_build_object('code','B','quantity',d.quantity))
FROM (VALUES
  ('fb910000-0000-4000-8000-000000000003'::uuid,'INV-1',NULL,100,'2026-11-04Z'),
  ('fb910000-0000-4000-8000-000000000004'::uuid,'INV-2','INV-1',90,'2026-11-05Z')
) d(id,number,replaces,quantity,at);
INSERT INTO private.purchase_payment_decisions(user_id,commitment_id,invoice_id,proof)
VALUES('fb910000-0000-4000-8000-000000000001','fb910000-0000-4000-8000-000000000002',
  'fb910000-0000-4000-8000-000000000003','old-approval');
COMMIT;
\else
DO $$
DECLARE
  actor uuid:='fb910000-0000-4000-8000-000000000001';
  target uuid:='fb910000-0000-4000-8000-000000000002';
  original uuid:='fb910000-0000-4000-8000-000000000003';
BEGIN
  IF (SELECT count(*) FROM private.purchase_payment_documents d WHERE d.user_id=actor AND d.installment_id=original)<>2
    OR (SELECT a.invoice_id FROM private.purchase_installment_allocations(actor,target) a) IS DISTINCT FROM original
    OR (SELECT a.lines#>>'{0,quantity}' FROM private.purchase_installment_allocations(actor,target) a) IS DISTINCT FROM '100'
  THEN RAISE EXCEPTION 'Legacy successor chain or approved reservation was not preserved'; END IF;
  IF has_function_privilege('authenticated','public.confirm_purchase_payment(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.read_purchase_payment(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','private.purchase_installment_allocations(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'New installment boundaries permit an unauthorized call'; END IF;
END;
$$;
DELETE FROM auth.users WHERE id='fb910000-0000-4000-8000-000000000001';
SELECT 'PASS: existing invoice and its pending replacement migrate to the same installment and preserve the earlier reservation' AS result;
\endif
