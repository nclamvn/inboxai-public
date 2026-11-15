BEGIN;

CREATE TABLE private.purchase_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES private.purchase_payment_documents(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL,
  decision_id uuid NOT NULL REFERENCES private.purchase_payment_decisions(id) ON DELETE CASCADE,
  handoff_id uuid NOT NULL REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_label text NOT NULL,
  transfer text NOT NULL,
  paid_on date NOT NULL,
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 999999999999999),
  source_email_id uuid NOT NULL,
  source_attachment_id uuid NOT NULL,
  source_filename text NOT NULL,
  source_binding text NOT NULL,
  source_digest text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (owner_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE,
  UNIQUE(owner_id,transfer),
  UNIQUE(reviewer_id,transfer),
  UNIQUE(reviewer_id,source_attachment_id)
);
CREATE INDEX purchase_settlements_installment ON private.purchase_settlements(owner_id,commitment_id,installment_id,recorded_at);
CREATE TABLE private.purchase_settlement_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  command_hash bytea NOT NULL,
  response jsonb NOT NULL,
  PRIMARY KEY(actor_id,request_key)
);
REVOKE ALL ON TABLE private.purchase_settlements,private.purchase_settlement_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.parse_purchase_settlement(p_text text)
RETURNS TABLE(reference text,invoice text,transfer text,paid_on date,amount bigint)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  rows text[];
  fields text[];
  col integer;
BEGIN
  IF p_text IS NULL OR octet_length(p_text)>8192 THEN
    RAISE EXCEPTION 'CSV vượt giới hạn dung lượng.' USING ERRCODE='PT413';
  END IF;
  rows:=string_to_array(rtrim(replace(regexp_replace(p_text,'^' || chr(65279),''),E'\r\n',E'\n'),E'\n'),E'\n');
  IF cardinality(rows) IS DISTINCT FROM 2 OR replace(rows[1],'"','')<>'po,invoice,transfer,paid_on,amount,currency' THEN
    RAISE EXCEPTION 'Chọn CSV một dòng theo mẫu po, invoice, transfer, paid_on, amount, currency.' USING ERRCODE='PT431';
  END IF;
  fields:=string_to_array(rows[2],',');
  IF cardinality(fields)<>6 THEN RAISE EXCEPTION 'Dòng thanh toán phải có đủ 6 cột.' USING ERRCODE='PT431'; END IF;
  FOR col IN 1..6 LOOP
    IF fields[col] ~ '^"[^"]*"$' THEN fields[col]:=substring(fields[col] FROM 2 FOR length(fields[col])-2); END IF;
  END LOOP;
  IF fields[1] !~ '^PO-[0-9]{1,12}$' OR fields[2] !~ '^INV-[0-9]{1,12}$'
    OR fields[3] !~ '^[A-Z0-9][A-Z0-9-]{2,47}$' OR fields[4] !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR fields[5] !~ '^[1-9][0-9]{0,14}$' OR fields[6]<>'VND'
  THEN RAISE EXCEPTION 'Mã PO, mã hóa đơn, mã giao dịch, ngày hoặc số tiền VND không hợp lệ.' USING ERRCODE='PT431'; END IF;
  BEGIN
    paid_on:=fields[4]::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Ngày thanh toán không hợp lệ.' USING ERRCODE='PT431';
  END;
  IF paid_on NOT BETWEEN DATE '2000-01-01' AND (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Ngày thanh toán phải là ngày đã qua hoặc hôm nay.' USING ERRCODE='PT431';
  END IF;
  RETURN QUERY SELECT fields[1],fields[2],fields[3],paid_on,fields[5]::bigint;
END;
$$;

CREATE FUNCTION private.purchase_settlement_summary(p_actor uuid,p_owner uuid,p_order uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  doc private.purchase_payment_documents;
  approval private.purchase_payment_decisions;
  ready boolean;
  due bigint;
  paid bigint;
  entries jsonb;
BEGIN
  SELECT d.* INTO doc FROM private.purchase_payment_documents d
  WHERE d.user_id=p_owner AND d.commitment_id=p_order AND d.id=p_invoice AND d.kind='invoice';
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement unavailable' USING ERRCODE='PT404'; END IF;
  SELECT a.* INTO approval FROM private.purchase_payment_decisions a
  WHERE a.user_id=p_owner AND a.commitment_id=p_order AND a.invoice_id=p_invoice
  ORDER BY a.recorded_at DESC,a.id DESC LIMIT 1;
  ready:=private.purchase_installment_snapshot(p_owner,p_order,p_invoice,'{}')->>'status'='approved'
    AND EXISTS (SELECT 1 FROM private.purchase_handoffs h JOIN private.purchase_handoff_events e ON e.handoff_id=h.id
      WHERE h.owner_id=p_owner AND h.commitment_id=p_order AND h.invoice_id=p_invoice
        AND h.status='approved' AND e.action='approve' AND e.decision_id=approval.id);
  SELECT sum((line->>'quantity')::bigint*(line->>'price')::bigint) INTO due FROM jsonb_array_elements(doc.lines) line;
  SELECT COALESCE(sum(s.amount),0),COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,'reference',s.transfer,'paidOn',s.paid_on,'amount',s.amount,'invoice',d.number,'reviewer',s.reviewer_label,
    'recordedAt',s.recorded_at,'filename',s.source_filename,
    'emailId',CASE WHEN (e.id IS NOT NULL AND b.binding=s.source_binding) THEN s.source_email_id END
  ) ORDER BY s.recorded_at DESC,s.id DESC),'[]'::jsonb) INTO paid,entries
  FROM private.purchase_settlements s
  JOIN private.purchase_payment_documents d ON d.user_id=p_owner AND d.commitment_id=p_order AND d.id=s.invoice_id
  LEFT JOIN public.emails e ON e.id=s.source_email_id AND e.user_id=p_actor AND s.reviewer_id=p_actor
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  LEFT JOIN public.attachments f ON f.id=s.source_attachment_id AND f.email_id=e.id
  LEFT JOIN LATERAL (SELECT private.purchase_csv_binding(e,f) AS binding WHERE f.id IS NOT NULL) b ON TRUE
  WHERE s.owner_id=p_owner AND s.commitment_id=p_order AND s.installment_id=doc.installment_id AND d.source_at<=doc.source_at;
  IF approval.id IS NULL AND paid=0 THEN RETURN '{"status":"unapproved"}'; END IF;
  RETURN jsonb_build_object('status',CASE WHEN ready IS NOT TRUE OR paid>due THEN 'review'
    WHEN paid=due THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'waiting' END,
    'reference',(SELECT c.detection_reference FROM private.commitments c WHERE c.user_id=p_owner AND c.id=p_order),
    'invoice',doc.number,'due',due,'paid',paid,'remaining',greatest(due-paid,0),'excess',greatest(paid-due,0),
    'decisionId',approval.id,'entries',entries);
END;
$$;

CREATE FUNCTION public.read_purchase_settlement(p_handoff uuid,p_order uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  item private.purchase_handoffs;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_handoff IS NOT NULL THEN
    SELECT h.* INTO item FROM private.purchase_handoffs h WHERE h.id=p_handoff AND h.reviewer_id=actor AND h.status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement unavailable' USING ERRCODE='PT404'; END IF;
    RETURN private.purchase_settlement_summary(actor,item.owner_id,item.commitment_id,item.invoice_id);
  END IF;
  RETURN private.purchase_settlement_summary(actor,actor,p_order,p_invoice);
END;
$$;

CREATE FUNCTION private.prepare_purchase_settlement(p_actor uuid,p_email uuid,p_file uuid,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  source record;
  proof record;
  item private.purchase_handoffs;
  approvals integer;
  summary jsonb;
  digest text:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
BEGIN
  SELECT * INTO STRICT source FROM private.purchase_csv_input(p_actor,p_email,p_file);
  SELECT * INTO STRICT proof FROM private.parse_purchase_settlement(p_text);
  SELECT count(*) INTO approvals
  FROM private.purchase_handoffs h JOIN private.purchase_handoff_events e ON e.handoff_id=h.id
  WHERE h.reviewer_id=p_actor AND h.status='approved' AND h.reference=proof.reference AND h.invoice_number=proof.invoice
    AND e.action='approve';
  IF approvals<>1 THEN RAISE EXCEPTION 'Không tìm thấy hóa đơn đã duyệt thuộc quyền của bạn.' USING ERRCODE='PT404'; END IF;
  SELECT h.* INTO STRICT item
  FROM private.purchase_handoffs h JOIN private.purchase_handoff_events e ON e.handoff_id=h.id
  WHERE h.reviewer_id=p_actor AND h.status='approved' AND h.reference=proof.reference AND h.invoice_number=proof.invoice
    AND e.action='approve';
  summary:=private.purchase_settlement_summary(p_actor,item.owner_id,item.commitment_id,item.invoice_id);

  IF summary->>'status'='review' THEN
    RAISE EXCEPTION 'Hóa đơn đã đổi hoặc căn cứ không còn khớp. Cần đối soát bản đang hiệu lực.' USING ERRCODE='PT432';
  END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_settlements s WHERE (s.owner_id=item.owner_id AND s.transfer=proof.transfer)
    OR (s.reviewer_id=p_actor AND (s.transfer=proof.transfer OR s.source_attachment_id=p_file))) THEN
    RAISE EXCEPTION 'Chứng từ hoặc mã giao dịch đã được ghi sổ.' USING ERRCODE='PT432';
  END IF;
  IF proof.amount>(summary->>'remaining')::bigint THEN
    RAISE EXCEPTION 'Số tiền chứng từ vượt số còn phải trả.' USING ERRCODE='PT432';
  END IF;
  IF jsonb_array_length(summary->'entries')>=100 THEN
    RAISE EXCEPTION 'Đợt hóa đơn đã đạt giới hạn 100 chứng từ.' USING ERRCODE='PT431';
  END IF;

  RETURN jsonb_build_object('handoffId',item.id,'reference',proof.reference,'invoice',proof.invoice,
    'transfer',proof.transfer,'paidOn',proof.paid_on,'amount',proof.amount,
    'due',summary->'due','paid',summary->'paid','remaining',summary->'remaining',
    'filename',(source.file).filename,'subject',(source.source).subject,
    'command',jsonb_build_object('handoffId',item.id,'decisionId',summary->'decisionId','emailId',p_email,'attachmentId',p_file,
      'binding',source.binding,'digest',digest,'expectedPaid',summary->'paid'));
END;
$$;

CREATE FUNCTION public.preview_purchase_settlement(p_actor uuid,p_email uuid,p_file uuid,p_text text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.prepare_purchase_settlement(p_actor,p_email,p_file,p_text)
$$;

CREATE FUNCTION private.purchase_settlement_receipt(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE stored private.purchase_settlement_requests;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT r.* INTO stored FROM private.purchase_settlement_requests r WHERE r.actor_id=p_actor AND r.request_key=p_key;
  IF NOT FOUND THEN RETURN '{"replayed":false}'; END IF;
  IF stored.command_hash IS DISTINCT FROM sha256(convert_to(p_command::text,'UTF8')) THEN
    RAISE EXCEPTION 'Mã yêu cầu đã dùng cho chứng từ khác.' USING ERRCODE='PT432';
  END IF;
  RETURN stored.response || '{"replayed":true}';
END;
$$;

CREATE FUNCTION public.read_purchase_settlement_receipt(p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.purchase_settlement_receipt(auth.uid(),p_key,p_command)
$$;

CREATE FUNCTION public.confirm_purchase_settlement(p_actor uuid,p_key uuid,p_command jsonb,p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  item private.purchase_handoffs;
  document private.purchase_payment_documents;
  source_email uuid:=(p_command->>'emailId')::uuid;
  source_file uuid:=(p_command->>'attachmentId')::uuid;
  prepared jsonb;
  transfer_code text;
  entry uuid;
  total bigint;
  remaining bigint;
  result jsonb;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_command IS NULL OR octet_length(p_command::text)>4096
  THEN RAISE EXCEPTION 'Invalid settlement command' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-settlement:' || p_actor || ':' || p_key,0));
  result:=private.purchase_settlement_receipt(p_actor,p_key,p_command);
  IF result->>'replayed'='true' THEN RETURN result; END IF;
  SELECT h.* INTO item FROM private.purchase_handoffs h
  WHERE h.id=(p_command->>'handoffId')::uuid AND h.reviewer_id=p_actor AND h.status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement unavailable' USING ERRCODE='PT404'; END IF;
  SELECT p.transfer INTO STRICT transfer_code FROM private.parse_purchase_settlement(p_text) p;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || item.owner_id || ':' || item.reference,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-transfer:' || item.owner_id || ':' || transfer_code,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-transfer-reviewer:' || p_actor || ':' || transfer_code,0));
  PERFORM e.id FROM public.emails e WHERE
    (e.user_id=p_actor AND e.id=source_email) OR (e.user_id=item.owner_id AND e.id IN (
      SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id
      UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(item.owner_id,item.commitment_id) s
    )) ORDER BY e.id FOR SHARE;
  PERFORM f.id FROM public.attachments f JOIN public.emails e ON e.id=f.email_id
  WHERE (f.id=source_file AND e.id=source_email AND e.user_id=p_actor) OR
    (e.user_id=item.owner_id AND f.id IN (
      SELECT d.attachment_id FROM private.purchase_payment_documents d WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id
      UNION SELECT d.attachment_id FROM private.purchase_csv_documents d WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id
    )) ORDER BY f.id FOR SHARE OF f;
  PERFORM a.id FROM public.source_accounts a WHERE a.id IN (
    SELECT e.source_account_id FROM public.emails e WHERE (e.id=source_email AND e.user_id=p_actor) OR
      (e.user_id=item.owner_id AND e.id IN (
        SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id
        UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(item.owner_id,item.commitment_id) s
      ))
  ) AND a.user_id IN (p_actor,item.owner_id) ORDER BY a.id FOR SHARE;
  prepared:=private.prepare_purchase_settlement(p_actor,source_email,source_file,p_text);
  IF prepared->'command' IS DISTINCT FROM p_command THEN
    RAISE EXCEPTION 'Số dư hoặc chứng từ đã đổi. Hãy xem lại trước khi ghi.' USING ERRCODE='PT432';
  END IF;
  SELECT d.* INTO STRICT document FROM private.purchase_payment_documents d
    WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id AND d.id=item.invoice_id;
  total:=(prepared->>'paid')::bigint+(prepared->>'amount')::bigint;
  remaining:=(prepared->>'due')::bigint-total;
  INSERT INTO private.purchase_settlements(owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
    reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest)
  VALUES(item.owner_id,item.commitment_id,item.invoice_id,document.installment_id,(p_command->>'decisionId')::uuid,item.id,
    p_actor,item.reviewer_label,transfer_code,(prepared->>'paidOn')::date,(prepared->>'amount')::bigint,
    source_email,source_file,prepared->>'filename',p_command->>'binding',p_command->>'digest') RETURNING id INTO entry;
  result:=jsonb_build_object('id',entry,'handoffId',item.id,'paid',total,'remaining',remaining,'replayed',false);
  INSERT INTO private.purchase_settlement_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.parse_purchase_settlement(text),private.purchase_settlement_summary(uuid,uuid,uuid,uuid),
  private.prepare_purchase_settlement(uuid,uuid,uuid,text),private.purchase_settlement_receipt(uuid,uuid,jsonb),
  public.read_purchase_settlement(uuid,uuid,uuid),public.preview_purchase_settlement(uuid,uuid,uuid,text),
  public.read_purchase_settlement_receipt(uuid,jsonb),public.confirm_purchase_settlement(uuid,uuid,jsonb,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_settlement(uuid,uuid,uuid),public.read_purchase_settlement_receipt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_purchase_settlement(uuid,uuid,uuid,text),public.confirm_purchase_settlement(uuid,uuid,jsonb,text) TO service_role;

COMMIT;
