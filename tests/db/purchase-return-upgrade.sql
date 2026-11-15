\if :seed_return_upgrade
BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('e1500000-0000-4000-8000-000000000001','buyer-return-upgrade@example.test',now()),
  ('e1500000-0000-4000-8000-000000000002','accountant-return-upgrade@example.test',now());
UPDATE public.registration_policy SET enabled=false;
INSERT INTO private.commitments(id,user_id,reference_key,version,detection_reference) VALUES
  ('e1500000-0000-4000-8000-000000000003','e1500000-0000-4000-8000-000000000001','return-upgrade',1,'PO-150');
INSERT INTO private.commitment_revisions(user_id,commitment_id,version,request_key,request_hash,kind,state,changed_fields,anchors)
VALUES('e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003',1,gen_random_uuid(),
  sha256('return-upgrade'::bytea),'created','{"status":"open"}','{}','[{"field":"subject"}]');
INSERT INTO private.purchase_payment_documents(id,user_id,commitment_id,kind,number,email_id,attachment_id,filename,binding,digest,source_at,lines)
VALUES('e1500000-0000-4000-8000-000000000004','e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003',
  'invoice','INV-150',gen_random_uuid(),gen_random_uuid(),'upgrade.csv','binding','digest','2026-01-01Z','[{"code":"A","quantity":1,"price":104000}]');
INSERT INTO private.purchase_payment_decisions(id,user_id,commitment_id,invoice_id,proof,approved_by)
VALUES('e1500000-0000-4000-8000-000000000005','e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003',
  'e1500000-0000-4000-8000-000000000004','proof','e1500000-0000-4000-8000-000000000002');
INSERT INTO private.purchase_handoff_orders(owner_id,commitment_id)
VALUES('e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003');
INSERT INTO private.purchase_handoffs(id,owner_id,commitment_id,invoice_id,reviewer_id,reviewer_label,proof,reference,invoice_number,status)
VALUES('e1500000-0000-4000-8000-000000000006','e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003',
  'e1500000-0000-4000-8000-000000000004','e1500000-0000-4000-8000-000000000002','accountant-return-upgrade@example.test','proof','PO-150','INV-150','approved');
INSERT INTO private.purchase_settlements(id,owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
  reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest)
VALUES('e1500000-0000-4000-8000-000000000007','e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000003',
  'e1500000-0000-4000-8000-000000000004','e1500000-0000-4000-8000-000000000004','e1500000-0000-4000-8000-000000000005',
  'e1500000-0000-4000-8000-000000000006','e1500000-0000-4000-8000-000000000002','accountant-return-upgrade@example.test',
  'BANK-150','2026-01-02',104000,gen_random_uuid(),gen_random_uuid(),'bank.csv','binding','digest');
INSERT INTO private.purchase_settlement_requests(actor_id,request_key,command_hash,response)
VALUES('e1500000-0000-4000-8000-000000000002','e1500000-0000-4000-8000-000000000008',sha256(convert_to('{"expectedPaid": 0}','UTF8')),
  '{"id":"e1500000-0000-4000-8000-000000000007","paid":104000,"remaining":0,"replayed":false}');
COMMIT;
\else
DO $$
DECLARE
  buyer uuid:='e1500000-0000-4000-8000-000000000001';
  account uuid:='e1500000-0000-4000-8000-000000000002';
  receipt jsonb;
  summary jsonb;
BEGIN
  receipt:=private.purchase_settlement_receipt(account,'e1500000-0000-4000-8000-000000000008','{"expectedPaid":0}');
  summary:=private.purchase_settlement_summary(buyer,buyer,'e1500000-0000-4000-8000-000000000003','e1500000-0000-4000-8000-000000000004');
  IF receipt->>'replayed' IS DISTINCT FROM 'true' OR receipt->>'paid' IS DISTINCT FROM '104000'
    OR summary->>'paid' IS DISTINCT FROM '104000' OR summary->>'returned' IS DISTINCT FROM '0'
    OR summary#>>'{entries,0,kind}' IS DISTINCT FROM 'payment'
    OR summary#>>'{entries,0,reference}' IS DISTINCT FROM 'BANK-150'
  THEN RAISE EXCEPTION 'Applying the return migration changed old payments or receipts'; END IF;
END;
$$;
DELETE FROM auth.users WHERE id IN ('e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000002');
SELECT 'PASS: upgrade preserves pre-existing payments, balance and original idempotency receipts' AS result;
\endif
