BEGIN;

-- Keep the existing ledger key. Store the case reference separately so a confirmed
-- handoff can be followed from another owned mailbox without inventing a new key.
ALTER TABLE private.commitments ADD COLUMN detection_reference text;
CREATE INDEX commitments_detection_reference ON private.commitments (user_id, detection_reference, id)
  WHERE detection_reference IS NOT NULL;

CREATE FUNCTION private.commitment_subject_reference(subject text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN count(DISTINCT token[1]) = 1 THEN min(token[1]) END
  FROM regexp_matches(upper(left(subject, 501)), '(?<![A-Z0-9_])([A-Z]{2,12}-[0-9]{1,12})(?![A-Z0-9_])', 'g') AS token
  WHERE length(subject) <= 500
$$;

CREATE FUNCTION private.commitment_case_key(account uuid, sender text, reference text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'mail:' || encode(sha256(convert_to(
    '[' || COALESCE(to_json(account)::text,'null') || ',' ||
    to_json(sender)::text || ',' || to_json(reference)::text || ']', 'UTF8')), 'hex')
$$;

WITH origins AS (
  SELECT c.user_id, c.id, c.reference_key, e.source_account_id, lower(btrim(e.from_address)) AS sender,
    private.commitment_subject_reference(e.subject) AS reference
  FROM private.commitments c
  JOIN private.commitment_revisions r ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,1)
  JOIN public.emails e ON e.user_id = c.user_id AND e.id = (r.anchors->0->>'emailId')::uuid
  WHERE c.reference_key ~ '^mail:[0-9a-f]{64}$' AND jsonb_array_length(r.anchors) = 1 AND r.anchors->0->>'field' = 'body_text'
)
UPDATE private.commitments c SET detection_reference = o.reference
FROM origins o
WHERE (c.user_id,c.id) = (o.user_id,o.id) AND o.reference IS NOT NULL
  AND o.reference_key = private.commitment_case_key(o.source_account_id, o.sender, o.reference);

CREATE OR REPLACE FUNCTION public.scan_commitment_mail(p_before_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  before_at timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT COALESCE(created_at, '-infinity'::timestamptz) INTO before_at
      FROM public.emails WHERE user_id = actor AND id = p_before_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mail page unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;
  RETURN (
    WITH batch AS MATERIALIZED (
      SELECT id, COALESCE(created_at, '-infinity'::timestamptz) AS scan_at
      FROM public.emails
      WHERE user_id = actor AND NOT provider_deleted AND is_deleted IS NOT TRUE
        AND (p_before_id IS NULL OR (COALESCE(created_at, '-infinity'::timestamptz),id) < (before_at,p_before_id))
      ORDER BY scan_at DESC,id DESC LIMIT 25
    ), page AS (
      SELECT * FROM batch ORDER BY scan_at DESC,id DESC LIMIT 24
    )
    SELECT jsonb_build_object(
      'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',e.id,'accountId',e.source_account_id,'sender',e.from_address,'senderName',left(e.from_name,120),
        'subject',left(e.subject,501),'body',left(e.body_text,8001),'at',COALESCE(e.received_at,e.created_at),
        'receivedAt',e.received_at,'fingerprint',private.commitment_detection_fingerprint(e),
        'used',consumption.used,'usedQuotes',consumption.quotes,'manualUsed',consumption.manual
      ) ORDER BY page.scan_at DESC,page.id DESC)
        FROM page JOIN public.emails e ON e.id = page.id AND e.user_id = actor
        CROSS JOIN LATERAL (
          SELECT count(*) > 0 AS used,
            COALESCE(jsonb_agg(DISTINCT anchor->>'hash') FILTER (WHERE anchor->>'field' = 'body_text'), '[]'::jsonb) AS quotes,
            COALESCE(bool_or(c.reference_key !~ '^mail:[0-9a-f]{64}$' OR anchor->>'field' <> 'body_text'), false) AS manual
          FROM private.commitment_revisions r
          JOIN private.commitments c ON (c.user_id,c.id) = (r.user_id,r.commitment_id)
          CROSS JOIN LATERAL jsonb_array_elements(r.anchors) AS a(anchor)
          WHERE r.user_id = actor AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',e.id))
            AND anchor->>'emailId' = e.id::text
        ) consumption
      ),'[]'::jsonb),
      'nextBeforeId', CASE WHEN (SELECT count(*) FROM batch) > 24
        THEN (SELECT id FROM page ORDER BY scan_at,id LIMIT 1) END)
  );
END;
$$;

CREATE FUNCTION private.commitment_lifecycle_targets(p_actor uuid, p_reference text)
RETURNS TABLE (id uuid, reference_key text, version integer, state jsonb,
  origin_id uuid, origin_title text, origin_sender text, origin_account_id uuid, multi_origin boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c.id, c.reference_key, c.version, head.state, (first.anchors->0->>'emailId')::uuid,
    first.state->>'title', lower(btrim(origin.from_address)), origin.source_account_id,
    c.reference_key <> private.commitment_case_key(origin.source_account_id, lower(btrim(origin.from_address)), p_reference)
  FROM (SELECT * FROM private.commitments
    WHERE user_id = p_actor AND detection_reference = p_reference ORDER BY id LIMIT 9) c
  JOIN private.commitment_revisions head ON (head.user_id,head.commitment_id,head.version) = (c.user_id,c.id,c.version)
  JOIN private.commitment_revisions first ON (first.user_id,first.commitment_id,first.version) = (c.user_id,c.id,1)
  LEFT JOIN public.emails origin ON origin.user_id = c.user_id AND origin.id = (first.anchors->0->>'emailId')::uuid
$$;

CREATE FUNCTION private.commitment_latest_source(p_actor uuid, p_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN bool_and(COALESCE(
    e.received_at IS NOT NULL AND encode(sha256(convert_to(
      substr(CASE anchor->>'field' WHEN 'subject' THEN e.subject ELSE e.body_text END,
        (anchor->>'start')::integer, (anchor->>'length')::integer), 'UTF8')), 'hex') = anchor->>'hash', false))
    THEN max(e.received_at) END
  FROM private.commitment_revisions r
  CROSS JOIN LATERAL jsonb_array_elements(r.anchors) AS a(anchor)
  LEFT JOIN public.emails e ON e.user_id = r.user_id AND e.id = (anchor->>'emailId')::uuid
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  WHERE r.user_id = p_actor AND r.commitment_id = p_id
$$;

CREATE FUNCTION public.read_commitment_lifecycle_targets(p_references text[])
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
    'lastSourceAt', private.commitment_latest_source(actor, t.id)))
    FROM (SELECT DISTINCT ref FROM unnest(p_references) AS ref) refs
    CROSS JOIN LATERAL private.commitment_lifecycle_targets(actor, refs.ref) t), '[]'::jsonb);
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
    RETURN public.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
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

  IF p_id IS NULL THEN
    SELECT count(*), count(*) FILTER (WHERE (
      (t.origin_sender = sender AND t.origin_account_id IS NOT DISTINCT FROM source.source_account_id) OR
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
      AND (t.origin_account_id IS NOT DISTINCT FROM source.source_account_id OR t.origin_sender IS DISTINCT FROM sender) AS permitted) permission;
    IF target_count > 8 OR authorized_count <> 1 OR matches_target IS DISTINCT FROM true
      OR (source.received_at > private.commitment_latest_source(actor, p_id)) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Detection authority or chronology changed' USING ERRCODE = 'PT409'; END IF;
  END IF;

  receipt := public.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
  IF p_id IS NULL AND case_ref IS NOT NULL THEN
    UPDATE private.commitments SET detection_reference = case_ref
      WHERE user_id = actor AND id = (receipt->>'id')::uuid;
  END IF;
  RETURN receipt;
END;
$$;

REVOKE ALL ON FUNCTION private.commitment_subject_reference(text), private.commitment_case_key(uuid,text,text),
  private.commitment_lifecycle_targets(uuid,text),
  private.commitment_latest_source(uuid,uuid), public.read_commitment_lifecycle_targets(text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_commitment_lifecycle_targets(text[]) TO authenticated;

COMMIT;
