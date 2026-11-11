BEGIN;

CREATE INDEX emails_commitment_scan ON public.emails
  (user_id, (COALESCE(created_at, '-infinity'::timestamptz)), id)
  WHERE NOT provider_deleted AND is_deleted IS NOT TRUE;
CREATE INDEX commitment_revision_anchors ON private.commitment_revisions USING gin (anchors jsonb_path_ops);

CREATE FUNCTION private.commitment_detection_fingerprint(e public.emails)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(e.source_account_id, e.from_address, e.from_name,
    left(e.subject, 501), left(e.body_text, 8001), e.received_at AT TIME ZONE 'UTC', e.created_at AT TIME ZONE 'UTC')::text, 'UTF8')), 'hex')
$$;

CREATE FUNCTION public.scan_commitment_mail(p_before_id uuid)
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
        'fingerprint',private.commitment_detection_fingerprint(e),
        'used',EXISTS (SELECT 1 FROM private.commitment_revisions r WHERE r.user_id = actor
          AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',e.id)))
      ) ORDER BY page.scan_at DESC,page.id DESC)
        FROM page JOIN public.emails e ON e.id = page.id AND e.user_id = actor),'[]'::jsonb),
      'nextBeforeId', CASE WHEN (SELECT count(*) FROM batch) > 24
        THEN (SELECT id FROM page ORDER BY scan_at,id LIMIT 1) END)
  );
END;
$$;

CREATE FUNCTION public.read_commitment_detection_targets(p_references text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_references IS NULL OR cardinality(p_references) > 24 OR EXISTS (
    SELECT 1 FROM unnest(p_references) AS ref WHERE ref IS NULL OR ref !~ '^mail:[0-9a-f]{64}$'
  ) THEN RAISE EXCEPTION 'Invalid detection references' USING ERRCODE = '22023'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'referenceKey',c.reference_key,'id',c.id,'version',c.version,'state',r.state,
    'lastSourceAt',(SELECT CASE WHEN count(*) = count(COALESCE(e.received_at,e.created_at))
        THEN max(COALESCE(e.received_at,e.created_at)) END
      FROM private.commitment_revisions history
      CROSS JOIN LATERAL jsonb_array_elements(history.anchors) AS a(anchor)
      LEFT JOIN public.emails e ON e.id = (a.anchor->>'emailId')::uuid AND e.user_id = actor
      WHERE history.user_id = actor AND history.commitment_id = c.id)
  ))
  FROM private.commitments c JOIN private.commitment_revisions r
    ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,c.version)
  WHERE c.user_id = actor AND c.reference_key = ANY(p_references)),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.confirm_commitment_detection(
  p_request_key uuid, p_email_id uuid, p_fingerprint text, p_id uuid, p_version integer,
  p_reference_key text, p_state jsonb, p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  source public.emails;
  create_reference text := CASE WHEN p_id IS NULL THEN p_reference_key END;
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

  -- Serialize source use first, then take the existing ledger request lock in the same order.
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor::text || ':' || p_email_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor::text || ':' || p_request_key::text, 0));
  IF EXISTS (SELECT 1 FROM private.commitment_revisions r
    WHERE r.user_id = actor AND r.request_key = p_request_key
      AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',p_email_id,'field','body_text')))
  THEN
    -- save_commitment checks that the entire command matches the stored receipt.
    RETURN public.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
  END IF;

  SELECT * INTO source FROM public.emails e WHERE e.user_id = actor AND e.id = p_email_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Detection source unavailable' USING ERRCODE = 'PT404'; END IF;
  IF private.commitment_detection_fingerprint(source) <> p_fingerprint OR EXISTS (
    SELECT 1 FROM private.commitment_revisions r WHERE r.user_id = actor
      AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',p_email_id))
  ) THEN RAISE EXCEPTION 'Detection changed or already reviewed' USING ERRCODE = 'PT409'; END IF;

  RETURN public.save_commitment(p_request_key,p_id,p_version,create_reference,p_state,NULL,p_evidence);
END;
$$;

REVOKE ALL ON FUNCTION private.commitment_detection_fingerprint(public.emails),
  public.scan_commitment_mail(uuid), public.read_commitment_detection_targets(text[]),
  public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_commitment_mail(uuid), public.read_commitment_detection_targets(text[]),
  public.confirm_commitment_detection(uuid,uuid,text,uuid,integer,text,jsonb,jsonb) TO authenticated;

COMMIT;
