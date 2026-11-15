BEGIN;
DO $$
DECLARE
  header constant text:='po,invoice,replaces,line,quantity,unit,unit_price,currency';
  first_line constant text:='PO-20,INV-20,,A,2,bộ,100,VND';
  second_line constant text:='PO-20,INV-20,,B,3,bộ,100,VND';
  row_text text;
  result jsonb;
BEGIN
  result:=private.parse_purchase_payment(chr(65279) || header || ',"payment_due"' || E'\r\n'
    || first_line || ',"2028-02-29"' || E'\r\n' || second_line || ',2028-02-29' || E'\r\n');
  IF result#>>'{lines,0,paymentDue}' IS DISTINCT FROM '2028-02-29'
    OR result#>>'{lines,1,paymentDue}' IS DISTINCT FROM '2028-02-29'
    OR result#>>'{lines,0,quote}' IS DISTINCT FROM first_line || ',"2028-02-29"'
  THEN RAISE EXCEPTION 'Deadline or raw CSV evidence not preserved'; END IF;
  IF private.parse_purchase_payment(header || E'\n' || first_line) IS DISTINCT FROM
    private.parse_purchase_payment_legacy(header || E'\n' || first_line)
    OR private.parse_purchase_payment(header || ',payment_due' || E'\n' || first_line || ',')#>>'{lines,0,paymentDue}' IS NOT NULL
  THEN RAISE EXCEPTION 'An invoice without a date gained a deadline or changed shape'; END IF;

  FOREACH row_text IN ARRAY ARRAY[
    first_line || ',2026-02-29',
    first_line || ',2026-13-01',
    first_line || ',2026-01-01' || E'\n' || second_line || ',2026-01-02',
    first_line || ',2026-01-01' || E'\n' || second_line || ',',
    first_line || ',=TODAY()',
    first_line || ',2026-01-01,extra'
  ] LOOP
    BEGIN
      PERFORM private.parse_purchase_payment(header || ',payment_due' || E'\n' || row_text);
      RAISE EXCEPTION 'Accepted malformed or conflicting deadline: %',row_text;
    EXCEPTION WHEN SQLSTATE 'PT431' THEN NULL;
    END;
  END LOOP;

  IF has_function_privilege('anon','public.list_purchase_dues(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.resolve_purchase_due_file(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.resolve_purchase_due_file(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','private.parse_purchase_payment(text)','EXECUTE')
    OR has_function_privilege('authenticated','private.parse_purchase_payment_legacy(text)','EXECUTE')
  THEN RAISE EXCEPTION 'Due queue or delegated file can bypass authorization'; END IF;

  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  IF public.list_purchase_dues(0) IS DISTINCT FROM '{"items":[],"hasMore":false}'::jsonb
  THEN RAISE EXCEPTION 'Empty authorized scope did not return an empty queue'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: payment deadlines preserve CSV evidence, reject ambiguity and keep legacy parsing and restricted access' AS result;
