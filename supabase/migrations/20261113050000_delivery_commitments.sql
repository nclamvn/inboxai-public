BEGIN;

ALTER FUNCTION private.commitment_state(jsonb) RENAME TO commitment_base_state;
CREATE FUNCTION private.commitment_state(input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  base jsonb := private.commitment_base_state(input - 'delivery');
  progress jsonb := input->'delivery';
  ordered integer;
  delivered integer;
BEGIN
  IF NOT (input ? 'delivery') THEN RETURN base; END IF;
  IF jsonb_typeof(progress) IS DISTINCT FROM 'object' OR NOT (progress ?& ARRAY['ordered','delivered','unit'])
    OR progress - ARRAY['ordered','delivered','unit'] <> '{}'::jsonb
    OR jsonb_typeof(progress->'ordered') IS DISTINCT FROM 'number'
    OR jsonb_typeof(progress->'delivered') IS DISTINCT FROM 'number'
    OR (progress->>'ordered') !~ '^[1-9][0-9]{0,6}$' OR (progress->>'delivered') !~ '^[0-9]{1,7}$'
    OR COALESCE(progress->>'unit','') NOT IN ('bộ','chiếc','kiện','cuộn','hộp','cái')
  THEN RAISE EXCEPTION 'Invalid delivery quantity' USING ERRCODE='22023'; END IF;
  ordered := (progress->>'ordered')::integer;
  delivered := (progress->>'delivered')::integer;
  IF delivered>ordered OR (base->>'status'='completed' AND delivered<>ordered)
    OR (base->>'status'='open' AND delivered=ordered)
  THEN RAISE EXCEPTION 'Delivery quantity conflicts with status' USING ERRCODE='22023'; END IF;
  RETURN base || jsonb_build_object('delivery',progress);
END $$;
REVOKE ALL ON FUNCTION private.commitment_state(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_commitment(
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
  IF p_state IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key
  ) THEN
    IF p_id IS NOT NULL THEN
      SELECT r.state INTO prior FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
        WHERE c.user_id=actor AND c.id=p_id FOR UPDATE OF c;
    END IF;
    IF (p_state->'delivery') IS DISTINCT FROM (prior->'delivery') OR (prior ? 'delivery' AND
      (p_state->>'dueOn',p_state->>'dueAt') IS DISTINCT FROM (prior->>'dueOn',prior->>'dueAt'))
    THEN RAISE EXCEPTION 'Delivery terms require a reviewed detection' USING ERRCODE='PT422'; END IF;
  END IF;
  RETURN private.save_commitment(p_request_key,p_id,p_version,p_reference_key,p_state,p_review,p_evidence);
END;
$$;
REVOKE ALL ON FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb) TO authenticated;

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
        (p_state->>'status'='completed') IS DISTINCT FROM (lower(delivery_claim[2])='đủ') OR
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
      OR (source.received_at > private.commitment_latest_source(actor, p_id)) IS DISTINCT FROM true
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

CREATE OR REPLACE FUNCTION public.pending_commitment_catchup(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',w.email_id,'token',w.token,'sender',e.from_address,'subject',e.subject,'body',left(e.body_text,8001),'receivedAt',e.received_at)
    ORDER BY w.queued_at,w.email_id), '[]'::jsonb)
  FROM (
    SELECT email_id,token,queued_at FROM private.commitment_catchup
    WHERE user_id = p_actor AND hashes IS NULL ORDER BY queued_at,email_id LIMIT 160
  ) w JOIN public.emails e ON e.id = w.email_id AND e.user_id = p_actor
$$;

COMMIT;
