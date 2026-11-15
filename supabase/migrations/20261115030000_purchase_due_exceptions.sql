BEGIN;

CREATE TABLE private.purchase_due_exceptions (
  origin_handoff uuid PRIMARY KEY REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_label text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('buyer','reviewer','closed')),
  requires_due boolean NOT NULL,
  response_handoff uuid REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (owner_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE,
  CHECK (stage='buyer' OR response_handoff IS NOT NULL)
);
CREATE UNIQUE INDEX purchase_due_exceptions_open
  ON private.purchase_due_exceptions(owner_id,commitment_id,installment_id) WHERE stage<>'closed';
CREATE INDEX purchase_due_exceptions_history
  ON private.purchase_due_exceptions(owner_id,commitment_id,installment_id,created_at DESC);

CREATE TABLE private.purchase_due_exception_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_handoff uuid NOT NULL REFERENCES private.purchase_due_exceptions(origin_handoff) ON DELETE CASCADE,
  handoff_id uuid NOT NULL REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  actor_label text NOT NULL,
  action text NOT NULL CHECK (action IN ('request_evidence','submit','return','approve')),
  reason text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision_id uuid REFERENCES private.purchase_payment_decisions(id) ON DELETE CASCADE,
  CHECK ((action='approve')=(decision_id IS NOT NULL))
);
CREATE INDEX purchase_due_exception_events_timeline ON private.purchase_due_exception_events(origin_handoff,recorded_at DESC);
CREATE INDEX purchase_due_exception_events_handoff ON private.purchase_due_exception_events(handoff_id);
ALTER TABLE private.purchase_due_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_due_exception_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_due_exceptions,private.purchase_due_exception_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.request_purchase_due_evidence(p_actor uuid,p_handoff uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  item private.purchase_handoffs;
  doc private.purchase_payment_documents;
  balance jsonb;
  previous uuid;
  reason text:=btrim(COALESCE(p_reason,''));
BEGIN
  IF length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Ghi rõ chứng từ cần bổ sung.' USING ERRCODE='PT431';
  END IF;
  SELECT h.* INTO item FROM private.purchase_handoffs h WHERE h.id=p_handoff AND h.reviewer_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || item.owner_id || ':' || item.reference,0));
  PERFORM c.id FROM private.commitments c WHERE c.user_id=item.owner_id AND c.id=item.commitment_id FOR UPDATE;
  SELECT h.* INTO STRICT item FROM private.purchase_handoffs h WHERE h.id=p_handoff AND h.reviewer_id=p_actor FOR UPDATE;
  SELECT d.* INTO STRICT doc FROM private.purchase_payment_documents d
    WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id AND d.id=item.invoice_id;
  IF item.status<>'approved' OR EXISTS (
    SELECT 1 FROM private.purchase_payment_documents d JOIN private.purchase_handoffs h
      ON h.owner_id=d.user_id AND h.commitment_id=d.commitment_id AND h.invoice_id=d.id
    WHERE d.user_id=doc.user_id AND d.commitment_id=doc.commitment_id AND d.installment_id=doc.installment_id
      AND d.source_at>doc.source_at AND h.status='approved'
  ) THEN RAISE EXCEPTION 'Chọn hồ sơ đã duyệt hiện hành để yêu cầu bổ sung.' USING ERRCODE='PT432'; END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_due_exceptions x WHERE x.owner_id=doc.user_id
    AND x.commitment_id=doc.commitment_id AND x.installment_id=doc.installment_id AND x.stage<>'closed')
  THEN RAISE EXCEPTION 'Đợt hóa đơn đã có yêu cầu bổ sung đang mở.' USING ERRCODE='PT432'; END IF;

  balance:=private.purchase_settlement_summary(p_actor,item.owner_id,item.commitment_id,item.invoice_id);
  IF balance->>'status'<>'review' AND NOT (
    balance->>'status' IN ('waiting','partial','reopened') AND doc.lines#>>'{0,paymentDue}' IS NULL
  ) THEN RAISE EXCEPTION 'Chỉ yêu cầu bổ sung khi thiếu hạn hoặc cần đối soát lại.' USING ERRCODE='PT432'; END IF;

  INSERT INTO private.purchase_due_exceptions(origin_handoff,owner_id,commitment_id,installment_id,reviewer_id,
    reviewer_label,stage,requires_due)
  VALUES(item.id,item.owner_id,item.commitment_id,doc.installment_id,p_actor,item.reviewer_label,'buyer',
    doc.lines#>>'{0,paymentDue}' IS NULL);
  INSERT INTO private.purchase_due_exception_events(origin_handoff,handoff_id,actor_label,action,reason)
  VALUES(item.id,item.id,item.reviewer_label,'request_evidence',reason);

  FOR previous IN
    UPDATE private.purchase_handoffs h SET status='superseded'
    FROM private.purchase_payment_documents d
    WHERE h.owner_id=item.owner_id AND h.commitment_id=item.commitment_id AND h.status='pending'
      AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id AND d.id=h.invoice_id AND d.installment_id=doc.installment_id
    RETURNING h.id
  LOOP
    INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action)
    VALUES(previous,p_actor,item.reviewer_label,'supersede');
  END LOOP;
END;
$$;

-- Preserve the existing write contracts. The original command takes the case lock
-- and the journal below commits in the very same transaction.
ALTER FUNCTION public.confirm_purchase_handoff(uuid,uuid,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.confirm_purchase_handoff(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  operation text:=p_command->>'action';
  saved jsonb;
  item private.purchase_handoffs;
  doc private.purchase_payment_documents;
  active_case private.purchase_due_exceptions;
  actor text;
  origin_invoice uuid;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_command IS NULL OR octet_length(p_command::text)>4096 THEN
    RAISE EXCEPTION 'Invalid handoff command' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-handoff:' || p_actor || ':' || p_key,0));
  saved:=private.purchase_handoff_receipt(p_actor,p_key,p_command);
  IF saved->>'replayed'='true' THEN RETURN saved; END IF;

  IF operation='request_evidence' THEN
    PERFORM private.request_purchase_due_evidence(p_actor,(p_command->>'handoffId')::uuid,p_command->>'reason');
    saved:=jsonb_build_object('id',p_command->>'handoffId','action',operation,'decisionId',NULL,'replayed',false);
    INSERT INTO private.purchase_handoff_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),saved);
    RETURN saved;
  END IF;

  saved:=private.confirm_purchase_handoff(p_actor,p_key,p_command);
  SELECT h.* INTO STRICT item FROM private.purchase_handoffs h WHERE h.id=(saved->>'id')::uuid
    AND (h.owner_id=p_actor OR h.reviewer_id=p_actor);
  SELECT d.* INTO STRICT doc FROM private.purchase_payment_documents d
    WHERE d.user_id=item.owner_id AND d.commitment_id=item.commitment_id AND d.id=item.invoice_id;
  SELECT x.* INTO active_case FROM private.purchase_due_exceptions x WHERE x.owner_id=item.owner_id
    AND x.commitment_id=item.commitment_id AND x.installment_id=doc.installment_id AND x.stage<>'closed';
  IF NOT FOUND THEN RETURN saved; END IF;

  IF operation='submit' THEN
    IF item.reviewer_id IS DISTINCT FROM active_case.reviewer_id THEN
      RAISE EXCEPTION 'Bàn giao bản bổ sung cho Kế toán đã yêu cầu chứng từ.' USING ERRCODE='PT432';
    END IF;
    SELECT h.invoice_id INTO STRICT origin_invoice FROM private.purchase_handoffs h WHERE h.id=active_case.origin_handoff;
    IF doc.id=origin_invoice OR (active_case.requires_due AND doc.lines#>>'{0,paymentDue}' IS NULL) THEN
      RAISE EXCEPTION 'Cần hóa đơn đính chính cùng đợt và đủ thông tin được yêu cầu.' USING ERRCODE='PT431';
    END IF;
    IF active_case.stage='buyer' AND active_case.response_handoff IS NOT NULL AND EXISTS (
      SELECT 1 FROM private.purchase_handoffs h WHERE h.id=active_case.response_handoff AND h.invoice_id=doc.id
    ) THEN RAISE EXCEPTION 'Hóa đơn đã bị trả lại. Hãy bổ sung bản đính chính mới.' USING ERRCODE='PT432'; END IF;
    UPDATE private.purchase_due_exceptions SET stage='reviewer',response_handoff=item.id
    WHERE origin_handoff=active_case.origin_handoff;
  ELSE
    IF active_case.stage<>'reviewer' OR item.id IS DISTINCT FROM active_case.response_handoff THEN
      RAISE EXCEPTION 'Hồ sơ này không phải bản bổ sung đang chờ duyệt.' USING ERRCODE='PT432';
    END IF;
    IF operation='approve' AND private.purchase_settlement_summary(p_actor,item.owner_id,item.commitment_id,item.invoice_id)->>'status'='review' THEN
      RAISE EXCEPTION 'Bản bổ sung vẫn còn chênh lệch với chứng từ thanh toán. Cần đối soát lại.' USING ERRCODE='PT432';
    END IF;
    UPDATE private.purchase_due_exceptions SET stage=CASE WHEN operation='approve' THEN 'closed' ELSE 'buyer' END
    WHERE origin_handoff=active_case.origin_handoff;
  END IF;
  SELECT u.email INTO STRICT actor FROM auth.users u WHERE u.id=p_actor;
  INSERT INTO private.purchase_due_exception_events(origin_handoff,handoff_id,actor_label,action,reason,decision_id)
  VALUES(active_case.origin_handoff,item.id,actor,operation,NULLIF(btrim(p_command->>'reason'),''),
    (saved->>'decisionId')::uuid);
  RETURN saved;
END;
$$;

CREATE FUNCTION private.purchase_due_exception_detail(p_actor uuid,p_origin uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'stage',x.stage,'reviewer',x.reviewer_label,'requiresDue',x.requires_due,
    'responseHandoff',CASE WHEN x.reviewer_id=p_actor THEN x.response_handoff END,
    'latestInvoiceId',CASE WHEN x.owner_id=p_actor THEN latest.id END,
    'originInvoice',origin.number,'originDeadline',origin.lines#>>'{0,paymentDue}',
    'originTotal',(SELECT sum((line->>'quantity')::bigint*(line->>'price')::bigint) FROM jsonb_array_elements(origin.lines) line),
    'events',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor',e.actor_label,'reason',e.reason,
        'invoice',e.invoice_number,'at',e.recorded_at) ORDER BY e.recorded_at,e.id)
      FROM (
        SELECT event.*,h.invoice_number FROM private.purchase_due_exception_events event
        JOIN private.purchase_handoffs h ON h.id=event.handoff_id
        WHERE event.origin_handoff=x.origin_handoff ORDER BY event.recorded_at DESC,event.id DESC LIMIT 80
      ) e
    ),'[]'::jsonb)
  )
  FROM private.purchase_due_exceptions x
  JOIN private.purchase_handoffs original ON original.id=x.origin_handoff AND original.owner_id=x.owner_id
  JOIN private.purchase_payment_documents origin
    ON origin.id=original.invoice_id AND origin.user_id=x.owner_id AND origin.commitment_id=x.commitment_id
  LEFT JOIN LATERAL (
    SELECT d.id FROM private.purchase_payment_documents d WHERE d.user_id=x.owner_id AND d.commitment_id=x.commitment_id
      AND d.installment_id=x.installment_id ORDER BY d.source_at DESC,d.id DESC LIMIT 1
  ) latest ON x.owner_id=p_actor
  WHERE x.origin_handoff=p_origin AND p_actor IN (x.owner_id,x.reviewer_id)
$$;

ALTER FUNCTION public.read_purchase_handoff(uuid) SET SCHEMA private;
ALTER FUNCTION public.read_purchase_handoff_owner(uuid,uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.read_purchase_handoff(uuid),private.read_purchase_handoff_owner(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_purchase_handoff(p_handoff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result jsonb:=private.read_purchase_handoff(p_handoff);
  actor uuid:=auth.uid();
  origin uuid;
  allowed boolean;
BEGIN
  SELECT x.origin_handoff INTO origin FROM private.purchase_due_exceptions x
  WHERE x.reviewer_id=actor AND (x.origin_handoff=p_handoff OR EXISTS (
    SELECT 1 FROM private.purchase_due_exception_events e WHERE e.origin_handoff=x.origin_handoff AND e.handoff_id=p_handoff
  )) ORDER BY x.created_at DESC LIMIT 1;
  allowed:=result->>'status'='approved' AND private.purchase_due_can_request(actor,p_handoff);
  RETURN result || jsonb_build_object('exception',private.purchase_due_exception_detail(actor,origin),'canRequestEvidence',allowed);
END;
$$;

CREATE FUNCTION public.read_purchase_handoff_owner(p_id uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result jsonb:=private.read_purchase_handoff_owner(p_id,p_invoice);
  actor uuid:=auth.uid();
  origin uuid;
BEGIN
  SELECT x.origin_handoff INTO origin
  FROM private.purchase_due_exceptions x JOIN private.purchase_payment_documents d
    ON d.user_id=x.owner_id AND d.commitment_id=x.commitment_id AND d.installment_id=x.installment_id
  WHERE d.id=p_invoice AND x.owner_id=actor AND x.commitment_id=p_id
  ORDER BY x.created_at DESC LIMIT 1;
  RETURN result || jsonb_build_object('exception',private.purchase_due_exception_detail(actor,origin));
END;
$$;

CREATE FUNCTION private.purchase_due_can_request(p_actor uuid,p_handoff uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
      ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
    CROSS JOIN LATERAL (SELECT private.purchase_settlement_summary(p_actor,h.owner_id,h.commitment_id,d.id) AS balance) s
    WHERE h.id=p_handoff AND h.reviewer_id=p_actor AND h.status='approved'
      AND (s.balance->>'status'='review' OR (
        s.balance->>'status' IN ('waiting','partial','reopened') AND d.lines#>>'{0,paymentDue}' IS NULL))
      AND NOT EXISTS (
        SELECT 1 FROM private.purchase_payment_documents n JOIN private.purchase_handoffs newer
          ON newer.owner_id=n.user_id AND newer.commitment_id=n.commitment_id AND newer.invoice_id=n.id
        WHERE n.user_id=d.user_id AND n.commitment_id=d.commitment_id AND n.installment_id=d.installment_id
          AND n.source_at>d.source_at AND newer.status='approved'
      )
      AND NOT EXISTS (SELECT 1 FROM private.purchase_due_exceptions x WHERE x.owner_id=d.user_id
        AND x.commitment_id=d.commitment_id AND x.installment_id=d.installment_id AND x.stage<>'closed')
  )
$$;

CREATE OR REPLACE FUNCTION public.list_purchase_dues(p_page integer DEFAULT 0)
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
        d.lines,d.email_id,d.attachment_id,x.stage,x.response_handoff
      FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
        ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
      LEFT JOIN private.purchase_due_exceptions x ON x.origin_handoff=h.id AND x.stage<>'closed'
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
      SELECT b.*,CASE WHEN stage IS NOT NULL THEN 'review' ELSE summary->>'status' END AS status,
        CASE WHEN stage IS NULL AND summary->>'status'<>'review' THEN lines#>>'{0,paymentDue}' END AS deadline,
        CASE WHEN stage IS NOT NULL OR summary->>'status'='review' THEN 0
          WHEN summary->>'status'='reopened' THEN 1 ELSE 2 END AS priority
      FROM balances b
      WHERE stage IS NOT NULL OR summary->>'status' IN ('review','reopened','partial','waiting')
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
        'returnEmailId',i.return_email,
        'canRequestEvidence',actor IS NOT DISTINCT FROM i.reviewer_id
          AND i.stage IS NULL AND (i.status='review' OR i.deadline IS NULL),
        'exception',CASE WHEN i.stage IS NOT NULL THEN jsonb_build_object('stage',i.stage,
          'reviewHandoff',CASE WHEN actor=i.reviewer_id AND i.stage='reviewer' THEN i.response_handoff END) END
      ) ORDER BY i.priority,i.deadline NULLS LAST,i.reference,i.invoice_number,i.id) FROM items i),'[]'::jsonb),
      'hasMore',(SELECT count(*)>40 FROM page)
    )
  );
END;
$$;

-- Both preview and the transactional settlement write call this boundary.
-- An open case holds new payments while preserving the return ledger.
ALTER FUNCTION private.prepare_purchase_settlement(uuid,uuid,uuid,text) RENAME TO prepare_purchase_settlement_before_exception;
CREATE FUNCTION private.prepare_purchase_settlement(p_actor uuid,p_email uuid,p_file uuid,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  preview jsonb:=private.prepare_purchase_settlement_before_exception(p_actor,p_email,p_file,p_text);
BEGIN
  IF preview->>'kind'='payment' AND EXISTS (
    SELECT 1 FROM private.purchase_due_exceptions x WHERE x.origin_handoff=(preview->>'handoffId')::uuid
      AND x.reviewer_id=p_actor AND x.stage<>'closed'
  ) THEN RAISE EXCEPTION 'Đang chờ bổ sung hoặc duyệt lại. Khoản thanh toán tạm giữ.' USING ERRCODE='PT432'; END IF;
  RETURN preview;
END;
$$;

REVOKE ALL ON FUNCTION private.request_purchase_due_evidence(uuid,uuid,text),
  private.purchase_due_exception_detail(uuid,uuid),private.purchase_due_can_request(uuid,uuid),
  private.prepare_purchase_settlement(uuid,uuid,uuid,text),public.confirm_purchase_handoff(uuid,uuid,jsonb),
  public.read_purchase_handoff(uuid),public.read_purchase_handoff_owner(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_handoff(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_handoff(uuid),public.read_purchase_handoff_owner(uuid,uuid) TO authenticated;

COMMIT;
