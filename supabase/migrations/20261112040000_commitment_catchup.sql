BEGIN;

CREATE TABLE private.commitment_catchup (
  email_id uuid PRIMARY KEY REFERENCES public.emails(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid,
  reference text,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  scan_at timestamptz NOT NULL,
  hashes text[],
  dismissed text[] NOT NULL DEFAULT '{}'
);
ALTER TABLE private.commitment_catchup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.commitment_catchup FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX commitment_catchup_work ON private.commitment_catchup(user_id, queued_at, email_id) WHERE hashes IS NULL;
CREATE INDEX commitment_catchup_review ON private.commitment_catchup(user_id, scan_at DESC, email_id DESC);
CREATE INDEX commitment_catchup_account ON private.commitment_catchup(user_id, account_id) WHERE hashes IS NULL;

CREATE FUNCTION private.enqueue_commitment_catchup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (NEW.user_id,NEW.source_account_id,NEW.subject,NEW.body_text,NEW.from_address,NEW.from_name,
      NEW.received_at,NEW.created_at,NEW.direction,NEW.provider_deleted,NEW.is_deleted)
     IS NOT DISTINCT FROM
     (OLD.user_id,OLD.source_account_id,OLD.subject,OLD.body_text,OLD.from_address,OLD.from_name,
      OLD.received_at,OLD.created_at,OLD.direction,OLD.provider_deleted,OLD.is_deleted)
  THEN RETURN NULL; END IF;
  IF NEW.direction = 'inbound' AND NOT NEW.provider_deleted AND NEW.is_deleted IS NOT TRUE
     AND NEW.body_text IS NOT NULL AND NEW.body_text <> '' THEN
    INSERT INTO private.commitment_catchup(email_id,user_id,account_id,reference,scan_at)
    VALUES (NEW.id,NEW.user_id,NEW.source_account_id,private.commitment_subject_reference(NEW.subject),
      COALESCE(NEW.received_at,NEW.created_at,'-infinity'::timestamptz))
    ON CONFLICT (email_id) DO UPDATE SET user_id = EXCLUDED.user_id, account_id = EXCLUDED.account_id,
      reference = EXCLUDED.reference, token = gen_random_uuid(), queued_at = clock_timestamp(),
      scan_at = EXCLUDED.scan_at, hashes = NULL, dismissed = '{}';
  ELSE
    DELETE FROM private.commitment_catchup WHERE email_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_commitment_catchup() FROM PUBLIC;
CREATE TRIGGER commitment_catchup_source AFTER INSERT OR UPDATE OF
  user_id,source_account_id,subject,body_text,from_address,from_name,received_at,created_at,direction,provider_deleted,is_deleted
  ON public.emails FOR EACH ROW EXECUTE FUNCTION private.enqueue_commitment_catchup();

INSERT INTO private.commitment_catchup(email_id,user_id,account_id,reference,scan_at)
SELECT id,user_id,source_account_id,private.commitment_subject_reference(subject),
  COALESCE(received_at,created_at,'-infinity'::timestamptz)
FROM public.emails
WHERE direction = 'inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE AND body_text <> '';

CREATE FUNCTION public.pending_commitment_catchup(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',w.email_id,'token',w.token,'sender',e.from_address,'body',left(e.body_text,8001),'receivedAt',e.received_at)
    ORDER BY w.queued_at,w.email_id), '[]'::jsonb)
  FROM (
    SELECT email_id,token,queued_at FROM private.commitment_catchup
    WHERE user_id = p_actor AND hashes IS NULL ORDER BY queued_at,email_id LIMIT 160
  ) w JOIN public.emails e ON e.id = w.email_id AND e.user_id = p_actor
$$;

CREATE FUNCTION public.finish_commitment_catchup(p_actor uuid, p_results jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  IF jsonb_typeof(p_results) IS DISTINCT FROM 'array' OR jsonb_array_length(p_results) > 160 THEN
    RAISE EXCEPTION 'Invalid analysis batch' USING ERRCODE = '22023';
  END IF;
  WITH results AS MATERIALIZED (
    SELECT id,token,hashes FROM jsonb_to_recordset(p_results) AS r(id uuid,token uuid,hashes text[])
    WHERE cardinality(hashes) <= 4 AND NOT EXISTS (
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

CREATE FUNCTION public.read_commitment_catchup(p_accounts uuid[],p_before_id uuid,p_source_id uuid,p_focus boolean)
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
          WHERE c.user_id = actor AND c.detection_reference = q.reference AND r.state->>'status' = 'open'
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

CREATE FUNCTION public.read_commitment_catchup_status(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF cardinality(p_accounts) > 50 THEN RAISE EXCEPTION 'Invalid accounts' USING ERRCODE = '22023'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',a.id,'email',a.email_address,'lastSyncAt',a.last_sync_at,'status',a.sync_status,
      'waitingAnalysis',(SELECT count(*) FROM private.commitment_catchup q
        WHERE q.user_id = actor AND q.account_id = a.id AND q.hashes IS NULL)
    ) ORDER BY a.email_address,a.id),'[]'::jsonb)
    FROM public.source_accounts a WHERE a.user_id = actor AND a.is_active
      AND (COALESCE(cardinality(p_accounts),0) = 0 OR a.id = ANY(p_accounts))
  );
END;
$$;

CREATE FUNCTION public.dismiss_commitment_catchup(p_email uuid,p_token uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  UPDATE private.commitment_catchup SET dismissed = CASE WHEN p_hash = ANY(dismissed)
    THEN dismissed ELSE array_append(dismissed,p_hash) END
  WHERE user_id = actor AND email_id = p_email AND token = p_token AND p_hash = ANY(hashes);
  IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable or changed' USING ERRCODE = 'PT409'; END IF;
  RETURN '{"dismissed":true}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.pending_commitment_catchup(uuid),public.finish_commitment_catchup(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pending_commitment_catchup(uuid),public.finish_commitment_catchup(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.read_commitment_catchup(uuid[],uuid,uuid,boolean),
  public.read_commitment_catchup_status(uuid[]),public.dismiss_commitment_catchup(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_commitment_catchup(uuid[],uuid,uuid,boolean),
  public.read_commitment_catchup_status(uuid[]),public.dismiss_commitment_catchup(uuid,uuid,text) TO authenticated;

COMMIT;
