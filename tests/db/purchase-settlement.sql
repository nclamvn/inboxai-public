BEGIN;
DO $$
DECLARE
  sample text:='po,invoice,transfer,paid_on,amount,currency' || E'\nPO-312,INV-312,BANK-312,2026-01-01,200000,VND\n';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.parse_purchase_settlement(chr(65279) || replace(sample,E'\n',E'\r\n')) p
    WHERE p.reference='PO-312' AND p.invoice='INV-312' AND p.transfer='BANK-312' AND p.amount=200000 AND p.paid_on=DATE '2026-01-01')
  THEN RAISE EXCEPTION 'Failed to normalize a valid settlement CSV'; END IF;
  BEGIN
    PERFORM private.parse_purchase_settlement(replace(sample,'2026-01-01','2026-02-30'));
    RAISE EXCEPTION 'Accepted an invalid calendar date';
  EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
  END;
  BEGIN
    PERFORM private.parse_purchase_settlement(replace(sample,'200000,VND','200000.25,VND'));
    RAISE EXCEPTION 'Accepted non-integer VND';
  EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
  END;
  BEGIN
    PERFORM private.parse_purchase_settlement(replace(sample,'200000,VND','200000,USD'));
    RAISE EXCEPTION 'Accepted unsupported currency';
  EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
  END;
  IF has_function_privilege('authenticated','public.preview_purchase_settlement(uuid,uuid,uuid,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.confirm_purchase_settlement(uuid,uuid,jsonb,text)','EXECUTE') OR
    has_function_privilege('anon','public.read_purchase_settlement(uuid,uuid,uuid)','EXECUTE') OR
    has_function_privilege('authenticated','private.purchase_settlement_summary(uuid,uuid,uuid,uuid)','EXECUTE') OR
    has_table_privilege('authenticated','private.purchase_settlements','SELECT')
  THEN RAISE EXCEPTION 'Settlement boundary allows bypass'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: settlement parser validates money, dates and currency, service writes and private reads are scoped' AS result;
