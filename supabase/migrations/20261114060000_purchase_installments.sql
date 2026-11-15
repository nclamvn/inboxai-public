BEGIN;

DROP INDEX private.purchase_payment_one_original;
ALTER TABLE private.purchase_payment_documents ADD COLUMN installment_id uuid;

-- Preserve each existing original and its full replacement chain on upgrade.
WITH RECURSIVE chain AS (
  SELECT user_id,commitment_id,id,number,id AS installment_id
  FROM private.purchase_payment_documents WHERE kind='invoice' AND replaces IS NULL
  UNION ALL
  SELECT child.user_id,child.commitment_id,child.id,child.number,chain.installment_id
  FROM chain JOIN private.purchase_payment_documents child
    ON child.user_id=chain.user_id AND child.commitment_id=chain.commitment_id AND child.replaces=chain.number
)
UPDATE private.purchase_payment_documents d SET installment_id=chain.installment_id FROM chain
WHERE d.user_id=chain.user_id AND d.commitment_id=chain.commitment_id AND d.id=chain.id;
ALTER TABLE private.purchase_payment_documents ADD CONSTRAINT purchase_payment_installment_scope
  CHECK ((kind='invoice')=(installment_id IS NOT NULL));
CREATE INDEX purchase_payment_installments ON private.purchase_payment_documents(user_id,commitment_id,installment_id);
CREATE INDEX purchase_payment_invoice_decisions ON private.purchase_payment_decisions(user_id,commitment_id,invoice_id,recorded_at DESC);

CREATE FUNCTION private.bind_purchase_installment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.kind='price' THEN
    NEW.installment_id:=NULL;
  ELSIF NEW.replaces IS NULL THEN
    NEW.installment_id:=NEW.id;
  ELSE
    SELECT d.installment_id INTO NEW.installment_id FROM private.purchase_payment_documents d
    WHERE d.user_id=NEW.user_id AND d.commitment_id=NEW.commitment_id AND d.kind='invoice' AND d.number=NEW.replaces;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice predecessor unavailable' USING ERRCODE='PT432'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bind_purchase_installment BEFORE INSERT ON private.purchase_payment_documents
FOR EACH ROW EXECUTE FUNCTION private.bind_purchase_installment();
REVOKE ALL ON FUNCTION private.bind_purchase_installment() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.prepare_purchase_payment(actor uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  picked record;
  source public.emails;
  file public.attachments;
  parsed jsonb;
  head private.commitments;
  state jsonb;
  original_mail public.emails;
  active_invoice private.purchase_payment_documents;
  row_data jsonb;
  po_line jsonb;
  registration_hash text;
BEGIN
  SELECT * INTO STRICT picked FROM private.purchase_csv_input(actor,p_email,p_attachment);
  source:=picked.source;
  file:=picked.file;
  IF picked.binding IS DISTINCT FROM p_binding THEN
    RAISE EXCEPTION 'Email hoặc tệp đã thay đổi. Hãy mở lại chứng từ.' USING ERRCODE='PT432';
  END IF;
  parsed:=private.parse_purchase_payment(p_text);
  IF private.commitment_subject_reference(source.subject) IS DISTINCT FROM parsed->>'reference' THEN
    RAISE EXCEPTION 'Mã PO trên email và trong CSV phải trùng nhau.' USING ERRCODE='PT431';
  END IF;
  SELECT * INTO head FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=parsed->>'reference';
  IF NOT FOUND OR (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=parsed->>'reference')<>1
  THEN RAISE EXCEPTION 'Chưa xác định được đơn mua hàng.' USING ERRCODE='PT431'; END IF;
  SELECT r.state INTO state FROM private.commitment_revisions r
    WHERE r.user_id=actor AND r.commitment_id=head.id AND r.version=head.version;
  SELECT e.* INTO original_mail FROM private.purchase_order_sources(actor,head.id) s
    JOIN public.emails e ON e.user_id=actor AND e.id=(s.evidence->>'emailId')::uuid
    WHERE s.operation='create' AND s.evidence->>'availability'='available';
  IF NOT FOUND OR NOT (state ? 'purchaseOrder') OR state->>'status'='cancelled'
    OR source.source_account_id IS DISTINCT FROM original_mail.source_account_id
    OR lower(btrim(source.from_address)) IS DISTINCT FROM state->>'ownerEmail'
    OR source.received_at<original_mail.received_at
  THEN RAISE EXCEPTION 'Chứng từ phải từ nhà cung cấp qua hộp thư Mua hàng của PO.' USING ERRCODE='PT431'; END IF;

  IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=actor
    AND (d.attachment_id=p_attachment OR (d.commitment_id=head.id AND d.number=parsed->>'number')))
  THEN RAISE EXCEPTION 'Chứng từ này đã được ghi nhận.' USING ERRCODE='PT432'; END IF;

  IF parsed->>'kind'='price' THEN
    IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='price')
    THEN RAISE EXCEPTION 'Đơn đã có bảng giá được duyệt.' USING ERRCODE='PT432'; END IF;
    IF jsonb_array_length(parsed->'lines')<>jsonb_array_length(state#>'{purchaseOrder,lines}') THEN
      RAISE EXCEPTION 'Bảng giá phải bao phủ đủ dòng trên PO.' USING ERRCODE='PT431';
    END IF;
  ELSE
    IF parsed->>'replaces' IS NOT NULL THEN
      SELECT d.* INTO active_invoice FROM private.purchase_payment_documents d
      WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='invoice' AND d.number=parsed->>'replaces'
        AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents n WHERE n.user_id=actor
          AND n.commitment_id=head.id AND n.replaces=d.number);
      IF NOT FOUND OR source.received_at<=active_invoice.source_at THEN
        RAISE EXCEPTION 'Hóa đơn đính chính phải mới hơn và thay đúng chứng từ đang hiệu lực của đợt.' USING ERRCODE='PT432';
      END IF;
      IF private.purchase_payment_document(actor,active_invoice.id) IS NULL THEN
        RAISE EXCEPTION 'Hóa đơn bị thay thế không còn nguồn kiểm chứng.' USING ERRCODE='PT432';
      END IF;
    END IF;
    IF (SELECT count(*) FROM private.purchase_payment_documents d WHERE d.user_id=actor AND d.commitment_id=head.id)>=32 THEN
      RAISE EXCEPTION 'Đơn đã đạt giới hạn chứng từ.' USING ERRCODE='PT431';
    END IF;
  END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(parsed->'lines') LOOP
    SELECT l.value INTO po_line FROM jsonb_array_elements(state#>'{purchaseOrder,lines}') l(value)
      WHERE l.value->>'code'=row_data->>'code';
    IF NOT FOUND OR po_line->>'unit'<>row_data->>'unit'
      OR (parsed->>'kind'='price' AND po_line->>'ordered'<>row_data->>'quantity')
    THEN RAISE EXCEPTION 'Dòng % không khớp mã, đơn vị hoặc số đặt trên PO.',row_data->>'row' USING ERRCODE='PT431'; END IF;
  END LOOP;
  registration_hash:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
  RETURN parsed || jsonb_build_object('source',jsonb_build_object('emailId',source.id,'attachmentId',file.id,'filename',file.filename,
    'digest',registration_hash,'subject',source.subject,'sender',source.from_address,
    'account',(SELECT a.email_address FROM public.source_accounts a WHERE a.user_id=actor AND a.id=source.source_account_id)),
    'command',jsonb_build_object('action','register','id',head.id,'version',head.version,'emailId',source.id,
      'attachmentId',file.id,'binding',picked.binding,'digest',registration_hash));
END;
$$;

-- Keep a prior approval reserved until a replacement for that same installment is approved.
CREATE FUNCTION private.purchase_installment_allocations(p_actor uuid,p_id uuid)
RETURNS TABLE(installment_id uuid,invoice_id uuid,decision_id uuid,recorded_at timestamptz,lines jsonb)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT DISTINCT ON (d.installment_id) d.installment_id,d.id,a.id,a.recorded_at,d.lines
  FROM private.purchase_payment_decisions a JOIN private.purchase_payment_documents d
    ON d.user_id=a.user_id AND d.commitment_id=a.commitment_id AND d.id=a.invoice_id
  WHERE a.user_id=p_actor AND a.commitment_id=p_id AND d.kind='invoice'
  ORDER BY d.installment_id,d.source_at DESC,a.recorded_at DESC,a.id DESC
$$;

CREATE FUNCTION private.purchase_installment_snapshot(actor uuid,p_id uuid,p_invoice uuid,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  head private.commitments;
  state jsonb;
  price_id uuid;
  invoice private.purchase_payment_documents;
  price_doc jsonb;
  invoice_doc jsonb;
  sources jsonb;
  source_count integer;
  allocations jsonb;
  allocation_count integer;
  summaries jsonb;
  history jsonb;
  lines jsonb;
  subtotal bigint;
  blocked boolean;
  historical boolean;
  snapshot_hash text;
  decided uuid;
  decided_at timestamptz;
BEGIN
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=actor AND c.id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  SELECT r.state INTO state FROM private.commitment_revisions r
    WHERE r.user_id=actor AND r.commitment_id=head.id AND r.version=head.version;
  IF NOT (state ? 'purchaseOrder') OR state->>'status'='cancelled' OR
    (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=head.detection_reference)<>1
  THEN RETURN '{"status":"unavailable"}'; END IF;
  SELECT d.id INTO price_id FROM private.purchase_payment_documents d
    WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='price';

  IF p_invoice IS NOT NULL THEN
    SELECT d.* INTO invoice FROM private.purchase_payment_documents d
      WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='invoice' AND d.id=p_invoice;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='PT404'; END IF;
  ELSE
    SELECT d.* INTO invoice FROM private.purchase_payment_documents d
      WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='invoice'
        AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents n
          WHERE n.user_id=actor AND n.commitment_id=head.id AND n.replaces=d.number)
      ORDER BY d.recorded_at DESC,d.id DESC LIMIT 1;
  END IF;
  price_doc:=private.purchase_payment_document(actor,price_id,p_filters);
  invoice_doc:=private.purchase_payment_document(actor,invoice.id,p_filters);
  IF (price_id IS NOT NULL AND price_doc IS NULL) OR (invoice.id IS NOT NULL AND invoice_doc IS NULL)
  THEN RETURN '{"status":"unavailable"}'; END IF;

  SELECT count(*),jsonb_agg(p.evidence || jsonb_build_object('line',p.line_code,'operation',p.operation,
    'sourceVersion',p.version) ORDER BY p.version,p.line_code)
  INTO source_count,sources
  FROM private.purchase_order_sources(actor,p_id) p
  JOIN public.emails e ON e.user_id=actor AND e.id=(p.evidence->>'emailId')::uuid
  WHERE p.operation IN ('create','receive','correct') AND p.evidence->>'availability'='available'
    AND private.ask_scope(e,actor,p_filters);
  IF source_count=0 OR source_count>16 OR source_count<>(SELECT count(*) FROM private.purchase_order_sources(actor,p_id) p
    WHERE p.operation IN ('create','receive','correct'))
  THEN RETURN '{"status":"unavailable"}'; END IF;

  IF price_doc IS NULL OR invoice_doc IS NULL THEN
    RETURN jsonb_build_object('id',p_id,'reference',head.detection_reference,
      'status',CASE WHEN price_doc IS NULL THEN 'missing_price' ELSE 'missing_invoice' END,
      'price',price_doc,'invoice',invoice_doc,'sources',sources);
  END IF;

  SELECT count(doc.evidence),COALESCE(jsonb_agg(doc.evidence || jsonb_build_object(
      'decisionId',a.decision_id,'decisionAt',a.recorded_at,'installmentId',a.installment_id,'invoiceId',a.invoice_id)
      ORDER BY a.installment_id),'[]'::jsonb)
  INTO allocation_count,allocations
  FROM private.purchase_installment_allocations(actor,p_id) a
  CROSS JOIN LATERAL (SELECT private.purchase_payment_document(actor,a.invoice_id,p_filters) AS evidence) doc;
  IF allocation_count<>(SELECT count(*) FROM private.purchase_installment_allocations(actor,p_id))
  THEN RETURN '{"status":"unavailable"}'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'installmentId',d.installment_id,
      'replaces',d.replaces,'superseded',EXISTS(SELECT 1 FROM private.purchase_payment_documents n
        WHERE n.user_id=actor AND n.commitment_id=p_id AND n.replaces=d.number),
      'decisionAt',last_decision.recorded_at) ORDER BY d.recorded_at DESC,d.id DESC)
  INTO history
  FROM private.purchase_payment_documents d
  LEFT JOIN LATERAL (SELECT a.recorded_at FROM private.purchase_payment_decisions a
    WHERE a.user_id=actor AND a.commitment_id=p_id AND a.invoice_id=d.id
    ORDER BY a.recorded_at DESC,a.id DESC LIMIT 1) last_decision ON true
  WHERE d.user_id=actor AND d.commitment_id=p_id AND d.kind='invoice'
    AND private.purchase_payment_document(actor,d.id,p_filters) IS NOT NULL;

  WITH approved AS (
    SELECT l.value->>'code' AS code, sum((l.value->>'quantity')::bigint) AS total,
      COALESCE(sum((l.value->>'quantity')::bigint) FILTER (WHERE a.installment_id<>invoice.installment_id),0) AS other
    FROM private.purchase_installment_allocations(actor,p_id) a
    CROSS JOIN LATERAL jsonb_array_elements(a.lines) l(value) GROUP BY l.value->>'code'
  ), balances AS (
    SELECT l.ord,l.value->>'code' AS code,l.value->>'unit' AS unit,
      (l.value->>'ordered')::int AS ordered,(l.value->>'received')::int AS received,
      COALESCE(a.total,0) AS approved,COALESCE(a.other,0) AS other
    FROM jsonb_array_elements(state#>'{purchaseOrder,lines}') WITH ORDINALITY l(value,ord)
    LEFT JOIN approved a ON a.code=l.value->>'code'
  ), matched AS (
    SELECT b.*,i.value AS billed,p.value AS price,i.ord AS invoice_position
    FROM balances b
    JOIN jsonb_array_elements(invoice_doc->'lines') WITH ORDINALITY i(value,ord) ON i.value->>'code'=b.code
    JOIN jsonb_array_elements(price_doc->'lines') p(value) ON p.value->>'code'=b.code
  )
  SELECT (SELECT jsonb_agg(jsonb_build_object('code',b.code,'unit',b.unit,'approved',b.approved,
      'remaining',greatest(0,least(b.ordered,b.received)-b.approved),
      'over',greatest(0,b.approved-least(b.ordered,b.received))) ORDER BY b.ord) FROM balances b),
    jsonb_agg(jsonb_build_object('code',m.code,'unit',m.unit,'invoiceRow',(m.billed->>'row')::int,
      'priceRow',(m.price->>'row')::int,'ordered',m.ordered,'received',m.received,'otherApproved',m.other,
      'available',greatest(0,least(m.ordered,m.received)-m.other),
      'quantity',(m.billed->>'quantity')::int,'expectedPrice',(m.price->>'price')::int,'invoicePrice',(m.billed->>'price')::int)
      ORDER BY m.invoice_position),
    sum((m.billed->>'quantity')::bigint*(m.billed->>'price')::bigint),
    bool_or(m.other+(m.billed->>'quantity')::int>least(m.ordered,m.received)
      OR m.billed->>'price' IS DISTINCT FROM m.price->>'price')
  INTO summaries,lines,subtotal,blocked
  FROM matched m;
  IF lines IS NULL OR jsonb_array_length(lines)<>jsonb_array_length(invoice_doc->'lines')
  THEN RETURN '{"status":"unavailable"}'; END IF;

  historical:=EXISTS(SELECT 1 FROM private.purchase_payment_documents n WHERE n.user_id=actor
    AND n.commitment_id=p_id AND n.replaces=invoice.number);
  SELECT a.decision_id,a.recorded_at INTO decided,decided_at FROM private.purchase_installment_allocations(actor,p_id) a
    WHERE a.invoice_id=invoice.id;
  -- The pending action freezes both the upstream evidence and all quantities already reserved.
  snapshot_hash:=encode(sha256(convert_to(jsonb_build_array(price_doc,invoice_doc,sources,lines,allocations)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('id',p_id,'reference',head.detection_reference,
    'status',CASE WHEN historical THEN 'superseded' WHEN blocked THEN 'blocked' WHEN decided IS NOT NULL THEN 'approved' ELSE 'ready' END,
    'price',price_doc,'invoice',invoice_doc,'sources',sources,'lines',lines,'subtotal',subtotal,
    'allocations',allocations,'balances',summaries,'invoices',history,
    'decisionId',CASE WHEN NOT blocked THEN decided END,'decisionAt',CASE WHEN NOT blocked THEN decided_at END,
    'command',CASE WHEN NOT historical AND NOT blocked AND decided IS NULL
      THEN jsonb_build_object('action','approve','id',p_id,'invoiceId',invoice.id,'proof',snapshot_hash) END);
END;
$$;

-- Preserve the original RPC entry point for older callers and add explicit invoice selection.
CREATE OR REPLACE FUNCTION private.purchase_payment_snapshot(actor uuid,p_id uuid,p_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT private.purchase_installment_snapshot(actor,p_id,NULL,p_filters)
$$;

CREATE FUNCTION public.read_purchase_payment(p_id uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  RETURN private.purchase_installment_snapshot(auth.uid(),p_id,p_invoice,'{}');
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_installment_allocations(uuid,uuid),private.purchase_installment_snapshot(uuid,uuid,uuid,jsonb),
  public.read_purchase_payment(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_payment(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_purchase_payment(p_actor uuid,p_key uuid,p_command jsonb,p_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  target uuid:=(p_command->>'id')::uuid;
  selected_invoice uuid:=(p_command->>'invoiceId')::uuid;
  source_email uuid:=(p_command->>'emailId')::uuid;
  source_attachment uuid:=(p_command->>'attachmentId')::uuid;
  action text:=p_command->>'action';
  head private.commitments;
  ref text;
  result jsonb;
  prepared jsonb;
  document_id uuid;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR target IS NULL OR COALESCE(action,'') NOT IN ('register','approve')
    OR octet_length(p_command::text)>4096 OR (action='register' AND (source_email IS NULL OR source_attachment IS NULL))
  THEN RAISE EXCEPTION 'Invalid approval' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-payment:' || p_actor || ':' || p_key,0));
  result:=private.purchase_payment_receipt(p_actor,p_key,p_command);
  IF result->>'replayed'='true' THEN RETURN result; END IF;
  SELECT c.detection_reference INTO ref FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;
  -- Match the source-before-case ordering of warehouse approvals.
  IF source_email IS NOT NULL THEN
    PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email FOR SHARE;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || ref,0));
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;

  PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id IN (
    SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
    UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(p_actor,target) s
  ) ORDER BY e.id FOR SHARE;
  PERFORM f.id FROM public.attachments f JOIN public.emails e ON e.id=f.email_id AND e.user_id=p_actor
  WHERE (f.id=source_attachment AND e.id=source_email) OR f.id IN (
    SELECT d.attachment_id FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
    UNION SELECT d.attachment_id FROM private.purchase_csv_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
  ) ORDER BY f.id FOR SHARE OF f;
  IF action='register' THEN
    prepared:=private.prepare_purchase_payment(p_actor,source_email,source_attachment,p_command->>'binding',p_text);
    IF prepared->'command' IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'Sổ hoặc nội dung chứng từ đã thay đổi. Hãy mở lại bản xem trước.' USING ERRCODE='PT432';
    END IF;
    INSERT INTO private.purchase_payment_documents(user_id,commitment_id,kind,number,replaces,email_id,attachment_id,filename,binding,digest,source_at,lines)
    SELECT p_actor,target,prepared->>'kind',prepared->>'number',prepared->>'replaces',source_email,source_attachment,
      prepared#>>'{source,filename}',p_command->>'binding',p_command->>'digest',e.received_at,prepared->'lines'
    FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email RETURNING id INTO document_id;
    result:=jsonb_build_object('id',target,'documentId',document_id,'replayed',false);
  ELSE
    prepared:=private.purchase_installment_snapshot(p_actor,target,selected_invoice,'{}');
    IF prepared->>'status' IS DISTINCT FROM 'ready' OR prepared->'command' IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'Bộ chứng từ chưa khớp hoặc đã thay đổi. Hãy xem lại trước khi duyệt.' USING ERRCODE='PT432';
    END IF;
    INSERT INTO private.purchase_payment_decisions(user_id,commitment_id,invoice_id,proof)
    VALUES(p_actor,target,(prepared#>>'{invoice,id}')::uuid,p_command->>'proof') RETURNING id INTO document_id;
    result:=jsonb_build_object('id',target,'decisionId',document_id,'replayed',false);
  END IF;
  INSERT INTO private.purchase_payment_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),result);
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.list_purchase_payment_attention(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR cardinality(p_accounts)>50 THEN
    RAISE EXCEPTION 'Invalid account scope' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH recent AS MATERIALIZED (
      SELECT d.id,d.commitment_id,d.recorded_at
      FROM private.purchase_payment_documents d
      JOIN public.emails e ON e.user_id=actor AND e.id=d.email_id
      WHERE d.user_id=actor AND d.kind='invoice'
        AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents n WHERE n.user_id=actor
          AND n.commitment_id=d.commitment_id AND n.replaces=d.number)
        AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
      ORDER BY d.recorded_at DESC,d.id DESC LIMIT 12
    ), visible AS MATERIALIZED (
      SELECT r.id,r.recorded_at,private.purchase_installment_snapshot(actor,r.commitment_id,r.id,
        CASE WHEN cardinality(p_accounts)=0 THEN '{}'::jsonb ELSE jsonb_build_object('accounts',p_accounts) END) AS item
      FROM recent r
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',item->>'id','invoiceId',id,'reference',item->>'reference',
      'status',item->>'status','invoice',item#>>'{invoice,number}') ORDER BY recorded_at DESC,id DESC),'[]'::jsonb)
    FROM (SELECT * FROM visible WHERE item->>'status' IN ('blocked','ready','missing_price')
      ORDER BY recorded_at DESC,id DESC LIMIT 4) selected
  );
END;
$$;

COMMIT;
