BEGIN;

-- Keep the legacy parser and its output unchanged for existing decisions and receipts.
ALTER FUNCTION private.parse_purchase_payment(text) RENAME TO parse_purchase_payment_legacy;

CREATE FUNCTION private.parse_purchase_payment(p_text text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  normalized text;
  rows text[];
  fields text[];
  base text:= 'po,invoice,replaces,line,quantity,unit,unit_price,currency';
  legacy text;
  value text;
  deadline date;
  row_deadline date;
  parsed jsonb;
BEGIN
  IF p_text IS NULL OR octet_length(p_text)>8192 THEN
    RETURN private.parse_purchase_payment_legacy(p_text);
  END IF;
  normalized:=replace(regexp_replace(p_text,'^' || chr(65279),''),E'\r\n',E'\n');
  IF right(normalized,1)=E'\n' THEN normalized:=left(normalized,-1); END IF;
  rows:=string_to_array(normalized,E'\n');
  IF replace(rows[1],'"','') IS DISTINCT FROM base || ',payment_due' THEN
    RETURN private.parse_purchase_payment_legacy(p_text);
  END IF;
  IF cardinality(rows) NOT BETWEEN 2 AND 7 THEN
    RAISE EXCEPTION 'Hóa đơn CSV cần từ 1 đến 6 dòng dữ liệu.' USING ERRCODE='PT431';
  END IF;

  legacy:=base;
  FOR i IN 2..cardinality(rows) LOOP
    fields:=string_to_array(rows[i],',');
    IF cardinality(fields)<>9 THEN
      RAISE EXCEPTION 'Dòng % của CSV sai số cột.',i USING ERRCODE='PT431';
    END IF;
    value:=regexp_replace(fields[9],'^"([^"]*)"$','\1');
    row_deadline:=NULL;
    IF value<>'' THEN
      IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Hạn thanh toán phải theo dạng YYYY-MM-DD.' USING ERRCODE='PT431';
      END IF;
      BEGIN
        row_deadline:=value::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Hạn thanh toán không phải ngày hợp lệ.' USING ERRCODE='PT431';
      END;
    END IF;
    IF i=2 THEN deadline:=row_deadline; END IF;
    IF row_deadline IS DISTINCT FROM deadline THEN
      RAISE EXCEPTION 'Mọi dòng trên cùng hóa đơn phải có cùng hạn thanh toán.' USING ERRCODE='PT431';
    END IF;
    legacy:=legacy || E'\n' || array_to_string(fields[1:8],',');
  END LOOP;

  parsed:=private.parse_purchase_payment_legacy(legacy);
  -- Capture the date and original line inside the existing frozen evidence.
  RETURN parsed || jsonb_build_object('lines',(
    SELECT jsonb_agg(line || jsonb_build_object('quote',rows[(line->>'row')::int])
      || CASE WHEN deadline IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('paymentDue',deadline) END
      ORDER BY (line->>'row')::int)
    FROM jsonb_array_elements(parsed->'lines') line
  ));
END;
$$;
REVOKE ALL ON FUNCTION private.parse_purchase_payment(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE INDEX purchase_handoffs_approved_owner
  ON private.purchase_handoffs(owner_id,commitment_id,invoice_id) WHERE status='approved';
CREATE INDEX purchase_handoffs_approved_reviewer
  ON private.purchase_handoffs(reviewer_id,commitment_id,invoice_id) WHERE status='approved';
CREATE INDEX purchase_payment_installment_versions
  ON private.purchase_payment_documents(user_id,commitment_id,installment_id,source_at DESC,id DESC);

CREATE FUNCTION public.list_purchase_dues(p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH visible AS (
      SELECT h.id,h.owner_id,h.reviewer_id,h.commitment_id,h.invoice_id,h.reference,h.invoice_number,
        d.lines,d.email_id,d.attachment_id
      FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
        ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
      WHERE h.status='approved' AND actor IN (h.owner_id,h.reviewer_id)
        AND NOT EXISTS (
          SELECT 1 FROM private.purchase_payment_documents n JOIN private.purchase_handoffs newer
            ON newer.owner_id=n.user_id AND newer.commitment_id=n.commitment_id AND newer.invoice_id=n.id
          WHERE n.user_id=d.user_id AND n.commitment_id=d.commitment_id AND n.installment_id=d.installment_id
            AND n.source_at>d.source_at AND newer.status='approved'
        )
    ), balances AS MATERIALIZED (
      SELECT v.*,private.purchase_settlement_summary(actor,v.owner_id,v.commitment_id,v.invoice_id) AS summary
      FROM visible v
    ), actionable AS (
      SELECT b.*,summary->>'status' AS status,
        CASE WHEN summary->>'status'<>'review' THEN lines#>>'{0,paymentDue}' END AS deadline,
        CASE summary->>'status' WHEN 'review' THEN 0 WHEN 'reopened' THEN 1 ELSE 2 END AS priority
      FROM balances b
      WHERE summary->>'status' IN ('review','reopened','partial','waiting')
    ), page AS (
      SELECT * FROM actionable ORDER BY priority,deadline NULLS LAST,reference,invoice_number,id
      LIMIT 41 OFFSET p_page*40
    ), items AS (
      SELECT p.*, CASE WHEN p.status='reopened' THEN (
        SELECT part->>'emailId' FROM jsonb_array_elements(p.summary->'entries') part
        WHERE part->>'kind'='return' LIMIT 1
      ) END AS return_email
      FROM page p ORDER BY priority,deadline NULLS LAST,reference,invoice_number,id LIMIT 40
    )
    SELECT jsonb_build_object(
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',i.id,'role',CASE WHEN actor=i.owner_id THEN 'owner' ELSE 'reviewer' END,
        'orderId',CASE WHEN actor=i.owner_id THEN i.commitment_id END,
        'invoiceId',CASE WHEN actor=i.owner_id THEN i.invoice_id END,
        'reference',i.reference,'invoice',i.invoice_number,'status',i.status,
        'deadline',i.deadline,'remaining',i.summary->'remaining',
        'invoiceEmailId',CASE WHEN i.deadline IS NOT NULL AND actor=i.owner_id THEN i.email_id END,
        'invoiceAttachmentId',CASE WHEN i.deadline IS NOT NULL AND actor=i.reviewer_id THEN i.attachment_id END,
        'returnEmailId',i.return_email
      ) ORDER BY i.priority,i.deadline NULLS LAST,i.reference,i.invoice_number,i.id) FROM items i),'[]'::jsonb),
      'hasMore',(SELECT count(*)>40 FROM page)
    )
  );
END;
$$;

-- An approved handoff may expose just its current due-date evidence.
-- The server revalidates the binding and provider digest before returning bytes.
CREATE FUNCTION public.resolve_purchase_due_file(p_actor uuid,p_handoff uuid,p_file uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('ownerId',d.user_id,'emailId',d.email_id,'attachmentId',d.attachment_id,
    'digest',d.digest,'filename',d.filename) INTO result
  FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
    ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
  WHERE h.id=p_handoff AND h.reviewer_id=p_actor AND h.status='approved'
    AND d.attachment_id=p_file AND d.lines#>>'{0,paymentDue}' IS NOT NULL
    AND private.purchase_settlement_summary(p_actor,h.owner_id,h.commitment_id,d.id)->>'status'
      IN ('waiting','partial','reopened','paid');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy chứng từ hạn thanh toán thuộc quyền của bạn.' USING ERRCODE='PT404';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_purchase_dues(integer),public.resolve_purchase_due_file(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_purchase_dues(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_due_file(uuid,uuid,uuid) TO service_role;

COMMIT;
