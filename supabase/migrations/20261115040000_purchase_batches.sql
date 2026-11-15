BEGIN;

CREATE TABLE private.purchase_batch_approvers (
  preparer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY(preparer_id,approver_id),
  CHECK (preparer_id<>approver_id)
);

CREATE TABLE private.purchase_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  preparer_label text NOT NULL,
  approver_label text NOT NULL,
  line_count smallint NOT NULL CHECK (line_count BETWEEN 1 AND 8),
  stage text NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending','approved','closed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (preparer_id<>approver_id)
);
CREATE INDEX purchase_batches_preparer ON private.purchase_batches(preparer_id,created_at DESC);
CREATE INDEX purchase_batches_approver ON private.purchase_batches(approver_id,created_at DESC);

CREATE TABLE private.purchase_batch_lines (
  batch_id uuid NOT NULL REFERENCES private.purchase_batches(id) ON DELETE CASCADE,
  handoff_id uuid NOT NULL REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  reference text NOT NULL,
  invoice text NOT NULL,
  deadline date NOT NULL,
  filename text NOT NULL,
  attachment_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
  baseline_paid bigint NOT NULL,
  proof text NOT NULL,
  reserved boolean NOT NULL DEFAULT true,
  PRIMARY KEY(batch_id,handoff_id),
  FOREIGN KEY(owner_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX purchase_batch_reserved ON private.purchase_batch_lines(owner_id,commitment_id,installment_id) WHERE reserved;

CREATE TABLE private.purchase_batch_entries (
  batch_id uuid NOT NULL,
  handoff_id uuid NOT NULL,
  settlement_id uuid PRIMARY KEY REFERENCES private.purchase_settlements(id) ON DELETE CASCADE,
  FOREIGN KEY(batch_id,handoff_id) REFERENCES private.purchase_batch_lines(batch_id,handoff_id) ON DELETE CASCADE
);
CREATE INDEX purchase_batch_entries_line ON private.purchase_batch_entries(batch_id,handoff_id);

CREATE TABLE private.purchase_batch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES private.purchase_batches(id) ON DELETE CASCADE,
  actor_label text NOT NULL,
  action text NOT NULL CHECK (action IN ('submit','approve','cancel','close')),
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX purchase_batch_events_batch ON private.purchase_batch_events(batch_id,at);

CREATE TABLE private.purchase_batch_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  hash bytea NOT NULL,
  receipt jsonb NOT NULL,
  PRIMARY KEY(actor_id,request_key)
);

ALTER TABLE private.purchase_batch_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_batch_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_batch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.purchase_batch_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_batch_approvers,private.purchase_batches,private.purchase_batch_lines,
  private.purchase_batch_entries,private.purchase_batch_events,private.purchase_batch_requests FROM PUBLIC,anon,authenticated,service_role;

-- The settlement summary is the authority for outstanding amounts. Evidence and
-- movements are frozen in the proposal even if a payment and a return net to zero.
CREATE FUNCTION private.purchase_batch_candidate(p_actor uuid,p_handoff uuid,p_batch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  h private.purchase_handoffs;
  d private.purchase_payment_documents;
  balance jsonb;
BEGIN
  SELECT * INTO h FROM private.purchase_handoffs WHERE id=p_handoff AND reviewer_id=p_actor AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Hồ sơ không thuộc quyền lập đợt.' USING ERRCODE='PT404'; END IF;
  SELECT * INTO STRICT d FROM private.purchase_payment_documents
    WHERE id=h.invoice_id AND user_id=h.owner_id AND commitment_id=h.commitment_id;
  balance:=private.purchase_settlement_summary(p_actor,h.owner_id,h.commitment_id,h.invoice_id);
  IF COALESCE(balance->>'status','') NOT IN ('waiting','partial','reopened') OR d.lines#>>'{0,paymentDue}' IS NULL
    OR EXISTS (SELECT 1 FROM private.purchase_due_exceptions x WHERE x.owner_id=d.user_id AND x.commitment_id=d.commitment_id
      AND x.installment_id=d.installment_id AND x.stage<>'closed')
  THEN RAISE EXCEPTION 'Hóa đơn thiếu hạn, đã khép hoặc đang tạm giữ. Hãy xem lại bảng công nợ.' USING ERRCODE='PT432'; END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_batch_lines l WHERE l.owner_id=d.user_id AND l.commitment_id=d.commitment_id
    AND l.installment_id=d.installment_id AND l.reserved AND l.batch_id IS DISTINCT FROM p_batch)
  THEN RAISE EXCEPTION 'Hóa đơn đã được giữ trong một đợt thanh toán khác.' USING ERRCODE='PT432'; END IF;
  RETURN jsonb_build_object('handoffId',h.id,'reference',h.reference,'invoice',h.invoice_number,
    'deadline',d.lines#>>'{0,paymentDue}','filename',d.filename,'amount',balance->'remaining','baselinePaid',balance->'paid',
    'attachmentId',d.attachment_id,
    'proof',encode(sha256(convert_to(jsonb_build_array(d.id,d.digest,d.binding,h.proof,balance->'decisionId',
      (SELECT c.version FROM private.commitments c WHERE c.user_id=d.user_id AND c.id=d.commitment_id),
      balance->'remaining',balance->'paid',jsonb_path_query_array(balance,'$.entries[*].id'))::text,'UTF8')),'hex'));
END;
$$;

CREATE FUNCTION public.preview_purchase_batch(p_targets uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  rows jsonb:='[]';
  target uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(cardinality(p_targets),0) NOT BETWEEN 1 AND 8
    OR (SELECT count(DISTINCT id) FROM unnest(p_targets) id)<>cardinality(p_targets)
  THEN RAISE EXCEPTION 'Chọn từ 1 đến 8 hóa đơn khác nhau.' USING ERRCODE='PT431'; END IF;
  FOREACH target IN ARRAY p_targets LOOP
    rows:=rows || jsonb_build_array(private.purchase_batch_candidate(actor,target));
  END LOOP;
  IF (SELECT sum((line->>'amount')::bigint) FROM jsonb_array_elements(rows) line)>9007199254740991 THEN
    RAISE EXCEPTION 'Tổng đề nghị vượt giới hạn. Hãy chia thành các đợt nhỏ hơn.' USING ERRCODE='PT431';
  END IF;
  RETURN jsonb_build_object('lines',rows,'approvers',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',u.id,'label',u.email) ORDER BY u.email)
    FROM private.purchase_batch_approvers a JOIN auth.users u ON u.id=a.approver_id AND u.email_confirmed_at IS NOT NULL
    WHERE a.preparer_id=actor AND NOT EXISTS (
      SELECT 1 FROM private.purchase_handoffs h WHERE h.id=ANY(p_targets) AND h.owner_id=u.id
    )
  ),'[]'));
END;
$$;

CREATE FUNCTION private.purchase_batch_receipt(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE prior private.purchase_batch_requests;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM private.purchase_batch_requests WHERE actor_id=p_actor AND request_key=p_key;
  IF NOT FOUND THEN RETURN '{"replayed":false}'; END IF;
  IF prior.hash IS DISTINCT FROM sha256(convert_to(p_command::text,'UTF8')) THEN
    RAISE EXCEPTION 'Mã yêu cầu đã dùng cho thao tác khác.' USING ERRCODE='PT432';
  END IF;
  RETURN prior.receipt || '{"replayed":true}';
END;
$$;

CREATE FUNCTION public.read_purchase_batch_receipt(p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.purchase_batch_receipt(auth.uid(),p_key,p_command)
$$;

CREATE FUNCTION private.lock_purchase_batch_scope(p_targets uuid[])
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item record;
BEGIN
  FOR item IN SELECT DISTINCT h.owner_id,h.commitment_id,h.reference
    FROM private.purchase_handoffs h WHERE h.id=ANY(p_targets) ORDER BY h.owner_id,h.reference,h.commitment_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || item.owner_id || ':' || item.reference,0));
    PERFORM id FROM private.commitments WHERE user_id=item.owner_id AND id=item.commitment_id FOR UPDATE;
  END LOOP;
  PERFORM e.id FROM public.emails e JOIN private.purchase_payment_documents d ON d.email_id=e.id AND d.user_id=e.user_id
  JOIN private.purchase_handoffs h ON h.invoice_id=d.id AND h.owner_id=d.user_id AND h.commitment_id=d.commitment_id
  WHERE h.id=ANY(p_targets) ORDER BY e.id FOR SHARE OF e;
  PERFORM f.id FROM public.attachments f JOIN private.purchase_payment_documents d ON d.attachment_id=f.id AND d.email_id=f.email_id
  JOIN private.purchase_handoffs h ON h.invoice_id=d.id AND h.owner_id=d.user_id AND h.commitment_id=d.commitment_id
  WHERE h.id=ANY(p_targets) ORDER BY f.id FOR SHARE OF f;
END;
$$;

CREATE FUNCTION public.confirm_purchase_batch(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  operation text:=p_command->>'action';
  saved jsonb;
  batch private.purchase_batches;
  maker text;
  approver text;
  targets uuid[];
  proposal jsonb;
  current_line jsonb;
  target uuid;
  requested_approver uuid:=(p_command->>'approverId')::uuid;
  target_batch uuid:=(p_command->>'id')::uuid;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_command IS NULL OR octet_length(p_command::text)>4096
    OR COALESCE(operation,'') NOT IN ('submit','approve','cancel')
  THEN RAISE EXCEPTION 'Invalid payment batch command' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-batch:' || p_actor || ':' || p_key,0));
  saved:=private.purchase_batch_receipt(p_actor,p_key,p_command);
  IF saved->>'replayed'='true' THEN RETURN saved; END IF;

  IF operation='submit' THEN
    SELECT array_agg((line->>'handoffId')::uuid) INTO targets FROM jsonb_array_elements(p_command->'lines') line;
    IF COALESCE(cardinality(targets),0) NOT BETWEEN 1 AND 8
      OR (SELECT count(DISTINCT id) FROM unnest(targets) id)<>cardinality(targets)
    THEN RAISE EXCEPTION 'Chọn từ 1 đến 8 hóa đơn khác nhau.' USING ERRCODE='PT431'; END IF;
    IF (SELECT count(*) FROM private.purchase_handoffs h WHERE h.id=ANY(targets) AND h.reviewer_id=p_actor)<>cardinality(targets)
    THEN RAISE EXCEPTION 'Hồ sơ không thuộc quyền lập đợt.' USING ERRCODE='PT404'; END IF;
    SELECT u.email INTO approver FROM private.purchase_batch_approvers a
    JOIN auth.users u ON u.id=a.approver_id AND u.email_confirmed_at IS NOT NULL
    WHERE a.preparer_id=p_actor AND a.approver_id=requested_approver FOR SHARE OF a;
    IF NOT FOUND OR EXISTS (
      SELECT 1 FROM private.purchase_handoffs h WHERE h.id=ANY(targets) AND h.owner_id=requested_approver
    ) THEN RAISE EXCEPTION 'Chọn người duyệt được cấp quyền và độc lập với hồ sơ.' USING ERRCODE='PT403'; END IF;

    PERFORM private.lock_purchase_batch_scope(targets);
    SELECT u.email INTO STRICT maker FROM auth.users u WHERE u.id=p_actor;
    INSERT INTO private.purchase_batches(preparer_id,approver_id,preparer_label,approver_label,line_count)
    VALUES(p_actor,requested_approver,maker,approver,cardinality(targets)) RETURNING id INTO target_batch;
    FOR proposal IN SELECT value FROM jsonb_array_elements(p_command->'lines') LOOP
      target:=(proposal->>'handoffId')::uuid;
      current_line:=private.purchase_batch_candidate(p_actor,target);
      IF current_line->>'proof' IS DISTINCT FROM proposal->>'proof' THEN
        RAISE EXCEPTION 'Số dư hoặc chứng từ đã đổi. Hãy xem lại đề nghị.' USING ERRCODE='PT432';
      END IF;
      INSERT INTO private.purchase_batch_lines(batch_id,handoff_id,owner_id,commitment_id,installment_id,
        reference,invoice,deadline,filename,attachment_id,amount,baseline_paid,proof)
      SELECT target_batch,h.id,h.owner_id,h.commitment_id,d.installment_id,h.reference,h.invoice_number,
        (current_line->>'deadline')::date,d.filename,d.attachment_id,(current_line->>'amount')::bigint,
        (current_line->>'baselinePaid')::bigint,current_line->>'proof'
      FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
        ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
      WHERE h.id=target AND h.reviewer_id=p_actor;
    END LOOP;
    IF (SELECT sum(l.amount) FROM private.purchase_batch_lines l WHERE l.batch_id=target_batch)>9007199254740991 THEN
      RAISE EXCEPTION 'Tổng đề nghị vượt giới hạn. Hãy chia thành các đợt nhỏ hơn.' USING ERRCODE='PT431';
    END IF;
  ELSE
    SELECT b.* INTO batch FROM private.purchase_batches b WHERE b.id=target_batch
      AND p_actor IN (b.preparer_id,b.approver_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đợt thanh toán.' USING ERRCODE='PT404'; END IF;
    IF (operation='approve' AND p_actor IS DISTINCT FROM batch.approver_id)
      OR (operation='cancel' AND p_actor<>batch.preparer_id)
    THEN RAISE EXCEPTION 'Bạn không có quyền xác nhận thao tác này.' USING ERRCODE='PT403'; END IF;
    SELECT array_agg(l.handoff_id) INTO targets FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id;
    PERFORM private.lock_purchase_batch_scope(targets);
    SELECT b.* INTO STRICT batch FROM private.purchase_batches b WHERE b.id=target_batch FOR UPDATE;
    IF operation='approve' THEN
      IF batch.stage<>'pending' THEN RAISE EXCEPTION 'Đề nghị không còn chờ duyệt.' USING ERRCODE='PT432'; END IF;
      PERFORM 1 FROM private.purchase_batch_approvers a JOIN auth.users u ON u.id=a.approver_id AND u.email_confirmed_at IS NOT NULL
      WHERE a.preparer_id=batch.preparer_id AND a.approver_id=p_actor FOR SHARE OF a;
      IF NOT FOUND THEN RAISE EXCEPTION 'Quyền duyệt đã thay đổi.' USING ERRCODE='PT403'; END IF;
      IF COALESCE(cardinality(targets),0)<>batch.line_count THEN
        RAISE EXCEPTION 'Phạm vi chứng từ đã đổi. Hãy lập lại đề nghị.' USING ERRCODE='PT432';
      END IF;
      FOREACH target IN ARRAY targets LOOP
        current_line:=private.purchase_batch_candidate(batch.preparer_id,target,batch.id);
        IF current_line->>'proof' IS DISTINCT FROM
          (SELECT l.proof FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id AND l.handoff_id=target)
        THEN RAISE EXCEPTION 'Số dư hoặc chứng từ đã đổi. Hãy lập lại đề nghị.' USING ERRCODE='PT432'; END IF;
      END LOOP;
      UPDATE private.purchase_batches SET stage='approved' WHERE id=batch.id;
      maker:=batch.approver_label;
    ELSE
      IF batch.stage NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Đợt đã kết thúc.' USING ERRCODE='PT432'; END IF;
      UPDATE private.purchase_batches SET stage='cancelled' WHERE id=batch.id;
      UPDATE private.purchase_batch_lines l SET reserved=false WHERE l.batch_id=batch.id;
      maker:=batch.preparer_label;
    END IF;
  END IF;

  INSERT INTO private.purchase_batch_events(batch_id,actor_label,action)
  VALUES(target_batch,maker,operation);
  saved:=jsonb_build_object('id',target_batch,'action',operation,'replayed',false);
  INSERT INTO private.purchase_batch_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),saved);
  RETURN saved;
END;
$$;

CREATE FUNCTION private.purchase_batch_visible(p_actor uuid,p_id uuid)
RETURNS SETOF private.purchase_batches LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT b.* FROM private.purchase_batches b WHERE (p_id IS NULL OR b.id=p_id)
    AND (b.preparer_id=p_actor OR (b.approver_id=p_actor AND EXISTS (
      SELECT 1 FROM private.purchase_batch_approvers a WHERE a.preparer_id=b.preparer_id AND a.approver_id=p_actor
    )))
$$;

CREATE FUNCTION private.purchase_batch_net(p_batch uuid,p_handoff uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT COALESCE(sum(CASE WHEN s.reversal_of IS NULL THEN s.amount ELSE -s.amount END),0)
  FROM private.purchase_batch_entries e JOIN private.purchase_settlements s ON s.id=e.settlement_id
  WHERE e.batch_id=p_batch AND e.handoff_id=p_handoff
$$;

CREATE FUNCTION private.purchase_batch_has_return(p_batch uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM private.purchase_batch_entries e JOIN private.purchase_settlements s ON s.id=e.settlement_id
    WHERE e.batch_id=p_batch AND s.reversal_of IS NOT NULL)
$$;

CREATE FUNCTION private.purchase_batch_approval_day(p_batch uuid)
RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT (e.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  FROM private.purchase_batch_events e WHERE e.batch_id=p_batch AND e.action='approve'
  ORDER BY e.at DESC,e.id DESC LIMIT 1
$$;

CREATE FUNCTION private.purchase_batch_line_current(p_maker uuid,p_line private.purchase_batch_lines)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  RETURN (private.purchase_batch_candidate(p_maker,p_line.handoff_id,p_line.batch_id)->>'proof') IS NOT DISTINCT FROM p_line.proof;
EXCEPTION WHEN SQLSTATE 'PT404' OR SQLSTATE 'PT432' THEN
  RETURN false;
END;
$$;

CREATE FUNCTION private.purchase_batch_view(p_actor uuid,p_batch private.purchase_batches)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',p_batch.id,'at',p_batch.created_at,'preparer',p_batch.preparer_label,
    'approver',p_batch.approver_label,'role',CASE WHEN p_actor=p_batch.preparer_id THEN 'preparer' ELSE 'approver' END,
    'stage',p_batch.stage,
    'stale',(p_batch.stage IN ('pending','approved') AND
        (SELECT count(*) FROM private.purchase_batch_lines l WHERE l.batch_id=p_batch.id)<>p_batch.line_count)
      OR (p_batch.stage='pending' AND (
        NOT EXISTS (SELECT 1 FROM private.purchase_batch_approvers a WHERE a.preparer_id=p_batch.preparer_id AND a.approver_id=p_batch.approver_id)
        OR EXISTS (SELECT 1 FROM private.purchase_batch_lines l WHERE l.batch_id=p_batch.id
          AND NOT private.purchase_batch_line_current(p_batch.preparer_id,l))
      )),
    'hasReturn',private.purchase_batch_has_return(p_batch.id))
$$;

CREATE FUNCTION public.list_purchase_batches()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(private.purchase_batch_view(auth.uid(),b) ORDER BY b.created_at DESC,b.id DESC),'[]'::jsonb)
  FROM (SELECT * FROM private.purchase_batch_visible(auth.uid(),NULL) ORDER BY created_at DESC,id DESC LIMIT 50) b
$$;

CREATE FUNCTION public.read_purchase_batch(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
DECLARE batch private.purchase_batches;
BEGIN
  SELECT * INTO batch FROM private.purchase_batch_visible(actor,p_id);
  IF NOT FOUND OR p_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đợt thanh toán.' USING ERRCODE='PT404'; END IF;
  RETURN private.purchase_batch_view(actor,batch) || jsonb_build_object(
    'lines',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('handoffId',l.handoff_id,'reference',l.reference,'invoice',l.invoice,
        'deadline',l.deadline,'amount',l.amount,'filename',l.filename,'paid',private.purchase_batch_net(l.batch_id,l.handoff_id),
        'entries',COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id',s.id,'reference',s.transfer,'date',s.paid_on,
            'kind',CASE WHEN s.reversal_of IS NULL THEN 'payment' ELSE 'return' END,'amount',s.amount,
            'emailId',CASE WHEN s.reviewer_id=actor AND e.id IS NOT NULL AND f.id IS NOT NULL
                AND private.purchase_csv_binding(e,f)=s.source_binding THEN s.source_email_id END)
            ORDER BY s.recorded_at,s.id)
          FROM private.purchase_batch_entries r JOIN private.purchase_settlements s ON s.id=r.settlement_id
          LEFT JOIN public.emails e ON e.id=s.source_email_id AND e.user_id=actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
          LEFT JOIN public.attachments f ON f.id=s.source_attachment_id AND f.email_id=e.id
          WHERE r.batch_id=l.batch_id AND r.handoff_id=l.handoff_id
        ),'[]'::jsonb)
      ) ORDER BY l.deadline,l.reference,l.invoice) FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id
    ),'[]'::jsonb),
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'actor',e.actor_label,'action',e.action,'at',e.at)
      ORDER BY e.at,e.id) FROM private.purchase_batch_events e WHERE e.batch_id=batch.id),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.resolve_purchase_batch_files(p_actor uuid,p_id uuid,p_handoff uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE batch private.purchase_batches;
DECLARE result jsonb;
DECLARE total integer;
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đợt thanh toán.' USING ERRCODE='PT404'; END IF;
  SELECT * INTO batch FROM private.purchase_batch_visible(p_actor,p_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đợt thanh toán.' USING ERRCODE='PT404'; END IF;
  IF p_handoff IS NULL THEN
    IF p_actor IS DISTINCT FROM batch.approver_id THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt đợt.' USING ERRCODE='PT403';
    END IF;
    IF batch.stage<>'pending' OR (private.purchase_batch_view(p_actor,batch)->>'stale')::boolean THEN
      RAISE EXCEPTION 'Chứng từ hoặc số dư đã đổi. Hãy lập lại đề nghị.' USING ERRCODE='PT432';
    END IF;
  END IF;
  SELECT count(*),jsonb_agg(jsonb_build_object('ownerId',d.user_id,'emailId',d.email_id,
    'attachmentId',d.attachment_id,'digest',d.digest,'filename',d.filename))
  INTO total,result
  FROM private.purchase_batch_lines l
  JOIN private.purchase_handoffs h ON h.id=l.handoff_id AND h.owner_id=l.owner_id AND h.commitment_id=l.commitment_id
  JOIN private.purchase_payment_documents d
    ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
  WHERE l.batch_id=batch.id AND (p_handoff IS NULL OR l.handoff_id=p_handoff)
    AND d.attachment_id=l.attachment_id AND private.purchase_payment_document(l.owner_id,d.id) IS NOT NULL;
  IF total=0 OR (p_handoff IS NULL AND total<>(SELECT count(*) FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id))
  THEN RAISE EXCEPTION 'Chứng từ không còn ở nguồn đã duyệt.' USING ERRCODE='PT432'; END IF;
  RETURN result;
END;
$$;

-- Existing preview/confirmation both use this function. Reserving an installment
-- holds its payments before approval and freezes the exact approved handoff.
ALTER FUNCTION private.prepare_purchase_settlement(uuid,uuid,uuid,text) RENAME TO prepare_purchase_settlement_before_batch;
CREATE FUNCTION private.prepare_purchase_settlement(p_actor uuid,p_email uuid,p_file uuid,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  prepared jsonb:=private.prepare_purchase_settlement_before_batch(p_actor,p_email,p_file,p_text);
  reservation private.purchase_batch_lines;
  batch private.purchase_batches;
  net bigint;
BEGIN
  IF prepared->>'kind'<>'payment' THEN RETURN prepared; END IF;
  SELECT l.* INTO reservation FROM private.purchase_batch_lines l
  JOIN private.purchase_handoffs h ON h.owner_id=l.owner_id AND h.commitment_id=l.commitment_id
  JOIN private.purchase_payment_documents d ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
  WHERE h.id=(prepared->>'handoffId')::uuid AND h.reviewer_id=p_actor AND d.installment_id=l.installment_id AND l.reserved;
  IF NOT FOUND THEN RETURN prepared; END IF;
  SELECT b.* INTO STRICT batch FROM private.purchase_batches b WHERE b.id=reservation.batch_id;
  net:=private.purchase_batch_net(batch.id,reservation.handoff_id);
  IF batch.stage<>'approved' THEN
    RAISE EXCEPTION 'Khoản này đang chờ duyệt đợt thanh toán.' USING ERRCODE='PT432';
  END IF;
  IF ((prepared->>'paidOn')::date>=private.purchase_batch_approval_day(batch.id)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Ngày chuyển khoản có trước ngày duyệt đợt. Cần đối soát chứng từ cũ trước khi lập lại đề nghị.' USING ERRCODE='PT432';
  END IF;
  IF batch.preparer_id<>p_actor OR reservation.handoff_id IS DISTINCT FROM (prepared->>'handoffId')::uuid
    OR private.purchase_batch_has_return(batch.id)
    OR (SELECT count(*) FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id)<>batch.line_count
    OR (prepared->>'paid')::bigint<>reservation.baseline_paid+net
    OR (prepared->>'remaining')::bigint<>reservation.amount-net
    OR (prepared->>'amount')::bigint>reservation.amount-net
  THEN RAISE EXCEPTION 'Chứng từ hoặc số dư đã đổi so với đợt đã duyệt. Hãy đối soát lại.' USING ERRCODE='PT432'; END IF;
  RETURN prepared || jsonb_build_object('command',(prepared->'command') || jsonb_build_object('batchId',batch.id));
END;
$$;

CREATE FUNCTION private.link_purchase_batch_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE linked private.purchase_batch_lines;
DECLARE original private.purchase_batch_entries;
DECLARE batch private.purchase_batches;
BEGIN
  IF NEW.reversal_of IS NOT NULL THEN
    SELECT * INTO original FROM private.purchase_batch_entries WHERE settlement_id=NEW.reversal_of;
    IF FOUND THEN
      PERFORM b.id FROM private.purchase_batches b WHERE b.id=original.batch_id FOR UPDATE;
      INSERT INTO private.purchase_batch_entries VALUES(original.batch_id,original.handoff_id,NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  SELECT l.* INTO linked FROM private.purchase_batch_lines l WHERE l.owner_id=NEW.owner_id
    AND l.commitment_id=NEW.commitment_id AND l.installment_id=NEW.installment_id AND l.reserved;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO STRICT batch FROM private.purchase_batches WHERE id=linked.batch_id FOR UPDATE;
  IF batch.stage<>'approved' OR linked.handoff_id<>NEW.handoff_id OR batch.preparer_id IS DISTINCT FROM NEW.reviewer_id
    OR (NEW.paid_on>=private.purchase_batch_approval_day(batch.id)) IS NOT TRUE
    OR private.purchase_batch_has_return(batch.id)
    OR (SELECT count(*) FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id)<>batch.line_count
    OR private.purchase_batch_net(batch.id,linked.handoff_id)+NEW.amount>linked.amount
  THEN RAISE EXCEPTION 'Chứng từ không còn khớp với đợt đã duyệt.' USING ERRCODE='PT432'; END IF;
  INSERT INTO private.purchase_batch_entries VALUES(batch.id,linked.handoff_id,NEW.id);
  IF NOT EXISTS (SELECT 1 FROM private.purchase_batch_lines l WHERE l.batch_id=batch.id
    AND private.purchase_batch_net(l.batch_id,l.handoff_id)<>l.amount)
  THEN
    UPDATE private.purchase_batches SET stage='closed' WHERE id=batch.id;
    UPDATE private.purchase_batch_lines SET reserved=false WHERE batch_id=batch.id;
    INSERT INTO private.purchase_batch_events(batch_id,actor_label,action) VALUES(batch.id,NEW.reviewer_label,'close');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER link_purchase_batch_settlement AFTER INSERT ON private.purchase_settlements
FOR EACH ROW EXECUTE FUNCTION private.link_purchase_batch_settlement();

REVOKE ALL ON FUNCTION private.purchase_batch_candidate(uuid,uuid,uuid),private.purchase_batch_receipt(uuid,uuid,jsonb),
  private.lock_purchase_batch_scope(uuid[]),private.purchase_batch_visible(uuid,uuid),private.purchase_batch_net(uuid,uuid),
  private.purchase_batch_has_return(uuid),private.purchase_batch_approval_day(uuid),
  private.purchase_batch_line_current(uuid,private.purchase_batch_lines),
  private.purchase_batch_view(uuid,private.purchase_batches),private.prepare_purchase_settlement(uuid,uuid,uuid,text),
  private.link_purchase_batch_settlement(),public.preview_purchase_batch(uuid[]),public.read_purchase_batch_receipt(uuid,jsonb),
  public.confirm_purchase_batch(uuid,uuid,jsonb),public.list_purchase_batches(),public.read_purchase_batch(uuid),
  public.resolve_purchase_batch_files(uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_purchase_batch(uuid[]),public.read_purchase_batch_receipt(uuid,jsonb),
  public.list_purchase_batches(),public.read_purchase_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_batch(uuid,uuid,jsonb),public.resolve_purchase_batch_files(uuid,uuid,uuid) TO service_role;

COMMIT;
