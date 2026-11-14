BEGIN;

ALTER FUNCTION private.commitment_state(jsonb) RENAME TO commitment_delivery_state;
CREATE FUNCTION private.commitment_state(input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  receiving jsonb := input->'receiving';
  base jsonb;
BEGIN
  IF NOT (input ? 'receiving') THEN RETURN private.commitment_delivery_state(input); END IF;
  IF jsonb_typeof(receiving) IS DISTINCT FROM 'object'
    OR NOT (receiving ?& ARRAY['accountId','sender','received'])
    OR receiving - ARRAY['accountId','sender','received'] <> '{}'::jsonb
    OR COALESCE(receiving->>'accountId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(receiving->>'sender','') !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR length(receiving->>'sender') > 254 OR receiving->>'sender' <> lower(receiving->>'sender')
    OR jsonb_typeof(receiving->'received') IS DISTINCT FROM 'number'
    OR (receiving->>'received') !~ '^[0-9]{1,7}$'
    OR NOT (input ? 'delivery')
  THEN RAISE EXCEPTION 'Invalid warehouse reconciliation state' USING ERRCODE='22023'; END IF;
  -- The previous contract accepts completed or cancelled states at full reported quantity.
  base := private.commitment_delivery_state(CASE WHEN input->>'status'='open'
    THEN (input - 'receiving') || '{"status":"cancelled"}'::jsonb ELSE input - 'receiving' END);
  IF (receiving->>'received')::int > (base#>>'{delivery,ordered}')::int OR
    (input->>'status'='completed' AND (receiving->>'received')::int <> (base#>>'{delivery,ordered}')::int)
  THEN RAISE EXCEPTION 'Warehouse quantity conflicts with status' USING ERRCODE='22023'; END IF;
  RETURN base || jsonb_build_object('status',input->>'status','receiving',receiving);
END;
$$;

CREATE TABLE private.commitment_warehouse_receipts (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  number text NOT NULL CHECK (number ~ '^PN-[0-9]{1,12}$'),
  version integer NOT NULL,
  PRIMARY KEY (user_id,commitment_id,number),
  UNIQUE (user_id,commitment_id,version),
  FOREIGN KEY (user_id,commitment_id,version)
    REFERENCES private.commitment_revisions(user_id,commitment_id,version) ON DELETE CASCADE
);
CREATE TABLE private.commitment_receiving_commands (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  version integer NOT NULL,
  request_key uuid NOT NULL,
  command_hash bytea NOT NULL CHECK (octet_length(command_hash)=32),
  PRIMARY KEY (user_id,request_key),
  FOREIGN KEY (user_id,commitment_id,version)
    REFERENCES private.commitment_revisions(user_id,commitment_id,version) ON DELETE CASCADE
);
REVOKE ALL ON TABLE private.commitment_warehouse_receipts,private.commitment_receiving_commands
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.commitment_supplier_source(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT source.value FROM private.commitment_revisions r
  CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) AS source(value)
  WHERE r.user_id=p_actor AND r.commitment_id=p_id
    AND r.changed_fields @> ARRAY['delivery'] AND r.kind <> 'review_flagged'
  ORDER BY r.version DESC LIMIT 1
$$;

CREATE FUNCTION private.commitment_supplier_at(p_actor uuid,p_id uuid,p_sender text)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT max(e.received_at) FROM private.commitment_revisions r
  CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) AS source(value)
  JOIN public.emails e ON e.user_id=p_actor AND e.id=(source.value->>'emailId')::uuid
  WHERE r.user_id=p_actor AND r.commitment_id=p_id AND lower(btrim(e.from_address))=p_sender
    AND source.value->>'availability'='available'
    AND (r.version=1 OR (r.changed_fields && ARRAY['delivery','dueOn','dueAt'] AND r.kind='revised'))
$$;

CREATE FUNCTION private.commitment_warehouse_sources(p_actor uuid,p_id uuid)
RETURNS TABLE(number text, evidence jsonb) LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT w.number,private.commitment_sources(p_actor,r.anchors)->0
  FROM private.commitment_warehouse_receipts w JOIN private.commitment_revisions r
    USING (user_id,commitment_id,version)
  WHERE w.user_id=p_actor AND w.commitment_id=p_id
  ORDER BY w.version
$$;

CREATE FUNCTION private.commitment_warehouse_line(p_body text,p_quote text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT count(*)=1 AND bool_and(btrim(line)=p_quote) FROM regexp_split_to_table(p_body,E'\r?\n') WITH ORDINALITY AS lines(line,position)
    WHERE btrim(line) ~* '^(phiếu nhập|biên nhận) PN-[0-9]' AND position<COALESCE((
      SELECT min(pos) FROM regexp_split_to_table(p_body,E'\r?\n') WITH ORDINALITY AS prior(text,pos)
      WHERE btrim(text) ~* '^(>|--([[:space:]]|$)|-{2,}[[:space:]]*(original message|forwarded message|thư gốc|thư được chuyển tiếp)|begin forwarded message:|from:|từ:|on .+ wrote:|vào .+ đã viết:)'
    ),9223372036854775807)
$$;

CREATE FUNCTION public.confirm_commitment_receiving(p_id uuid,p_request_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  head private.commitments;
  prior jsonb;
  target record;
  operation text := p_command->>'operation';
  expected integer;
  state jsonb;
  source public.emails;
  source_quote text := p_command->>'quote';
  proof jsonb;
  anchors jsonb;
  receipt_parts text[];
  receipt_number text;
  new_total integer;
  ordered integer;
  inbox_id uuid;
  sender text;
  previous private.commitment_receiving_commands;
  command_hash bytea;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_request_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR octet_length(p_command::text)>4096 OR COALESCE(p_command->>'expectedVersion','') !~ '^[1-9][0-9]{0,9}$'
    OR COALESCE(operation,'') NOT IN ('configure','receive','close')
  THEN RAISE EXCEPTION 'Invalid receiving command' USING ERRCODE='22023'; END IF;
  expected := (p_command->>'expectedVersion')::int;
  IF operation='receive' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor || ':' || (p_command->>'emailId'),0));
  END IF;
  command_hash := sha256(convert_to(jsonb_build_array(p_id,p_command)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor || ':' || p_request_key,0));
  SELECT * INTO previous FROM private.commitment_receiving_commands
    WHERE user_id=actor AND request_key=p_request_key;
  IF FOUND THEN
    IF previous.command_hash<>command_hash THEN RAISE EXCEPTION 'Receiving request reused' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('id',previous.commitment_id,'version',previous.version,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Receiving request reused' USING ERRCODE='PT409'; END IF;

  SELECT * INTO head FROM private.commitments WHERE user_id=actor AND id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  IF NOT COALESCE(head.detection_reference ~ '^PO-[0-9]{1,12}$',false)
  THEN RAISE EXCEPTION 'Receiving requires a cited purchase order' USING ERRCODE='PT422'; END IF;
  IF operation='receive' THEN
    SELECT * INTO source FROM public.emails WHERE id=(p_command->>'emailId')::uuid AND user_id=actor
      AND direction='inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Warehouse email unavailable' USING ERRCODE='PT404'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || head.detection_reference,0));
  SELECT * INTO head FROM private.commitments WHERE user_id=actor AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  IF head.version <> expected THEN RAISE EXCEPTION 'Commitment changed' USING ERRCODE='PT409'; END IF;
  SELECT t.* INTO target FROM private.commitment_lifecycle_targets(actor,head.detection_reference) t WHERE t.id=p_id;
  prior := target.state;
  IF prior->'delivery' IS NULL OR target.multi_origin IS DISTINCT FROM false OR target.origin_sender IS NULL
    OR (SELECT count(*) FROM private.commitment_lifecycle_targets(actor,head.detection_reference)) <> 1
  THEN RAISE EXCEPTION 'Purchase order scope is ambiguous' USING ERRCODE='PT409'; END IF;
  state := prior - 'review';
  ordered := (state#>>'{delivery,ordered}')::int;
  IF operation='close' THEN
    PERFORM 1 FROM public.emails AS e WHERE e.user_id=actor AND e.id IN (
      SELECT (private.commitment_supplier_source(actor,p_id)->>'emailId')::uuid
      UNION
      SELECT (w.evidence->>'emailId')::uuid FROM private.commitment_warehouse_sources(actor,p_id) w
    ) ORDER BY e.id FOR SHARE;
  END IF;
  proof := private.commitment_supplier_source(actor,p_id);
  IF proof->>'availability' IS DISTINCT FROM 'available'
  THEN RAISE EXCEPTION 'Supplier evidence unavailable' USING ERRCODE='PT409'; END IF;
  anchors := jsonb_build_array(jsonb_build_object('emailId',proof->>'emailId','field',proof->>'field','quote',proof->>'quote'));

  IF operation='configure' THEN
    inbox_id := (p_command->>'accountId')::uuid;
    PERFORM 1 FROM public.source_accounts WHERE id=inbox_id AND user_id=actor AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Warehouse inbox unavailable' USING ERRCODE='PT422'; END IF;
    sender := lower(btrim(p_command->>'sender'));
    IF state ? 'receiving' OR state->>'status' NOT IN ('open','completed') OR prior->>'review' IS NOT NULL
      OR sender IS NULL OR sender IN (target.origin_sender,state->>'ownerEmail')
    THEN RAISE EXCEPTION 'Warehouse source cannot be configured' USING ERRCODE='PT422'; END IF;
    state := state || jsonb_build_object('receiving',jsonb_build_object('accountId',inbox_id,'sender',sender,'received',0),
      'status','open');
  ELSIF operation='receive' THEN
    receipt_parts := regexp_match(source_quote,
      '^(phiếu nhập|biên nhận) (PN-[0-9]{1,12})[ ]{0,3}[:–-] (kho (đã )?nhận|thực nhập|thực nhận) ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$', 'i');
    IF NOT (state ? 'receiving') OR state->>'status' <> 'open' OR prior->>'review' IS NOT NULL
      OR source.source_account_id::text IS DISTINCT FROM state#>>'{receiving,accountId}'
      OR lower(btrim(source.from_address)) IS DISTINCT FROM state#>>'{receiving,sender}'
      OR private.commitment_subject_reference(source.subject) IS DISTINCT FROM head.detection_reference
      OR COALESCE(p_command->>'sourceFingerprint','') IS DISTINCT FROM private.commitment_detection_fingerprint(source)
      OR NOT EXISTS (SELECT 1 FROM public.source_accounts a WHERE a.id=source.source_account_id AND a.user_id=actor AND a.is_active)
      OR (source.received_at >= (SELECT e.received_at FROM public.emails e WHERE e.user_id=actor AND e.id=target.origin_id)) IS DISTINCT FROM true
      OR receipt_parts IS NULL OR lower(receipt_parts[6]) IS DISTINCT FROM state#>>'{delivery,unit}'
      OR length(COALESCE(source.body_text,''))>8000 OR NOT COALESCE(private.commitment_warehouse_line(source.body_text,source_quote),false)
    THEN RAISE EXCEPTION 'Warehouse proof does not match the commitment' USING ERRCODE='PT409'; END IF;
    receipt_number := upper(receipt_parts[2]);
    new_total := (state#>>'{receiving,received}')::int + receipt_parts[5]::int;
    IF new_total>ordered OR EXISTS (
      SELECT 1 FROM private.commitment_warehouse_receipts
      WHERE user_id=actor AND commitment_id=p_id AND number=receipt_number
    ) OR (SELECT count(*) FROM private.commitment_warehouse_receipts WHERE user_id=actor AND commitment_id=p_id)>=200
    THEN RAISE EXCEPTION 'Duplicate, excess or unsupported receipt' USING ERRCODE='PT409'; END IF;
    state := jsonb_set(state,'{receiving,received}',to_jsonb(new_total));
    anchors := jsonb_build_array(jsonb_build_object('emailId',source.id,'field','body_text','quote',source_quote));
  ELSE
    IF NOT (state ? 'receiving') OR state->>'status'<>'open' OR prior->>'review' IS NOT NULL
      OR (state#>>'{receiving,received}')::int <> ordered OR (state#>>'{delivery,delivered}')::int <> ordered
      OR EXISTS (SELECT 1 FROM private.commitment_warehouse_sources(actor,p_id) w
        WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
    THEN RAISE EXCEPTION 'Verified full delivery and warehouse receipts are required' USING ERRCODE='PT409'; END IF;
    SELECT anchors || jsonb_build_array(jsonb_build_object('emailId',w.evidence->>'emailId','field','body_text',
      'quote',w.evidence->>'quote')) INTO anchors
    FROM private.commitment_warehouse_sources(actor,p_id) w
    JOIN private.commitment_warehouse_receipts log ON log.user_id=actor AND log.commitment_id=p_id AND log.number=w.number
    ORDER BY log.version DESC LIMIT 1;
    state := jsonb_set(state,'{status}','"completed"'::jsonb);
  END IF;

  result := private.save_commitment(p_request_key,p_id,expected,NULL,state,NULL,anchors);
  IF receipt_number IS NOT NULL THEN
    INSERT INTO private.commitment_warehouse_receipts VALUES(actor,p_id,receipt_number,(result->>'version')::int);
  END IF;
  INSERT INTO private.commitment_receiving_commands VALUES(actor,p_id,(result->>'version')::int,p_request_key,command_hash);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.commitment_state(jsonb),private.commitment_warehouse_sources(uuid,uuid),
  private.commitment_supplier_source(uuid,uuid),private.commitment_supplier_at(uuid,uuid,text),
  private.commitment_warehouse_line(text,text),public.confirm_commitment_receiving(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_commitment_receiving(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_commitment(
  p_request_key uuid, p_id uuid, p_version integer, p_reference_key text,
  p_state jsonb, p_review jsonb, p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  prior jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor::text || ':' || p_request_key::text, 0));
  IF EXISTS (SELECT 1 FROM private.commitment_receiving_commands
    WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Commitment request reused' USING ERRCODE='PT409'; END IF;
  IF p_state IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key
  ) THEN
    IF p_id IS NOT NULL THEN
      SELECT r.state INTO prior FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
        WHERE c.user_id=actor AND c.id=p_id FOR UPDATE OF c;
    END IF;
    IF (p_state->'receiving') IS DISTINCT FROM (prior->'receiving') OR
      (prior ? 'receiving' AND ((p_state->>'status'='completed' AND prior->>'status'<>'completed') OR
        (p_state->>'status'='open' AND prior->>'status'='completed') OR
        p_state->>'ownerEmail' IS DISTINCT FROM prior->>'ownerEmail')) OR
      (p_state->'delivery') IS DISTINCT FROM (prior->'delivery') OR (prior ? 'delivery' AND
      (p_state->>'dueOn',p_state->>'dueAt') IS DISTINCT FROM (prior->>'dueOn',prior->>'dueAt'))
    THEN RAISE EXCEPTION 'Delivery terms require a reviewed detection' USING ERRCODE='PT422'; END IF;
  END IF;
  RETURN private.save_commitment(p_request_key,p_id,p_version,p_reference_key,p_state,p_review,p_evidence);
END;
$$;
CREATE OR REPLACE FUNCTION public.confirm_commitment_detection(
  p_request_key uuid, p_email_id uuid, p_fingerprint text, p_id uuid, p_version integer,
  p_reference_key text, p_state jsonb, p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  source public.emails;
  create_reference text := CASE WHEN p_id IS NULL THEN p_reference_key END;
  case_ref text;
  sender text;
  quote_hash text;
  target_count integer;
  authorized_count integer;
  matches_target boolean;
  head_version integer;
  current_state jsonb;
  delivery_claim text[];
  quantity_update boolean := false;
  date_claim text[];
  old_date date;
  new_date date;
  receipt jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_email_id IS NULL OR p_request_key IS NULL OR COALESCE(p_fingerprint,'') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence) <> 1
    OR (p_evidence->0->>'emailId') IS DISTINCT FROM p_email_id::text
    OR (p_evidence->0->>'field') IS DISTINCT FROM 'body_text'
    OR COALESCE(p_reference_key,'') !~ '^mail:[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'Invalid detection confirmation' USING ERRCODE = '22023'; END IF;
  IF p_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.commitments
    WHERE user_id = actor AND id = p_id AND reference_key = p_reference_key)
  THEN RAISE EXCEPTION 'Detection target unavailable' USING ERRCODE = 'PT404'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor::text || ':' || p_email_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor::text || ':' || p_request_key::text, 0));
  IF EXISTS (SELECT 1 FROM private.commitment_receiving_commands
    WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Detection request reused' USING ERRCODE='PT409'; END IF;
  IF EXISTS (SELECT 1 FROM private.commitment_revisions r
    WHERE r.user_id = actor AND r.request_key = p_request_key
      AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',p_email_id,'field','body_text')))
  THEN
    RETURN private.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
  END IF;

  SELECT * INTO source FROM public.emails e WHERE e.user_id = actor AND e.id = p_email_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Detection source unavailable' USING ERRCODE = 'PT404'; END IF;

  quote_hash := encode(sha256(convert_to(p_evidence->0->>'quote', 'UTF8')), 'hex');
  IF private.commitment_detection_fingerprint(source) <> p_fingerprint OR EXISTS (
    SELECT 1 FROM private.commitment_revisions r
    JOIN private.commitments c ON (c.user_id,c.id) = (r.user_id,r.commitment_id)
    CROSS JOIN LATERAL jsonb_array_elements(r.anchors) AS a(anchor)
    WHERE r.user_id = actor AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',p_email_id))
      AND anchor->>'emailId' = p_email_id::text AND (
        anchor->>'hash' = quote_hash OR anchor->>'field' <> 'body_text' OR c.reference_key !~ '^mail:[0-9a-f]{64}$')
  ) THEN RAISE EXCEPTION 'Detection changed or already reviewed' USING ERRCODE = 'PT409'; END IF;

  case_ref := private.commitment_subject_reference(source.subject);
  sender := lower(btrim(source.from_address));
  IF case_ref IS NOT NULL THEN
    -- Serialize approvals that may change the candidate set for the same case.
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor::text || ':' || case_ref, 0));
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT r.state INTO current_state FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
      WHERE c.id=p_id AND c.user_id=actor FOR UPDATE OF c;
  END IF;
  IF (p_state->'receiving') IS DISTINCT FROM (current_state->'receiving') OR
    (current_state ? 'receiving' AND (p_state->>'status'='completed' OR p_state->>'ownerEmail' IS DISTINCT FROM current_state->>'ownerEmail'))
  THEN RAISE EXCEPTION 'Receiving state requires a warehouse approval' USING ERRCODE='PT409'; END IF;
  IF (p_state->'delivery') IS DISTINCT FROM (current_state->'delivery') THEN
    IF case_ref IS NULL OR case_ref NOT LIKE 'PO-%' OR NOT (p_state ? 'delivery') THEN
      RAISE EXCEPTION 'Invalid delivery evidence' USING ERRCODE = 'PT409';
    END IF;
    IF p_id IS NULL THEN
      delivery_claim := regexp_match(btrim(p_evidence->0->>'quote'),
        '^(chúng tôi|bên tôi|bên em|tôi) xác nhận giao ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái) .{1,145} (vào ngày|chậm nhất ngày|ngày) ([0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})[.!]?$', 'i');
      IF delivery_claim IS NULL OR p_state->>'dueAt' IS NOT NULL OR p_state->>'status' IS DISTINCT FROM 'open'
        OR p_state->>'ownerEmail' IS DISTINCT FROM sender OR p_state->'delivery' IS DISTINCT FROM jsonb_build_object(
        'ordered',delivery_claim[2]::int,'delivered',0,'unit',lower(delivery_claim[3]))
      THEN RAISE EXCEPTION 'Delivery promise does not match evidence' USING ERRCODE = 'PT409'; END IF;
      new_date := CASE WHEN strpos(delivery_claim[5],'/')>0 THEN to_date(delivery_claim[5],'DD/MM/YYYY') ELSE delivery_claim[5]::date END;
      IF to_char(new_date,'YYYY-MM-DD') IS DISTINCT FROM p_state->>'dueOn'
      THEN RAISE EXCEPTION 'Initial date does not match evidence' USING ERRCODE='PT409'; END IF;
    ELSE
      delivery_claim := regexp_match(btrim(p_evidence->0->>'quote'),
        '^(chúng tôi|bên tôi|bên em|tôi) đã giao (lũy kế|đủ) ([1-9][0-9]{0,6})/([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$', 'i');
      IF delivery_claim IS NULL OR current_state->'delivery' IS NULL OR
        p_state->'delivery' IS DISTINCT FROM jsonb_build_object(
          'ordered',delivery_claim[4]::int,'delivered',delivery_claim[3]::int,'unit',lower(delivery_claim[5])) OR
        (current_state->'delivery') - 'delivered'::text IS DISTINCT FROM (p_state->'delivery') - 'delivered'::text OR
        (current_state->'delivery'->>'delivered')::int >= delivery_claim[3]::int OR
        (p_state->>'status'='completed') IS DISTINCT FROM
          (lower(delivery_claim[2])='đủ' AND NOT (current_state ? 'receiving')) OR
        p_state->>'status' NOT IN ('open','completed') OR
        p_state - ARRAY['delivery','status'] IS DISTINCT FROM current_state - ARRAY['delivery','status','review']
      THEN RAISE EXCEPTION 'Delivery progress does not match evidence' USING ERRCODE = 'PT409'; END IF;
      quantity_update := true;
    END IF;
  END IF;

  IF p_state ? 'delivery' THEN
    IF NOT EXISTS (
      SELECT 1 FROM regexp_split_to_table(source.body_text, E'\r?\n') WITH ORDINALITY AS lines(line,position)
      WHERE btrim(line) = p_evidence->0->>'quote' AND position < COALESCE((
        SELECT min(pos) FROM regexp_split_to_table(source.body_text, E'\r?\n') WITH ORDINALITY AS prior(text,pos)
        WHERE btrim(text) ~* '^(>|--([[:space:]]|$)|-{2,}[[:space:]]*(original message|forwarded message|thư gốc|thư được chuyển tiếp)|begin forwarded message:|from:|từ:|on .+ wrote:|vào .+ đã viết:)'
      ),9223372036854775807)
    ) THEN RAISE EXCEPTION 'Delivery evidence is quoted or unavailable' USING ERRCODE='PT409'; END IF;
    IF p_id IS NOT NULL AND NOT quantity_update AND p_state->>'status'='completed' THEN
      RAISE EXCEPTION 'Full delivery evidence required' USING ERRCODE='PT409';
    END IF;
    IF p_id IS NOT NULL AND (p_state->>'dueOn',p_state->>'dueAt')
      IS DISTINCT FROM (current_state->>'dueOn',current_state->>'dueAt') THEN
      date_claim := regexp_match(btrim(p_evidence->0->>'quote'),
        '^(chúng tôi|bên tôi|bên em|tôi) xác nhận (dời|đổi) lịch giao từ ([0-9/-]+) sang ([0-9/-]+)[.!]?$', 'i');
      IF date_claim IS NULL OR p_state->>'dueAt' IS NOT NULL THEN
        RAISE EXCEPTION 'Confirmed replacement date required' USING ERRCODE='PT409';
      END IF;
      old_date := CASE WHEN strpos(date_claim[3],'/')>0 THEN to_date(date_claim[3],'DD/MM/YYYY') ELSE date_claim[3]::date END;
      new_date := CASE WHEN strpos(date_claim[4],'/')>0 THEN to_date(date_claim[4],'DD/MM/YYYY') ELSE date_claim[4]::date END;
      IF to_char(old_date,'YYYY-MM-DD') IS DISTINCT FROM current_state->>'dueOn' OR to_char(new_date,'YYYY-MM-DD') IS DISTINCT FROM p_state->>'dueOn'
        OR p_state - ARRAY['dueOn','dueAt'] IS DISTINCT FROM current_state - ARRAY['dueOn','dueAt','review']
      THEN RAISE EXCEPTION 'Replacement date does not match evidence' USING ERRCODE='PT409'; END IF;
    END IF;
  END IF;

  IF p_id IS NULL THEN
    SELECT count(*), count(*) FILTER (WHERE (
      (t.origin_sender = sender AND (t.origin_account_id IS NOT DISTINCT FROM source.source_account_id OR
        (p_state ? 'delivery' AND t.state ? 'delivery'))) OR
      (lower(t.state->>'ownerEmail') = sender AND (t.origin_account_id IS NOT DISTINCT FROM source.source_account_id
        OR t.origin_sender IS DISTINCT FROM sender))
    ) AND (t.origin_id <> p_email_id OR
      lower(normalize(t.origin_title)) = lower(normalize(p_state->>'title'))))
    INTO target_count, authorized_count FROM private.commitment_lifecycle_targets(actor, case_ref) t;
    IF target_count > 8 OR authorized_count > 0
    THEN RAISE EXCEPTION 'Detection case already has a matching commitment' USING ERRCODE = 'PT409'; END IF;
  ELSE
    SELECT version INTO head_version FROM private.commitments WHERE user_id = actor AND id = p_id FOR UPDATE;
    IF head_version IS DISTINCT FROM p_version
    THEN RAISE EXCEPTION 'Commitment version conflict' USING ERRCODE = 'PT409'; END IF;

    SELECT count(*), count(*) FILTER (WHERE permitted), bool_or(permitted AND t.id = p_id AND NOT t.multi_origin)
      INTO target_count, authorized_count, matches_target
    FROM private.commitment_lifecycle_targets(actor, case_ref) t
    CROSS JOIN LATERAL (SELECT t.state->>'status' = 'open' AND lower(t.state->>'ownerEmail') = sender
      AND (CASE WHEN quantity_update THEN t.state ? 'delivery'
        ELSE t.origin_account_id IS NOT DISTINCT FROM source.source_account_id OR t.origin_sender IS DISTINCT FROM sender END) AS permitted) permission;
    IF target_count > 8 OR authorized_count <> 1 OR matches_target IS DISTINCT FROM true
      OR (source.received_at > CASE WHEN current_state ? 'receiving'
        THEN private.commitment_supplier_at(actor,p_id,sender) ELSE private.commitment_latest_source(actor,p_id) END) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Detection authority or chronology changed' USING ERRCODE = 'PT409'; END IF;
  END IF;

  receipt := private.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
  IF p_id IS NULL AND case_ref IS NOT NULL THEN
    UPDATE private.commitments SET detection_reference = case_ref
      WHERE user_id = actor AND id = (receipt->>'id')::uuid;
  END IF;
  RETURN receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_commitment_lifecycle_targets(p_references text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_references IS NULL OR cardinality(p_references) > 24 OR EXISTS (
    SELECT 1 FROM unnest(p_references) AS ref WHERE ref IS NULL OR ref !~ '^[A-Z]{2,12}-[0-9]{1,12}$'
  ) THEN RAISE EXCEPTION 'Invalid detection references' USING ERRCODE = '22023'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'reference', refs.ref, 'referenceKey', t.reference_key, 'id', t.id, 'version', t.version, 'state', t.state,
    'originId', t.origin_id, 'originTitle', t.origin_title, 'originSender', t.origin_sender,
    'originAccountId', t.origin_account_id, 'multiOrigin', t.multi_origin,
    'lastSourceAt', private.commitment_latest_source(actor, t.id),
    'originAt', (SELECT e.received_at FROM public.emails e WHERE e.user_id=actor AND e.id=t.origin_id),
    'supplierAt', CASE WHEN t.state ? 'receiving' THEN private.commitment_supplier_at(actor,t.id,lower(t.state->>'ownerEmail')) END,
    'receiptNumbers', ARRAY(SELECT w.number FROM private.commitment_warehouse_receipts w
      WHERE w.user_id=actor AND w.commitment_id=t.id)))
    FROM (SELECT DISTINCT ref FROM unnest(p_references) AS ref) refs
    CROSS JOIN LATERAL private.commitment_lifecycle_targets(actor, refs.ref) t), '[]'::jsonb);
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
      WHERE c.user_id=actor AND r.state->>'status'='open'
    ), ordered AS (
      SELECT c.*, CASE WHEN c.id=ANY(p_reply_ids) THEN 'reply'
        WHEN c.state#>>'{receiving,received}'=c.state#>>'{delivery,ordered}'
          AND c.state#>>'{delivery,delivered}'=c.state#>>'{delivery,ordered}'
          AND c.state->>'review' IS NULL THEN 'receiving_ready'
        WHEN (c.state#>>'{receiving,received}')::int BETWEEN 1 AND (c.state#>>'{delivery,delivered}')::int-1 THEN 'receiving'
        WHEN c.state->>'review' IS NOT NULL THEN 'review'
        ELSE private.commitment_due_attention(c.state,now_at) END AS reason
      FROM current c
    ), candidates AS (
      SELECT *, CASE reason WHEN 'reply' THEN 1 WHEN 'receiving' THEN 2 WHEN 'receiving_ready' THEN 3 WHEN 'review' THEN 4 WHEN 'overdue' THEN 5 ELSE 6 END AS bucket,
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

CREATE OR REPLACE FUNCTION private.commitment_reminder_snapshot(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version',c.version,'accountId',a.id,'fromAddress',a.email_address,
    'fromName',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1)),
    'to',lower(btrim(head.state->>'ownerEmail')),
    'subject',CASE WHEN e.subject IS NULL OR btrim(e.subject)='' OR e.subject ~ '[[:cntrl:]]'
      THEN 'Re: Theo dõi cam kết ' || c.detection_reference
      WHEN e.subject ~* '^re:' THEN btrim(left(e.subject,500)) ELSE 'Re: ' || btrim(left(e.subject,496)) END,
    'text',CASE WHEN (head.state#>>'{receiving,received}')::int BETWEEN 1 AND (head.state#>>'{delivery,delivered}')::int-1
      THEN format(E'Chào anh/chị,\n\nKho đã ghi nhận %s/%s %s cho %s, còn thiếu %s %s so với số lượng đặt. Anh/chị vui lòng kiểm tra và xác nhận lịch giao phần còn thiếu.\n\nCảm ơn anh/chị.',
        head.state#>>'{receiving,received}',head.state#>>'{delivery,ordered}',head.state#>>'{delivery,unit}',
        c.detection_reference,
        (head.state#>>'{delivery,ordered}')::int-(head.state#>>'{receiving,received}')::int,head.state#>>'{delivery,unit}')
      ELSE format(E'Chào anh/chị,\n\nTôi muốn hỏi tiến độ cam kết “%s” (hạn %s). Anh/chị có thể xác nhận tình trạng hiện tại hoặc lịch mới được không?\n\nCảm ơn anh/chị.',
      head.state->>'title', COALESCE(to_char((head.state->>'dueOn')::date,'DD/MM/YYYY'),
        to_char((head.state->>'dueAt')::timestamptz AT TIME ZONE INTERVAL '+07:00','HH24:MI DD/MM/YYYY') || ' (UTC+7)')) END,
    'source',origin.evidence,
    'sourceFingerprint',private.commitment_detection_fingerprint(e),
    'messageId',CASE WHEN length(e.message_id)<=998 AND e.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN e.message_id END,
    'mailIdentity',jsonb_build_array(e.sync_namespace,e.original_uid,a.auth_type)
  )
  FROM private.commitments c
  JOIN private.commitment_revisions head ON (head.user_id,head.commitment_id,head.version)=(c.user_id,c.id,c.version)
  CROSS JOIN LATERAL (
    SELECT candidate.value AS evidence
    FROM private.commitment_revisions r
    CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) AS candidate(value)
    JOIN public.emails message ON message.id=(candidate.value->>'emailId')::uuid AND message.user_id=p_actor
    JOIN public.source_accounts account ON account.id=message.source_account_id AND account.user_id=p_actor AND account.is_active
    WHERE r.user_id=p_actor AND r.commitment_id=c.id AND candidate.value->>'availability'='available'
      AND message.direction='inbound' AND message.received_at IS NOT NULL
      AND lower(btrim(message.from_address))=lower(btrim(head.state->>'ownerEmail'))
      AND private.commitment_subject_reference(message.subject)=c.detection_reference
    ORDER BY message.received_at DESC,r.version DESC,message.id LIMIT 1
  ) origin
  JOIN public.emails e ON e.id=(origin.evidence->>'emailId')::uuid AND e.user_id=p_actor
  JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=p_actor AND a.is_active
  WHERE c.user_id=p_actor AND c.id=p_id AND head.state->>'status'='open'
    AND head.state->>'review' IS NULL AND c.detection_reference IS NOT NULL
    AND (private.commitment_due_attention(head.state,statement_timestamp()) IS NOT NULL
      OR (head.state#>>'{receiving,received}')::int BETWEEN 1 AND (head.state#>>'{delivery,delivered}')::int-1)
    AND (NOT (head.state ? 'receiving') OR (
      head.state#>>'{receiving,received}' IS DISTINCT FROM head.state#>>'{delivery,ordered}' AND
      NOT EXISTS (SELECT 1 FROM private.commitment_warehouse_sources(p_actor,p_id) w
        WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
    ))
    AND private.commitment_responsibility(head.state->>'ownerEmail',private.commitment_owned_addresses(p_actor))='waiting'
    AND NOT EXISTS (
      SELECT 1 FROM public.emails newer
      WHERE newer.user_id=p_actor AND newer.direction='inbound' AND NOT newer.provider_deleted AND newer.is_deleted IS NOT TRUE
        AND lower(btrim(newer.from_address))=lower(btrim(e.from_address)) AND newer.received_at>e.received_at
        AND private.commitment_subject_reference(newer.subject)=c.detection_reference
    )
    AND NOT EXISTS (
      SELECT 1 FROM private.commitment_revisions old
      JOIN private.mail_send_operations op ON op.user_id=old.user_id
        AND op.request_key=private.commitment_reminder_key(old.user_id,old.commitment_id,old.version)
      WHERE old.user_id=p_actor AND old.commitment_id=c.id AND old.version<>c.version AND op.state IN ('dispatching','unknown')
    )
$$;

CREATE FUNCTION public.ask_warehouse_reconciliation(p_reference text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  target record;
  supplier jsonb;
  receipts jsonb;
  evidence jsonb;
  source_count integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_reference,'') !~ '^PO-[0-9]{1,12}$' THEN RETURN '{}'::jsonb; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  IF (SELECT count(*) FROM private.commitment_lifecycle_targets(actor,p_reference)) <> 1 THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO target FROM private.commitment_lifecycle_targets(actor,p_reference);
  IF NOT (target.state ? 'receiving') THEN RETURN '{}'::jsonb; END IF;
  supplier := private.commitment_supplier_source(actor,target.id);
  SELECT COALESCE(jsonb_agg(w.evidence ORDER BY w.number),'[]'::jsonb) INTO receipts
    FROM private.commitment_warehouse_sources(actor,target.id) w;
  WITH sources AS (
    SELECT supplier AS value,0 AS role,0::bigint AS position
    UNION ALL SELECT value,1,ordinality FROM jsonb_array_elements(receipts) WITH ORDINALITY
  ), scoped AS (
    SELECT s.role,s.position,s.value || jsonb_build_object(
      'version',private.ask_answer_version(e),'sender',e.from_address,'account',a.email_address,'at',e.received_at) AS value
    FROM sources s JOIN public.emails e ON e.user_id=actor AND e.id=(s.value->>'emailId')::uuid
    LEFT JOIN public.source_accounts a ON a.user_id=actor AND a.id=e.source_account_id
    WHERE s.value->>'availability'='available' AND private.ask_scope(e,actor,p_filters)
  )
  SELECT COALESCE(jsonb_agg(value ORDER BY role,position) FILTER (WHERE position<=6),'[]'::jsonb), count(*)
    INTO evidence,source_count FROM scoped;
  IF source_count<>jsonb_array_length(receipts)+1 THEN RETURN '{}'::jsonb; END IF;
  -- The API cites every receipt or abstains from the aggregate.
  IF source_count>7 THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('status',target.state->>'status','commitmentId',target.id,
    'ordered',target.state#>'{delivery,ordered}','reported',target.state#>'{delivery,delivered}',
    'received',target.state#>'{receiving,received}','unit',target.state#>'{delivery,unit}',
    'supplier',evidence->0,'receipts',evidence-0);
END;
$$;
REVOKE ALL ON FUNCTION public.ask_warehouse_reconciliation(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ask_warehouse_reconciliation(text,jsonb) TO authenticated;

COMMIT;
