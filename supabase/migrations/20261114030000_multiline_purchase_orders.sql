BEGIN;

CREATE TABLE private.purchase_order_events (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  version int NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','ship','receive','correct')),
  line_code text,
  number text,
  receipt_number text,
  amount int,
  source_at timestamptz NOT NULL,
  source_fingerprint text NOT NULL,
  PRIMARY KEY (user_id,commitment_id,version),
  FOREIGN KEY (user_id,commitment_id,version)
    REFERENCES private.commitment_revisions(user_id,commitment_id,version) ON DELETE CASCADE
);
CREATE UNIQUE INDEX purchase_order_document_line ON private.purchase_order_events
  (user_id,commitment_id,line_code,number) WHERE number IS NOT NULL;
REVOKE ALL ON TABLE private.purchase_order_events FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION private.commitment_state(jsonb) RENAME TO commitment_single_line_state;

CREATE FUNCTION private.commitment_state(input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  base jsonb := private.commitment_single_line_state(input-'purchaseOrder');
  po jsonb := input->'purchaseOrder';
BEGIN
  IF po IS NULL THEN RETURN base; END IF;
  IF jsonb_typeof(po) IS DISTINCT FROM 'object' OR jsonb_typeof(po->'lines') IS DISTINCT FROM 'array'
    OR jsonb_array_length(po->'lines') NOT BETWEEN 2 AND 6 OR COALESCE(po->>'reference','') !~ '^PO-[0-9]{1,12}$'
    OR input ?| ARRAY['delivery','receiving'] OR NOT (po ? 'warehouse')
  THEN RAISE EXCEPTION 'Invalid purchase order state' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(po->'lines') AS x(line)
    WHERE COALESCE(line->>'code','') !~ '^[A-Z0-9]{1,12}$'
      OR COALESCE(line->>'unit','') NOT IN ('bộ','chiếc','kiện','cuộn','hộp','cái')
      OR COALESCE(line->>'ordered','') !~ '^[1-9][0-9]{0,6}$'
      OR COALESCE(line->>'reported','') !~ '^[0-9]{1,7}$'
      OR COALESCE(line->>'received','') !~ '^[0-9]{1,7}$')
    OR (SELECT count(DISTINCT value->>'code') FROM jsonb_array_elements(po->'lines'))<>jsonb_array_length(po->'lines')
  THEN RAISE EXCEPTION 'Invalid purchase order lines' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(po->'lines') AS x(line)
    WHERE (line->>'reported')::int>(line->>'ordered')::int OR
      (base->>'status'='completed' AND (line->>'ordered' IS DISTINCT FROM line->>'reported' OR line->>'ordered' IS DISTINCT FROM line->>'received')))
  THEN RAISE EXCEPTION 'Purchase order lines are not reconciled' USING ERRCODE='22023'; END IF;
  RETURN base || jsonb_build_object('purchaseOrder',po);
END;
$$;

-- Block generic writes to this state. The purchase order RPC computes it from exact email evidence.
ALTER FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) RENAME TO save_purchase_guarded_commitment;
ALTER FUNCTION public.save_purchase_guarded_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) SET SCHEMA private;
ALTER FUNCTION public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) RENAME TO confirm_single_line_commitment;
ALTER FUNCTION public.confirm_single_line_commitment(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.save_purchase_guarded_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb),
  private.confirm_single_line_commitment(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.guard_purchase_order(p_id uuid,p_state jsonb) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_state ? 'purchaseOrder' OR EXISTS (
    SELECT 1 FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
    WHERE c.user_id=auth.uid() AND c.id=p_id AND r.state ? 'purchaseOrder'
  ) THEN RAISE EXCEPTION 'Use purchase order approval' USING ERRCODE='PT422'; END IF;
END;
$$;

CREATE FUNCTION public.save_commitment(
  p_request_key uuid,p_id uuid,p_version integer,p_reference_key text,p_state jsonb,p_review jsonb,p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.guard_purchase_order(p_id,p_state);
  RETURN private.save_purchase_guarded_commitment(p_request_key,p_id,p_version,p_reference_key,p_state,p_review,p_evidence);
END;
$$;

CREATE FUNCTION public.confirm_commitment_detection(
  p_request_key uuid,p_email_id uuid,p_fingerprint text,p_id uuid,p_version integer,p_reference_key text,p_state jsonb,p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  case_ref text;
BEGIN
  PERFORM private.guard_purchase_order(p_id,p_state);
  IF actor IS NOT NULL AND p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor || ':' || p_email_id,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor || ':' || p_request_key,0));
    SELECT private.commitment_subject_reference(e.subject) INTO case_ref
      FROM public.emails e WHERE e.user_id=actor AND e.id=p_email_id FOR SHARE;
    IF case_ref LIKE 'PO-%' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || case_ref,0));
      IF EXISTS (SELECT 1 FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
        WHERE c.user_id=actor AND c.detection_reference=case_ref AND r.state ? 'purchaseOrder')
      THEN RAISE EXCEPTION 'Use purchase order approval' USING ERRCODE='PT422'; END IF;
    END IF;
  END IF;
  RETURN private.confirm_single_line_commitment(p_request_key,p_email_id,p_fingerprint,p_id,p_version,p_reference_key,p_state,p_evidence);
END;
$$;

REVOKE ALL ON FUNCTION private.guard_purchase_order(uuid,jsonb),private.commitment_state(jsonb),
  public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb),
  public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb),
  public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) TO authenticated;

CREATE FUNCTION private.purchase_order_sources(p_actor uuid,p_id uuid)
RETURNS TABLE(operation text, line_code text, evidence jsonb, version int)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT e.operation,e.line_code,CASE WHEN proof.anchor->>'availability'='available'
    AND e.source_fingerprint IS DISTINCT FROM private.commitment_detection_fingerprint(mail)
    THEN (proof.anchor-'quote') || '{"availability":"changed","quote":null}'::jsonb
    ELSE proof.anchor END,e.version
  FROM private.purchase_order_events e JOIN private.commitment_revisions r USING (user_id,commitment_id,version)
  CROSS JOIN LATERAL (SELECT private.commitment_sources(p_actor,r.anchors)->0 AS anchor) proof
  LEFT JOIN public.emails mail ON mail.id=(proof.anchor->>'emailId')::uuid AND mail.user_id=p_actor
  WHERE e.user_id=p_actor AND e.commitment_id=p_id
  ORDER BY e.version
$$;

CREATE FUNCTION private.purchase_order_mail(p_actor uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  op text := p_command->>'operation';
  source public.emails;
  quote text := p_command->>'quote';
  reference text;
  sender text;
  head private.commitments;
  previous jsonb;
  original_state jsonb;
  po jsonb;
  lines jsonb := '[]';
  line jsonb;
  line_index int;
  due date;
  parts text[];
  piece text;
  matched_line_code text;
  matched_number text;
  receipt text;
  amount int;
  before_amount int;
  event_at timestamptz;
  original jsonb;
  status text;
BEGIN
  SELECT * INTO source FROM public.emails e WHERE e.id=(p_command->>'emailId')::uuid AND e.user_id=p_actor
    AND e.direction='inbound' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase email unavailable' USING ERRCODE='PT404'; END IF;
  reference := private.commitment_subject_reference(source.subject);
  sender := lower(btrim(source.from_address));
  IF NOT COALESCE(reference ~ '^PO-[0-9]{1,12}$',false) OR source.received_at IS NULL
    OR length(COALESCE(source.body_text,''))>8000 OR quote IS NULL OR length(quote)>480
    OR p_command->>'fingerprint' IS DISTINCT FROM private.commitment_detection_fingerprint(source)
    OR NOT EXISTS (SELECT 1 FROM public.source_accounts a WHERE a.id=source.source_account_id AND a.user_id=p_actor AND a.is_active)
    OR NOT COALESCE((
      SELECT count(*) FILTER (WHERE btrim(msg.line)=quote)=1 AND count(*)<=6
        AND (op<>'create' OR count(*)=1)
        AND count(*) FILTER (WHERE lower(split_part(btrim(msg.line),':',1))=lower(split_part(quote,':',1)))=1
      FROM regexp_split_to_table(source.body_text,E'\r?\n') WITH ORDINALITY AS msg(line,pos)
      WHERE btrim(msg.line) ~* '^(đơn mua hàng nhiều dòng|báo giao dòng |phiếu nhập PN-|đính chính DC-)'
        AND msg.pos<COALESCE((
          SELECT min(q.pos) FROM regexp_split_to_table(source.body_text,E'\r?\n') WITH ORDINALITY AS q(line,pos)
          WHERE btrim(q.line) ~* '^(>|--([[:space:]]|$)|-{2,}[[:space:]]*(original message|forwarded message|thư gốc|thư được chuyển tiếp)|begin forwarded message:|from:|từ:|on .+ wrote:|vào .+ đã viết:)'
        ),9223372036854775807)
    ),false)
  THEN RAISE EXCEPTION 'Purchase source changed or ambiguous' USING ERRCODE='PT409'; END IF;

  IF op='create' THEN
    parts := regexp_match(quote,'^đơn mua hàng nhiều dòng, hạn ([0-9]{4}-[0-9]{2}-[0-9]{2}): (.+)$','i');
    IF parts IS NULL OR EXISTS (SELECT 1 FROM private.commitments c WHERE c.user_id=p_actor AND c.detection_reference=reference)
    THEN RAISE EXCEPTION 'Purchase order already exists or is malformed' USING ERRCODE='PT409'; END IF;
    due := parts[1]::date;
    FOREACH piece IN ARRAY string_to_array(rtrim(parts[2],'.!'),' + ') LOOP
      parts := regexp_match(piece,'^([A-Z0-9]{1,12}) ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)$','i');
      IF parts IS NULL OR lines @> jsonb_build_array(jsonb_build_object('code',upper(parts[1])))
      THEN RAISE EXCEPTION 'Missing, duplicate or ambiguous order lines' USING ERRCODE='PT422'; END IF;
      lines := lines || jsonb_build_array(jsonb_build_object('code',upper(parts[1]),'ordered',parts[2]::int,
        'unit',lower(parts[3]),'reported',0,'received',0));
    END LOOP;
    IF jsonb_array_length(lines) NOT BETWEEN 2 AND 6 THEN RAISE EXCEPTION 'Invalid line count' USING ERRCODE='PT422'; END IF;
    po := jsonb_build_object('reference',reference,'lines',lines,'warehouse',NULL);
    previous := jsonb_build_object('title','Đối soát ' || reference,'ownerName',NULL,'ownerEmail',sender,
      'dueOn',to_char(due,'YYYY-MM-DD'),'dueAt',NULL,'status','open');
  ELSE
    SELECT * INTO head FROM private.commitments c WHERE c.user_id=p_actor AND c.detection_reference=reference
      AND (p_command->>'id' IS NULL OR c.id=(p_command->>'id')::uuid);
    IF NOT FOUND OR (SELECT count(*) FROM private.commitments c WHERE c.user_id=p_actor AND c.detection_reference=reference)<>1
    THEN RAISE EXCEPTION 'Purchase order is ambiguous or not yet approved' USING ERRCODE='PT422'; END IF;
    IF p_command->>'version' IS NOT NULL AND head.version<>(p_command->>'version')::int
    THEN RAISE EXCEPTION 'Purchase order version changed' USING ERRCODE='PT409'; END IF;
    SELECT r.state-'review' INTO previous FROM private.commitment_revisions r
      WHERE r.user_id=p_actor AND r.commitment_id=head.id AND r.version=head.version;
    original_state := previous;
    po := previous->'purchaseOrder';
    status := previous->>'status';
    IF po IS NULL OR status='cancelled' OR (status='completed' AND op<>'correct')
      OR (source.received_at >= (SELECT e.source_at FROM private.purchase_order_events e
        WHERE e.user_id=p_actor AND e.commitment_id=head.id AND e.operation='create')) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT409'; END IF;
    IF op='ship' THEN
      IF sender IS DISTINCT FROM previous->>'ownerEmail' OR source.source_account_id IS DISTINCT FROM (
        SELECT e.source_account_id FROM private.commitment_revisions r
        JOIN public.emails e ON e.user_id=r.user_id AND e.id=(r.anchors->0->>'emailId')::uuid
        WHERE r.user_id=p_actor AND r.commitment_id=head.id AND r.version=1)
      THEN RAISE EXCEPTION 'Supplier source mismatch' USING ERRCODE='PT422'; END IF;
      parts := regexp_match(quote,'^báo giao dòng ([A-Z0-9]{1,12}): ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$','i');
      matched_line_code := upper(parts[1]);
      amount := parts[2]::int;
    ELSE
      IF sender IS DISTINCT FROM po#>>'{warehouse,sender}' OR source.source_account_id::text IS DISTINCT FROM po#>>'{warehouse,accountId}'
      THEN RAISE EXCEPTION 'Warehouse source mismatch' USING ERRCODE='PT422'; END IF;
      IF op='receive' THEN
        parts := regexp_match(quote,'^phiếu nhập (PN-[0-9]{1,12}) dòng ([A-Z0-9]{1,12}): kho thực nhận ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$','i');
        matched_number := upper(parts[1]);
        matched_line_code := upper(parts[2]);
        amount := parts[3]::int;
      ELSE
        parts := regexp_match(quote,'^đính chính (DC-[0-9]{1,12}) cho (PN-[0-9]{1,12}) dòng ([A-Z0-9]{1,12}): kho thực nhận (0|[1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$','i');
        matched_number := upper(parts[1]);
        receipt := upper(parts[2]);
        matched_line_code := upper(parts[3]);
        amount := parts[4]::int;
      END IF;
    END IF;

    SELECT x.value,(x.position-1)::int INTO line,line_index FROM jsonb_array_elements(po->'lines') WITH ORDINALITY AS x(value,position)
      WHERE x.value->>'code'=matched_line_code;
    IF line IS NULL OR line->>'unit' IS DISTINCT FROM lower(parts[cardinality(parts)])
    THEN RAISE EXCEPTION 'Purchase line missing, ambiguous or unit different' USING ERRCODE='PT422'; END IF;
    IF matched_number IS NOT NULL AND EXISTS (SELECT 1 FROM private.purchase_order_events e
      WHERE e.user_id=p_actor AND e.commitment_id=head.id AND e.line_code=matched_line_code AND e.number=matched_number)
    THEN RAISE EXCEPTION 'Purchase document already recorded' USING ERRCODE='PT409'; END IF;
    IF op='ship' THEN
      SELECT max(e.source_at) INTO event_at FROM private.purchase_order_events e
        WHERE e.user_id=p_actor AND e.commitment_id=head.id AND e.line_code=matched_line_code AND e.operation='ship';
      IF amount<=(line->>'reported')::int OR amount>(line->>'ordered')::int
        OR (event_at IS NOT NULL AND source.received_at<=event_at)
      THEN RAISE EXCEPTION 'Supplier report is stale or exceeds the order' USING ERRCODE='PT409'; END IF;
      line := jsonb_set(line,'{reported}',to_jsonb(amount));
    ELSE
      IF op='correct' THEN
        SELECT w.evidence INTO original FROM private.purchase_order_events e
        JOIN private.purchase_order_sources(p_actor,head.id) w USING (version)
        WHERE e.user_id=p_actor AND e.commitment_id=head.id AND e.line_code=matched_line_code AND e.number=receipt AND e.operation='receive';
        SELECT e.amount,e.source_at INTO before_amount,event_at FROM private.purchase_order_events e
          WHERE e.user_id=p_actor AND e.commitment_id=head.id AND e.line_code=matched_line_code
            AND (e.number=receipt OR e.receipt_number=receipt) ORDER BY e.version DESC LIMIT 1;
        IF original->>'availability' IS DISTINCT FROM 'available' OR (source.received_at>event_at) IS DISTINCT FROM true
          OR amount=before_amount
        THEN RAISE EXCEPTION 'Original receipt missing or correction superseded' USING ERRCODE='PT409'; END IF;
      ELSE
        before_amount := 0;
      END IF;
      IF (line->>'received')::int - before_amount + amount NOT BETWEEN 0 AND 9999999
      THEN RAISE EXCEPTION 'Receipt total outside range' USING ERRCODE='PT422'; END IF;
      line := jsonb_set(line,'{received}',to_jsonb((line->>'received')::int - before_amount + amount));
    END IF;
    po := jsonb_set(po,ARRAY['lines',line_index::text],line);
    previous := previous || '{"status":"open"}';
  END IF;
  RETURN jsonb_build_object('id',head.id,'version',head.version,'line',matched_line_code,'number',matched_number,'receipt',receipt,
    'amount',amount,'at',source.received_at,'original',original,
    'previous',original_state,'state',previous || jsonb_build_object('purchaseOrder',po),
    'anchor',jsonb_build_object('emailId',source.id,'field','body_text','quote',quote));
END;
$$;

CREATE FUNCTION public.preview_purchase_orders(p_commands jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  item jsonb;
  proposal jsonb;
  result jsonb := '[]';
  failure text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_commands) IS DISTINCT FROM 'array' OR jsonb_array_length(p_commands)>144 OR octet_length(p_commands::text)>524288
  THEN RAISE EXCEPTION 'Invalid purchase order preview scope' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_commands) LOOP
    BEGIN
      IF COALESCE(item->>'operation','') NOT IN ('create','ship','receive','correct')
      THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
      proposal := private.purchase_order_mail(actor,item);
      result := result || jsonb_build_array(proposal || jsonb_build_object('emailId',item->>'emailId','quote',item->>'quote'));
    EXCEPTION WHEN SQLSTATE 'PT404' OR SQLSTATE 'PT409' OR SQLSTATE 'PT422' OR data_exception THEN
      GET STACKED DIAGNOSTICS failure=message_text;
      result := result || jsonb_build_array(jsonb_build_object('emailId',item->>'emailId','quote',item->>'quote','blocked',
        CASE WHEN failure='Purchase line missing, ambiguous or unit different' THEN 'purchase_line'
          WHEN failure='Purchase document already recorded' THEN 'duplicate_receipt'
          ELSE 'uncertain' END));
    END;
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION public.confirm_purchase_order(p_request_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout='5s' AS $$
DECLARE
  actor uuid := auth.uid();
  op text := p_command->>'operation';
  target_id uuid := (p_command->>'id')::uuid;
  expected int := (p_command->>'version')::int;
  head private.commitments;
  source public.emails;
  reference text;
  state jsonb;
  po jsonb;
  anchors jsonb;
  prepared jsonb;
  replay private.commitment_receiving_commands;
  hash bytea;
  result jsonb;
  anchor jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR COALESCE(op,'') NOT IN ('create','ship','receive','correct','configure','close')
    OR octet_length(p_command::text)>4096 OR (op<>'create' AND (target_id IS NULL OR expected IS NULL))
    OR (op='create' AND (target_id IS NOT NULL OR expected IS NOT NULL))
    OR (op IN ('create','ship','receive','correct')) IS DISTINCT FROM (p_command ? 'emailId')
  THEN RAISE EXCEPTION 'Invalid purchase order approval' USING ERRCODE='22023'; END IF;
  IF p_command ? 'emailId' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor || ':' || (p_command->>'emailId'),0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor || ':' || p_request_key,0));
  hash := sha256(convert_to(jsonb_build_array('purchase',p_command)::text,'UTF8'));
  SELECT * INTO replay FROM private.commitment_receiving_commands WHERE user_id=actor AND request_key=p_request_key;
  IF FOUND THEN
    IF replay.command_hash<>hash THEN RAISE EXCEPTION 'Purchase request reused' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('id',replay.commitment_id,'version',replay.version,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Purchase request reused' USING ERRCODE='PT409'; END IF;

  IF p_command ? 'emailId' THEN
    SELECT * INTO source FROM public.emails WHERE user_id=actor AND emails.id=(p_command->>'emailId')::uuid FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase email unavailable' USING ERRCODE='PT404'; END IF;
    reference := private.commitment_subject_reference(source.subject);
  ELSE
    SELECT detection_reference INTO reference FROM private.commitments c WHERE c.user_id=actor AND c.id=target_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || reference,0));
  IF target_id IS NOT NULL THEN
    SELECT * INTO head FROM private.commitments c WHERE c.user_id=actor AND c.id=target_id AND c.detection_reference=reference FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
    IF head.version<>expected THEN RAISE EXCEPTION 'Purchase order version changed' USING ERRCODE='PT409'; END IF;
    SELECT r.state-'review' INTO state FROM private.commitment_revisions r
      WHERE r.user_id=actor AND r.commitment_id=target_id AND r.version=head.version;
    po := state->'purchaseOrder';
    IF po IS NULL THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
    IF (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=reference)<>1
    THEN RAISE EXCEPTION 'Purchase order is ambiguous' USING ERRCODE='PT409'; END IF;
    PERFORM e.id FROM public.emails e WHERE e.user_id=actor AND e.id IN (
      SELECT (w.evidence->>'emailId')::uuid FROM private.purchase_order_sources(actor,head.id) w
    ) ORDER BY e.id FOR SHARE;
    IF EXISTS (SELECT 1 FROM private.purchase_order_sources(actor,head.id) w WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
    THEN RAISE EXCEPTION 'Purchase evidence changed' USING ERRCODE='PT409'; END IF;
  END IF;
  IF op IN ('configure','close') THEN
    IF state->>'status'<>'open' THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT409'; END IF;
    IF op='configure' THEN
      IF po->'warehouse'<>'null'::jsonb OR p_command->>'sender' IS NULL OR p_command->>'sender'=state->>'ownerEmail'
        OR COALESCE(p_command->>'sender','') !~ '^[^[:space:]@]+@[^[:space:]@]+$'
        OR NOT EXISTS (SELECT 1 FROM public.source_accounts a WHERE a.user_id=actor AND a.id=(p_command->>'accountId')::uuid AND a.is_active)
      THEN RAISE EXCEPTION 'Invalid warehouse source' USING ERRCODE='PT422'; END IF;
      state := jsonb_set(state,'{purchaseOrder,warehouse}',jsonb_build_object('accountId',p_command->>'accountId','sender',p_command->>'sender'));
    ELSE
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(po->'lines') l
        WHERE l->>'ordered' IS DISTINCT FROM l->>'received' OR l->>'ordered' IS DISTINCT FROM l->>'reported')
      THEN RAISE EXCEPTION 'Every purchase line must reconcile' USING ERRCODE='PT409'; END IF;
      state := state || '{"status":"completed"}';
    END IF;
    SELECT jsonb_build_array(jsonb_build_object('emailId',w.evidence->>'emailId','field','body_text','quote',w.evidence->>'quote'))
      INTO anchors FROM private.purchase_order_sources(actor,head.id) w ORDER BY w.version DESC LIMIT 1;
  ELSE
    IF target_id IS NOT NULL AND (SELECT count(*) FROM private.purchase_order_events e WHERE e.user_id=actor AND e.commitment_id=target_id)>=120
    THEN RAISE EXCEPTION 'Purchase order evidence limit reached' USING ERRCODE='PT422'; END IF;
    prepared := private.purchase_order_mail(actor,p_command);
    state := prepared->'state';
    anchors := jsonb_build_array(prepared->'anchor');
    anchor := prepared->'original';
    IF anchor IS DISTINCT FROM 'null'::jsonb THEN
      anchors := anchors || jsonb_build_array(jsonb_build_object('emailId',anchor->>'emailId','field','body_text','quote',anchor->>'quote'));
    END IF;
  END IF;
  result := private.save_commitment(p_request_key,target_id,expected,
    CASE WHEN op='create' THEN private.commitment_case_key(source.source_account_id,lower(btrim(source.from_address)),reference) END,
    state,NULL,anchors);
  target_id := (result->>'id')::uuid;
  IF op='create' THEN
    UPDATE private.commitments c SET detection_reference=reference WHERE c.user_id=actor AND c.id=(result->>'id')::uuid;
  END IF;
  IF prepared IS NOT NULL THEN
    INSERT INTO private.purchase_order_events(user_id,commitment_id,version,operation,line_code,number,receipt_number,amount,source_at,source_fingerprint)
      VALUES(actor,target_id,(result->>'version')::int,op,prepared->>'line',prepared->>'number',prepared->>'receipt',
        (prepared->>'amount')::int,(prepared->>'at')::timestamptz,p_command->>'fingerprint');
  END IF;
  INSERT INTO private.commitment_receiving_commands VALUES(actor,target_id,(result->>'version')::int,p_request_key,hash);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_order_sources(uuid,uuid),private.purchase_order_mail(uuid,jsonb),
  public.preview_purchase_orders(jsonb),public.confirm_purchase_order(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_purchase_orders(jsonb),public.confirm_purchase_order(uuid,jsonb) TO authenticated;

ALTER FUNCTION private.commitment_reminder_snapshot(uuid,uuid) RENAME TO single_line_reminder_snapshot;

CREATE FUNCTION private.commitment_reminder_snapshot(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH purchase AS (
    SELECT c.version,r.state,r.state->'purchaseOrder' AS po
    FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
    WHERE c.user_id=p_actor AND c.id=p_id AND r.state ? 'purchaseOrder'
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM purchase) THEN (
    SELECT jsonb_build_object(
      'version',p.version,'accountId',a.id,'fromAddress',a.email_address,
      'fromName',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1)),
      'to',lower(btrim(p.state->>'ownerEmail')),
      'subject',CASE WHEN e.subject ~* '^re:' THEN btrim(left(e.subject,500))
        ELSE 'Re: ' || btrim(left(e.subject,496)) END,
      'text',format(E'Chào anh/chị,\n\nKho còn thiếu hàng cho %s:\n%s\n\nAnh/chị vui lòng xác nhận lịch giao phần còn thiếu.\n\nCảm ơn anh/chị.',
        p.po->>'reference',shortage.contents),
      'source',origin.evidence,
      'sourceFingerprint',private.commitment_detection_fingerprint(e),
      'messageId',CASE WHEN length(e.message_id)<=998 AND e.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN e.message_id END,
      'mailIdentity',jsonb_build_array(e.sync_namespace,e.original_uid,a.auth_type),
      'purchaseEvidence',(SELECT jsonb_agg(w.evidence ORDER BY w.version) FROM private.purchase_order_sources(p_actor,p_id) w)
    )
    FROM purchase p
    CROSS JOIN LATERAL (
      SELECT w.evidence FROM private.purchase_order_sources(p_actor,p_id) w WHERE w.operation IN ('create','ship')
      ORDER BY (w.evidence->>'receivedAt')::timestamptz DESC,w.version DESC LIMIT 1
    ) origin
    JOIN public.emails e ON e.user_id=p_actor AND e.id=(origin.evidence->>'emailId')::uuid
    JOIN public.source_accounts a ON a.user_id=p_actor AND a.id=e.source_account_id AND a.is_active
    CROSS JOIN LATERAL (
      SELECT string_agg(format('Dòng %s thiếu %s %s.', l->>'code',
        (l->>'ordered')::int-(l->>'received')::int,l->>'unit'), E'\n' ORDER BY l->>'code') AS contents
      FROM jsonb_array_elements(p.po->'lines') l
      WHERE (l->>'received')::int<(l->>'ordered')::int AND (l->>'reported')::int>(l->>'received')::int
    ) shortage
    WHERE p.state->>'status'='open' AND shortage.contents IS NOT NULL
      AND private.commitment_responsibility(p.state->>'ownerEmail',private.commitment_owned_addresses(p_actor))='waiting'
      AND e.subject IS NOT NULL AND e.subject !~ '[[:cntrl:]]'
      AND EXISTS (SELECT 1 FROM private.purchase_order_events w WHERE w.user_id=p_actor AND w.commitment_id=p_id
        AND w.operation IN ('receive','correct'))
      AND NOT EXISTS (SELECT 1 FROM private.purchase_order_sources(p_actor,p_id) w
        WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
      AND NOT EXISTS (
        SELECT 1 FROM public.emails newer WHERE newer.user_id=p_actor AND newer.direction='inbound'
          AND NOT newer.provider_deleted AND newer.is_deleted IS NOT TRUE
          AND newer.received_at>e.received_at AND lower(btrim(newer.from_address))=p.state->>'ownerEmail'
          AND private.commitment_subject_reference(newer.subject)=p.po->>'reference'
      )
      AND NOT EXISTS (
        SELECT 1 FROM private.commitment_revisions r JOIN private.mail_send_operations s ON s.user_id=r.user_id
          AND s.request_key=private.commitment_reminder_key(p_actor,p_id,r.version)
        WHERE r.user_id=p_actor AND r.commitment_id=p_id AND r.version<>p.version AND s.state IN ('dispatching','unknown'))
  ) ELSE private.single_line_reminder_snapshot(p_actor,p_id) END
$$;
REVOKE ALL ON FUNCTION private.commitment_reminder_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ask_purchase_order(p_reference text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  target uuid;
  state jsonb;
  sources jsonb;
  source_count integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_reference,'') !~ '^PO-[0-9]{1,12}$' THEN RETURN '{}'::jsonb; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  SELECT c.id,r.state INTO target,state FROM private.commitments c JOIN private.commitment_revisions r
    ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
  WHERE c.user_id=actor AND c.detection_reference=p_reference AND r.state ? 'purchaseOrder';
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  IF (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=p_reference)<>1
  THEN RETURN '{"unavailable":true}'::jsonb; END IF;
  SELECT count(*),jsonb_agg(w.evidence || jsonb_build_object('line',w.line_code,'operation',w.operation,
    'version',private.ask_answer_version(e),'sender',e.from_address,'account',a.email_address,'at',e.received_at)
    ORDER BY w.version) INTO source_count,sources
  FROM private.purchase_order_sources(actor,target) w
  JOIN public.emails e ON e.user_id=actor AND e.id=(w.evidence->>'emailId')::uuid
  LEFT JOIN public.source_accounts a ON a.user_id=actor AND a.id=e.source_account_id
  WHERE w.evidence->>'availability'='available' AND private.ask_scope(e,actor,p_filters);
  IF source_count>16 OR source_count<>(SELECT count(*) FROM private.purchase_order_events w WHERE w.user_id=actor AND w.commitment_id=target)
  THEN RETURN '{"unavailable":true}'::jsonb; END IF;
  RETURN jsonb_build_object('commitmentId',target,'status',state->>'status','lines',state#>'{purchaseOrder,lines}','sources',sources);
END;
$$;
REVOKE ALL ON FUNCTION public.ask_purchase_order(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ask_purchase_order(text,jsonb) TO authenticated;
-- Up to six lines in a purchase document can produce independent proposals.
CREATE OR REPLACE FUNCTION public.finish_commitment_catchup(p_actor uuid, p_results jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  IF jsonb_typeof(p_results) IS DISTINCT FROM 'array' OR jsonb_array_length(p_results) > 160 THEN
    RAISE EXCEPTION 'Invalid analysis batch' USING ERRCODE = '22023';
  END IF;
  WITH results AS MATERIALIZED (
    SELECT id,token,hashes FROM jsonb_to_recordset(p_results) AS r(id uuid,token uuid,hashes text[])
    WHERE cardinality(hashes) <= 6 AND NOT EXISTS (
      SELECT 1 FROM unnest(hashes) AS h WHERE h IS NULL OR h !~ '^[a-f0-9]{64}$'
    )
  ), neutral AS (
    DELETE FROM private.commitment_catchup q USING results r
    WHERE q.user_id = p_actor AND q.email_id = r.id AND q.token = r.token AND q.hashes IS NULL
      AND cardinality(r.hashes) = 0 RETURNING q.email_id
  ), candidates AS (
    UPDATE private.commitment_catchup q SET hashes = r.hashes FROM results r
    WHERE q.user_id = p_actor AND q.email_id = r.id AND q.token = r.token AND q.hashes IS NULL
      AND cardinality(r.hashes) > 0 RETURNING q.email_id
  )
  SELECT (SELECT count(*) FROM neutral) + (SELECT count(*) FROM candidates) INTO affected;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_commitment_catchup(p_accounts uuid[],p_before_id uuid,p_source_id uuid,p_focus boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  before_at timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF cardinality(p_accounts) > 50 THEN RAISE EXCEPTION 'Invalid accounts' USING ERRCODE = '22023'; END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT COALESCE(received_at,created_at,'-infinity'::timestamptz) INTO before_at
      FROM public.emails WHERE user_id = actor AND id = p_before_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mail page unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;
  RETURN (
    WITH batch AS MATERIALIZED (
      SELECT q.email_id,q.scan_at,jsonb_build_object(
        'id',e.id,'accountId',e.source_account_id,'sender',e.from_address,'senderName',left(e.from_name,120),
        'subject',left(e.subject,501),'body',left(e.body_text,8001),'at',COALESCE(e.received_at,e.created_at),
        'receivedAt',e.received_at,'fingerprint',private.commitment_detection_fingerprint(e),
        'usedQuotes',consumption.quotes || q.dismissed,'manualUsed',false,
        'catchupToken',CASE WHEN q.hashes IS NOT NULL THEN q.token END
      ) AS source
      FROM private.commitment_catchup q
      JOIN public.emails e ON e.id = q.email_id AND e.user_id = actor
      CROSS JOIN LATERAL (
        SELECT COALESCE(array_agg(DISTINCT anchor->>'hash') FILTER (WHERE anchor->>'field' = 'body_text'), '{}') AS quotes,
          COALESCE(bool_or(c.reference_key !~ '^mail:[0-9a-f]{64}$' OR anchor->>'field' <> 'body_text'),false) AS manual
        FROM private.commitment_revisions r
        JOIN private.commitments c ON (c.user_id,c.id) = (r.user_id,r.commitment_id)
        CROSS JOIN LATERAL jsonb_array_elements(r.anchors) AS a(anchor)
        WHERE r.user_id = actor AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',e.id))
          AND anchor->>'emailId' = e.id::text
      ) consumption
      WHERE q.user_id = actor AND (COALESCE(cardinality(p_accounts),0) = 0 OR q.account_id = ANY(p_accounts))
        AND (p_before_id IS NULL OR (q.scan_at,q.email_id) < (before_at,p_before_id))
        AND (p_source_id IS NULL OR q.email_id = p_source_id)
        AND (NOT p_focus OR EXISTS (
          SELECT 1 FROM private.commitments c JOIN private.commitment_revisions r
            ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,c.version)
          WHERE c.user_id = actor AND c.detection_reference = q.reference AND (r.state->>'status' = 'open' OR (
            r.state->>'status'='completed' AND r.state ?| ARRAY['receiving','purchaseOrder']
            AND q.account_id::text=COALESCE(r.state#>>'{receiving,accountId}',r.state#>>'{purchaseOrder,warehouse,accountId}')
            AND left(e.body_text,8001) ~* E'(^|[\r\n])[[:blank:]]*đính chính DC-[0-9]'
          ))
        ))
        AND NOT consumption.manual
        AND (NOT (q.hashes <@ (consumption.quotes || q.dismissed))
          OR (q.hashes IS NULL AND (p_focus OR p_source_id IS NOT NULL)))
      ORDER BY q.scan_at DESC,q.email_id DESC LIMIT 25
    ), page AS (
      SELECT * FROM batch ORDER BY scan_at DESC,email_id DESC LIMIT 24
    )
    SELECT jsonb_build_object('messages',COALESCE(
      (SELECT jsonb_agg(source ORDER BY scan_at DESC,email_id DESC) FROM page),'[]'::jsonb),
      'nextBeforeId', CASE WHEN (SELECT count(*) FROM batch) > 24
        THEN (SELECT email_id FROM page ORDER BY scan_at,email_id LIMIT 1) END)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.list_commitment_attention(p_accounts uuid[],p_reply_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  addresses text[];
  now_at timestamptz := statement_timestamp();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR p_reply_ids IS NULL OR cardinality(p_accounts)>50 OR cardinality(p_reply_ids)>24
  THEN RAISE EXCEPTION 'Invalid commitment attention scope' USING ERRCODE='22023'; END IF;
  addresses := private.commitment_owned_addresses(actor);
  RETURN (
    WITH current AS MATERIALIZED (
      SELECT c.id,c.version,c.detection_reference,r.state,r.anchors,r.recorded_at,
        private.commitment_responsibility(r.state->>'ownerEmail',addresses) AS responsibility
      FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
      WHERE c.user_id=actor AND (r.state->>'status'='open' OR (r.state->>'status'='completed' AND r.state ?| ARRAY['receiving','purchaseOrder']))
    ), ordered AS (
      SELECT c.*, CASE WHEN c.id=ANY(p_reply_ids) THEN 'reply'
        WHEN c.state->>'status'<>'open' THEN NULL
        WHEN c.state ? 'purchaseOrder' AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.state#>'{purchaseOrder,lines}') l
          WHERE (l->>'received')::int>(l->>'ordered')::int OR ((l->>'reported')::int>(l->>'received')::int
            AND EXISTS (SELECT 1 FROM private.purchase_order_events w WHERE w.user_id=actor AND w.commitment_id=c.id
              AND w.operation IN ('receive','correct')))) THEN 'purchase_discrepancy'
        WHEN c.state ? 'purchaseOrder' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.state#>'{purchaseOrder,lines}') l
          WHERE l->>'ordered' IS DISTINCT FROM l->>'reported' OR l->>'ordered' IS DISTINCT FROM l->>'received')
          THEN 'receiving_ready'
        WHEN c.state#>>'{receiving,received}'=c.state#>>'{delivery,ordered}'
          AND c.state#>>'{delivery,delivered}'=c.state#>>'{delivery,ordered}'
          AND c.state->>'review' IS NULL THEN 'receiving_ready'
        WHEN ((c.state#>>'{receiving,received}')::int < (c.state#>>'{delivery,delivered}')::int AND (
          (c.state#>>'{receiving,received}')::int > 0 OR EXISTS (
            SELECT 1 FROM private.commitment_warehouse_corrections w WHERE w.user_id=actor AND w.commitment_id=c.id)
        )) THEN 'receiving'
        WHEN c.state->>'review' IS NOT NULL THEN 'review'
        ELSE private.commitment_due_attention(c.state,now_at) END AS reason
      FROM current c
    ), candidates AS (
      SELECT *, CASE reason WHEN 'reply' THEN 1 WHEN 'receiving' THEN 2 WHEN 'purchase_discrepancy' THEN 2 WHEN 'receiving_ready' THEN 3 WHEN 'review' THEN 4 WHEN 'overdue' THEN 5 ELSE 6 END AS bucket,
        COALESCE((state->>'dueAt')::timestamptz,
          ((state->>'dueOn')::date + time '23:59:59') AT TIME ZONE INTERVAL '+07:00') AS due
      FROM ordered WHERE reason IS NOT NULL
    ), visible AS (
      SELECT c.*, source.evidence,
        operation.state AS reminder_state
      FROM candidates c
      CROSS JOIN LATERAL (
        SELECT anchor.value AS evidence
        FROM jsonb_array_elements(private.commitment_sources(actor,c.anchors)) WITH ORDINALITY AS anchor(value,position)
        JOIN public.emails e ON e.user_id=actor AND e.id=(anchor.value->>'emailId')::uuid
        WHERE anchor.value->>'availability'='available'
          AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
        ORDER BY anchor.position LIMIT 1
      ) source
      LEFT JOIN private.mail_send_operations operation
        ON operation.user_id=actor AND operation.request_key=private.commitment_reminder_key(actor,c.id,c.version)
      ORDER BY c.bucket,c.due NULLS LAST,c.recorded_at DESC,c.id LIMIT 4
    )
    SELECT jsonb_build_object(
      'tracking', EXISTS (SELECT 1 FROM current WHERE detection_reference IS NOT NULL),
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'version',v.version,'state',v.state,'reason',v.reason,'responsibility',v.responsibility,
        'group',private.commitment_board_group(v.state,v.responsibility,now_at),
        'source',v.evidence,'reminderState',v.reminder_state
      ) ORDER BY v.bucket,v.due NULLS LAST,v.recorded_at DESC,v.id) FROM visible v),'[]'::jsonb))
  );
END
$$;


CREATE OR REPLACE FUNCTION public.read_commitment_reminder(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  snapshot jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.commitments WHERE user_id=actor AND id=p_id)
  THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  snapshot := private.commitment_reminder_snapshot(actor,p_id);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Reminder requires current evidence' USING ERRCODE='PT409'; END IF;
  RETURN (snapshot - 'sourceFingerprint' - 'mailIdentity' - 'messageId' - 'purchaseEvidence') ||
    jsonb_build_object('proof',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'));
END
$$;

CREATE OR REPLACE FUNCTION public.begin_commitment_reminder(p_user_id uuid,p_account_id uuid,p_commitment_id uuid,
  p_version integer,p_proof text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM 1 FROM private.commitments WHERE user_id=p_user_id AND id=p_commitment_id AND version=p_version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder changed' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder account changed' USING ERRCODE='PT409'; END IF;
  snapshot := private.commitment_reminder_snapshot(p_user_id,p_commitment_id);
  PERFORM 1 FROM public.emails WHERE user_id=p_user_id AND id=(snapshot#>>'{source,emailId}')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder source changed' USING ERRCODE='PT409'; END IF;
  PERFORM e.id FROM public.emails e WHERE e.user_id=p_user_id AND e.id IN (
    SELECT (item->>'emailId')::uuid FROM jsonb_array_elements(COALESCE(snapshot->'purchaseEvidence','[]'::jsonb)) item
  ) ORDER BY e.id FOR SHARE;
  snapshot := private.commitment_reminder_snapshot(p_user_id,p_commitment_id);
  IF snapshot IS NULL OR (snapshot->>'accountId')::uuid IS DISTINCT FROM p_account_id
    OR encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM p_proof
    OR p_payload IS DISTINCT FROM (jsonb_build_object(
      'from',jsonb_build_object('address',snapshot->>'fromAddress','name',snapshot->>'fromName'),
      'to',jsonb_build_array(snapshot->>'to'),'cc','[]'::jsonb,'bcc','[]'::jsonb,
      'subject',snapshot->>'subject','text',snapshot->>'text') ||
      CASE WHEN snapshot->>'messageId' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('inReplyTo',snapshot->>'messageId') END)
  THEN RAISE EXCEPTION 'Reminder preview changed' USING ERRCODE='PT409'; END IF;
  RETURN public.begin_mail_send(p_user_id,p_account_id,private.commitment_reminder_key(p_user_id,p_commitment_id,p_version),p_proof,p_payload);
END
$$;


COMMIT;
