BEGIN;

-- Keep the original receipts and payment history. A return is its own entry.
ALTER TABLE private.purchase_settlements
  ADD COLUMN reversal_of uuid REFERENCES private.purchase_settlements(id) ON DELETE CASCADE,
  ADD CHECK (reversal_of IS NULL OR reversal_of<>id);
CREATE INDEX purchase_settlements_reversal ON private.purchase_settlements(reversal_of) WHERE reversal_of IS NOT NULL;

CREATE FUNCTION private.parse_purchase_settlement_entry(p_text text)
RETURNS TABLE(reference text,invoice text,transfer text,paid_on date,amount bigint,original_transfer text)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  rows text[];
  fields text[];
  original text;
BEGIN
  IF p_text IS NULL OR octet_length(p_text)>8192 THEN
    RAISE EXCEPTION 'CSV vượt giới hạn dung lượng.' USING ERRCODE='PT413';
  END IF;
  rows:=string_to_array(rtrim(replace(regexp_replace(p_text,'^' || chr(65279),''),E'\r\n',E'\n'),E'\n'),E'\n');
  IF replace(rows[1],'"','') IS DISTINCT FROM 'po,invoice,return,original_transfer,returned_on,amount,currency' THEN
    RETURN QUERY SELECT p.reference,p.invoice,p.transfer,p.paid_on,p.amount,NULL::text FROM private.parse_purchase_settlement(p_text) p;
    RETURN;
  END IF;
  fields:=string_to_array(rows[2],',');
  IF cardinality(rows) IS DISTINCT FROM 2 OR cardinality(fields) IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'Chứng từ hoàn phải có một dòng và 7 cột theo mẫu.' USING ERRCODE='PT431';
  END IF;
  original:=regexp_replace(fields[4],'^"([^"]*)"$','\1');
  IF original !~ '^[A-Z0-9][A-Z0-9-]{2,47}$' THEN
    RAISE EXCEPTION 'Chứng từ hoàn cần mã giao dịch gốc hợp lệ.' USING ERRCODE='PT431';
  END IF;
  RETURN QUERY SELECT p.reference,p.invoice,p.transfer,p.paid_on,p.amount,original FROM private.parse_purchase_settlement(
    'po,invoice,transfer,paid_on,amount,currency' || E'\n' || array_to_string(fields[1:3] || fields[5:7],',')) p;
END;
$$;
REVOKE ALL ON FUNCTION private.parse_purchase_settlement_entry(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.purchase_settlement_summary(p_actor uuid,p_owner uuid,p_order uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  doc private.purchase_payment_documents;
  approval private.purchase_payment_decisions;
  ready boolean;
  due bigint;
  paid bigint;
  returned bigint;
  previously_paid boolean;
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
  WITH history AS (
    SELECT s.*,d.number AS invoice_number,
      sum(CASE WHEN s.reversal_of IS NULL THEN s.amount ELSE -s.amount END) OVER (ORDER BY s.recorded_at,s.id) AS running_paid
    FROM private.purchase_settlements s
    JOIN private.purchase_payment_documents d ON d.user_id=p_owner AND d.commitment_id=p_order AND d.id=s.invoice_id
    WHERE s.owner_id=p_owner AND s.commitment_id=p_order AND s.installment_id=doc.installment_id AND d.source_at<=doc.source_at
  )
  SELECT COALESCE(sum(CASE WHEN s.reversal_of IS NULL THEN s.amount ELSE -s.amount END),0),
    COALESCE(bool_or(s.running_paid>=due),false),
    COALESCE(sum(s.amount) FILTER (WHERE s.reversal_of IS NOT NULL),0),COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,'kind',CASE WHEN s.reversal_of IS NULL THEN 'payment' ELSE 'return' END,
    'originalTransfer',original.transfer,'reference',s.transfer,'paidOn',s.paid_on,'amount',s.amount,'invoice',s.invoice_number,'reviewer',s.reviewer_label,
    'recordedAt',s.recorded_at,'filename',s.source_filename,
    'emailId',CASE WHEN (e.id IS NOT NULL AND b.binding=s.source_binding) THEN s.source_email_id END
  ) ORDER BY s.recorded_at DESC,s.id DESC),'[]'::jsonb) INTO paid,previously_paid,returned,entries
  FROM history s
  LEFT JOIN private.purchase_settlements original ON original.id=s.reversal_of AND original.owner_id=s.owner_id
  LEFT JOIN public.emails e ON e.id=s.source_email_id AND e.user_id=p_actor AND s.reviewer_id=p_actor
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  LEFT JOIN public.attachments f ON f.id=s.source_attachment_id AND f.email_id=e.id
  LEFT JOIN LATERAL (SELECT private.purchase_csv_binding(e,f) AS binding WHERE f.id IS NOT NULL) b ON TRUE;
  IF approval.id IS NULL AND entries='[]'::jsonb THEN RETURN '{"status":"unapproved"}'; END IF;
  RETURN jsonb_build_object('status',CASE WHEN ready IS NOT TRUE OR paid>due THEN 'review'
    WHEN paid=due THEN 'paid' WHEN returned>0 AND previously_paid THEN 'reopened'
    WHEN paid>0 OR returned>0 THEN 'partial' ELSE 'waiting' END,
    'ready',COALESCE(ready,false),'returned',returned,
    'reference',(SELECT c.detection_reference FROM private.commitments c WHERE c.user_id=p_owner AND c.id=p_order),
    'invoice',doc.number,'due',due,'paid',paid,'remaining',greatest(due-paid,0),'excess',greatest(paid-due,0),
    'decisionId',approval.id,'entries',entries);
END;
$$;

CREATE OR REPLACE FUNCTION private.prepare_purchase_settlement(p_actor uuid,p_email uuid,p_file uuid,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  source record;
  proof record;
  item private.purchase_handoffs;
  approvals integer;
  summary jsonb;
  original private.purchase_settlements;
  already_returned bigint:=0;
  digest text:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
BEGIN
  SELECT * INTO STRICT source FROM private.purchase_csv_input(p_actor,p_email,p_file);
  SELECT * INTO STRICT proof FROM private.parse_purchase_settlement_entry(p_text);
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

  IF (summary->>'ready')::boolean IS NOT TRUE OR (proof.original_transfer IS NULL AND summary->>'status'='review') THEN
    RAISE EXCEPTION 'Hóa đơn đã đổi hoặc căn cứ không còn khớp. Cần đối soát bản đang hiệu lực.' USING ERRCODE='PT432';
  END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_settlements s WHERE (s.owner_id=item.owner_id AND s.transfer=proof.transfer)
    OR (s.reviewer_id=p_actor AND (s.transfer=proof.transfer OR s.source_attachment_id=p_file))) THEN
    RAISE EXCEPTION 'Chứng từ hoặc mã giao dịch đã được ghi sổ.' USING ERRCODE='PT432';
  END IF;
  IF proof.original_transfer IS NOT NULL THEN
    SELECT s.* INTO original FROM private.purchase_settlements s
    JOIN private.purchase_payment_documents d ON d.user_id=item.owner_id AND d.commitment_id=item.commitment_id AND d.id=item.invoice_id
    WHERE s.owner_id=item.owner_id AND s.commitment_id=item.commitment_id AND s.installment_id=d.installment_id
      AND s.transfer=proof.original_transfer AND s.reversal_of IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mã giao dịch gốc không thuộc đợt hóa đơn này.' USING ERRCODE='PT432';
    END IF;
    IF proof.paid_on<original.paid_on THEN
      RAISE EXCEPTION 'Ngày hoàn tiền phải từ ngày chuyển khoản gốc trở đi.' USING ERRCODE='PT431';
    END IF;
    SELECT COALESCE(sum(s.amount),0) INTO already_returned FROM private.purchase_settlements s
    WHERE s.owner_id=item.owner_id AND s.reversal_of=original.id;
    IF proof.amount>original.amount-already_returned THEN
      RAISE EXCEPTION 'Số tiền hoàn vượt phần còn có thể hoàn của giao dịch gốc.' USING ERRCODE='PT432';
    END IF;
  ELSIF proof.amount>(summary->>'remaining')::bigint THEN
    RAISE EXCEPTION 'Số tiền chứng từ vượt số còn phải trả.' USING ERRCODE='PT432';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(summary->'entries') entry
    WHERE entry->>'kind'=CASE WHEN original.id IS NULL THEN 'payment' ELSE 'return' END)>=100
  THEN RAISE EXCEPTION 'Đợt hóa đơn đã đạt giới hạn chứng từ cho thao tác này.' USING ERRCODE='PT431'; END IF;

  RETURN jsonb_build_object('handoffId',item.id,'reference',proof.reference,'invoice',proof.invoice,
    'kind',CASE WHEN original.id IS NULL THEN 'payment' ELSE 'return' END,
    'originalTransfer',original.transfer,'originalAmount',original.amount,'alreadyReturned',already_returned,
    'remainingAfter',greatest((summary->>'due')::bigint-(summary->>'paid')::bigint
      + (CASE WHEN original.id IS NULL THEN -proof.amount ELSE proof.amount END),0),
    'transfer',proof.transfer,'paidOn',proof.paid_on,'amount',proof.amount,
    'due',summary->'due','paid',summary->'paid','remaining',summary->'remaining',
    'filename',(source.file).filename,'subject',(source.source).subject,
    'command',jsonb_build_object('handoffId',item.id,'decisionId',summary->'decisionId','emailId',p_email,'attachmentId',p_file,
      'binding',source.binding,'digest',digest,'expectedPaid',summary->'paid')
      || CASE WHEN original.id IS NULL THEN '{}'::jsonb ELSE
        jsonb_build_object('reversalOf',original.id,'expectedReturned',already_returned) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_purchase_settlement(p_actor uuid,p_key uuid,p_command jsonb,p_text text)
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
  SELECT p.transfer INTO STRICT transfer_code FROM private.parse_purchase_settlement_entry(p_text) p;
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
  total:=(prepared->>'paid')::bigint
    + (prepared->>'amount')::bigint * CASE WHEN prepared->>'kind'='return' THEN -1 ELSE 1 END;
  remaining:=greatest((prepared->>'due')::bigint-total,0);
  INSERT INTO private.purchase_settlements(owner_id,commitment_id,invoice_id,installment_id,decision_id,handoff_id,
    reviewer_id,reviewer_label,transfer,paid_on,amount,source_email_id,source_attachment_id,source_filename,source_binding,source_digest,reversal_of)
  VALUES(item.owner_id,item.commitment_id,item.invoice_id,document.installment_id,(p_command->>'decisionId')::uuid,item.id,
    p_actor,item.reviewer_label,transfer_code,(prepared->>'paidOn')::date,(prepared->>'amount')::bigint,
    source_email,source_file,prepared->>'filename',p_command->>'binding',p_command->>'digest',(p_command->>'reversalOf')::uuid) RETURNING id INTO entry;
  result:=jsonb_build_object('id',entry,'handoffId',item.id,'paid',total,'remaining',remaining,'replayed',false);
  INSERT INTO private.purchase_settlement_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),result);
  RETURN result;
END;
$$;

COMMIT;
