BEGIN;
DO $$
DECLARE
  fixture text:='po,invoice,return,original_transfer,returned_on,amount,currency' ||
    E'\nPO-312,INV-312,RETURN-312,"BANK-312",2026-01-04,104000,VND\n';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.parse_purchase_settlement_entry(fixture) p
    WHERE p.transfer='RETURN-312' AND p.original_transfer='BANK-312' AND p.amount=104000 AND p.paid_on=DATE '2026-01-04')
  THEN RAISE EXCEPTION 'Return CSV lost the original transfer reference'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.parse_purchase_settlement_entry(
    'po,invoice,transfer,paid_on,amount,currency' || E'\nPO-312,INV-312,BANK-312,2026-01-01,104000,VND') p
    WHERE p.transfer='BANK-312' AND p.original_transfer IS NULL AND p.amount=104000)
  THEN RAISE EXCEPTION 'Legacy settlement CSV no longer parses'; END IF;
  BEGIN
    PERFORM private.parse_purchase_settlement_entry(replace(fixture,'BANK-312','=1234'));
    RAISE EXCEPTION 'Accepted a formula in the original transfer code';
  EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
  END;
  IF has_function_privilege('authenticated','private.parse_purchase_settlement_entry(text)','EXECUTE') OR
    has_function_privilege('authenticated','public.confirm_purchase_settlement(uuid,uuid,jsonb,text)','EXECUTE') OR
    has_table_privilege('service_role','private.purchase_settlements','UPDATE') OR
    has_table_privilege('authenticated','private.purchase_settlements','INSERT')
  THEN RAISE EXCEPTION 'Return migration opened a path around authorization'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: return CSV binds the original transfer, preserves legacy CSV and restricts ledger writes' AS result;
