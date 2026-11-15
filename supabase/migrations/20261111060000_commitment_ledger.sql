BEGIN;

CREATE TABLE private.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_key text NOT NULL CHECK (reference_key ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, id),
  UNIQUE (user_id, reference_key)
);
CREATE INDEX commitments_user_created ON private.commitments (user_id, created_at DESC, id DESC);

CREATE TABLE private.commitment_revisions (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  request_key uuid NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  kind text NOT NULL CHECK (kind IN ('created', 'revised', 'review_flagged')),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  changed_fields text[] NOT NULL,
  anchors jsonb NOT NULL CHECK (jsonb_typeof(anchors) = 'array' AND jsonb_array_length(anchors) BETWEEN 1 AND 3),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, commitment_id, version),
  UNIQUE (user_id, request_key),
  FOREIGN KEY (user_id, commitment_id) REFERENCES private.commitments (user_id, id) ON DELETE CASCADE
);

-- A head pointer can only commit together with its matching revision.
ALTER TABLE private.commitments ADD CONSTRAINT commitments_head_revision
  FOREIGN KEY (user_id, id, version) REFERENCES private.commitment_revisions (user_id, commitment_id, version)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE private.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.commitment_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.commitments, private.commitment_revisions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.commitment_state(input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  due_on date;
  due_at timestamptz;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR octet_length(input::text) > 4096 OR
     input - ARRAY['title','ownerName','ownerEmail','dueOn','dueAt','status'] <> '{}'::jsonb OR
     NOT (input ?& ARRAY['title','ownerName','ownerEmail','dueOn','dueAt','status']) OR
     jsonb_typeof(input->'title') <> 'string' OR length(btrim(input->>'title')) NOT BETWEEN 1 AND 200 OR
     (input->>'title') !~ '[^[:space:]]' OR
     jsonb_typeof(input->'ownerName') NOT IN ('null','string') OR
     length(btrim(input->>'ownerName')) NOT BETWEEN 1 AND 120 OR
     (input->>'ownerName') !~ '[^[:space:]]' OR
     jsonb_typeof(input->'ownerEmail') NOT IN ('null','string') OR
     length(input->>'ownerEmail') > 254 OR
     (input->>'ownerEmail') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     jsonb_typeof(input->'dueOn') NOT IN ('null','string') OR
     jsonb_typeof(input->'dueAt') NOT IN ('null','string') OR
     (input->>'dueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
     (input->>'dueAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' OR
     (input->>'dueOn' IS NOT NULL AND input->>'dueAt' IS NOT NULL) OR
     COALESCE(input->>'status','') NOT IN ('open','completed','cancelled') THEN
    RAISE EXCEPTION 'Invalid commitment state' USING ERRCODE = '22023';
  END IF;

  due_on := (input->>'dueOn')::date;
  due_at := (input->>'dueAt')::timestamptz;
  -- Reject calendar rollover (e.g. 24:00) and make the stored instant independent of session timezone.
  IF (input->>'dueAt') ~ 'T(2[4-9]|[3-9][0-9]):' THEN
    RAISE EXCEPTION 'Invalid commitment deadline' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'title', btrim(input->>'title'), 'ownerName', btrim(input->>'ownerName'), 'ownerEmail', input->>'ownerEmail',
    'dueOn', to_char(due_on, 'YYYY-MM-DD'),
    'dueAt', to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'status', input->>'status', 'review', NULL
  );
END;
$$;

-- Store anchors and hashes without retaining an extra copy of email text.
-- Source identifiers survive message removal so the history can report the loss.
CREATE FUNCTION private.commitment_anchors(p_user uuid, p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  item jsonb;
  anchor jsonb;
  anchors jsonb := '[]'::jsonb;
  email_id uuid;
  field text;
  quote text;
  source_text text;
  start_at integer;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
       item - ARRAY['emailId','field','quote'] <> '{}'::jsonb OR
       jsonb_typeof(item->'emailId') IS DISTINCT FROM 'string' OR
       COALESCE(item->>'field','') NOT IN ('subject','body_text') OR
       jsonb_typeof(item->'quote') IS DISTINCT FROM 'string' OR
       length(item->>'quote') NOT BETWEEN 1 AND 480 OR (item->>'quote') !~ '[^[:space:]]' THEN
      RAISE EXCEPTION 'Invalid commitment evidence' USING ERRCODE = '22023';
    END IF;
    email_id := (item->>'emailId')::uuid;
    field := item->>'field';
    quote := item->>'quote';
    SELECT CASE field WHEN 'subject' THEN e.subject ELSE e.body_text END INTO source_text
    FROM public.emails e
    WHERE e.id = email_id AND e.user_id = p_user AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commitment source unavailable' USING ERRCODE = 'PT404'; END IF;
    start_at := strpos(COALESCE(source_text, ''), quote);
    IF start_at = 0 THEN RAISE EXCEPTION 'Commitment quote does not match source' USING ERRCODE = 'PT422'; END IF;
    anchor := jsonb_build_object(
      'emailId', email_id, 'field', field, 'start', start_at, 'length', length(quote),
      'hash', encode(sha256(convert_to(quote, 'UTF8')), 'hex')
    );
    IF anchors @> jsonb_build_array(anchor) THEN
      RAISE EXCEPTION 'Duplicate commitment evidence' USING ERRCODE = '22023';
    END IF;
    anchors := anchors || jsonb_build_array(anchor);
  END LOOP;
  RETURN anchors;
END;
$$;

CREATE FUNCTION public.save_commitment(
  p_request_key uuid, p_id uuid, p_version integer, p_reference_key text,
  p_state jsonb, p_review jsonb, p_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  head private.commitments;
  previous private.commitment_revisions;
  receipt private.commitment_revisions;
  new_state jsonb;
  anchors jsonb;
  command_hash bytea;
  kind text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_request_key IS NULL OR p_request_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
     jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR octet_length(p_evidence::text) > 8192 OR
     octet_length(p_state::text) > 4096 OR octet_length(p_review::text) > 2048 THEN
    RAISE EXCEPTION 'Invalid commitment command' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 3 OR
     (p_id IS NULL AND (p_version IS NOT NULL OR p_reference_key IS NULL OR
      p_reference_key !~ '^[a-z0-9][a-z0-9._:-]{0,119}$' OR p_state IS NULL OR p_review IS NOT NULL)) OR
     (p_id IS NOT NULL AND (p_reference_key IS NOT NULL OR p_version IS NULL OR p_version < 1 OR
      (p_state IS NULL) = (p_review IS NULL))) THEN
    RAISE EXCEPTION 'Invalid commitment command' USING ERRCODE = '22023';
  END IF;

  command_hash := sha256(convert_to(jsonb_build_array(p_id,p_version,p_reference_key,p_state,p_review,p_evidence)::text, 'UTF8'));
  -- Serialize a request key even before it has a stored receipt.
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor::text || ':' || p_request_key::text, 0));
  SELECT * INTO receipt FROM private.commitment_revisions WHERE user_id = actor AND request_key = p_request_key;
  IF FOUND THEN
    IF receipt.request_hash <> command_hash THEN RAISE EXCEPTION 'Commitment request key reused' USING ERRCODE = 'PT409'; END IF;
    RETURN jsonb_build_object('id', receipt.commitment_id, 'version', receipt.version, 'replayed', true);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO private.commitments (user_id, reference_key, version) VALUES (actor, p_reference_key, 1)
    ON CONFLICT (user_id, reference_key) DO NOTHING RETURNING * INTO head;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commitment reference already exists' USING ERRCODE = 'PT409'; END IF;
    kind := 'created';
  ELSE
    SELECT * INTO head FROM private.commitments WHERE user_id = actor AND id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE = 'PT404'; END IF;
    IF head.version <> p_version THEN RAISE EXCEPTION 'Commitment version conflict' USING ERRCODE = 'PT409'; END IF;
    SELECT * INTO STRICT previous FROM private.commitment_revisions
    WHERE user_id = actor AND commitment_id = p_id AND version = head.version;
    head.version := head.version + 1;
    kind := 'revised';
  END IF;

  IF p_review IS NULL THEN
    new_state := private.commitment_state(p_state);
  ELSE
    IF jsonb_typeof(p_review) IS DISTINCT FROM 'object' OR
       p_review - ARRAY['kind','note'] <> '{}'::jsonb OR
       COALESCE(p_review->>'kind','') NOT IN ('ambiguous','conflicting') OR
       jsonb_typeof(p_review->'note') IS DISTINCT FROM 'string' OR
       length(btrim(p_review->>'note')) NOT BETWEEN 1 AND 500 OR (p_review->>'note') !~ '[^[:space:]]' THEN
      RAISE EXCEPTION 'Invalid commitment review' USING ERRCODE = '22023';
    END IF;
    new_state := jsonb_set(previous.state, '{review}',
      jsonb_build_object('kind', p_review->>'kind', 'note', btrim(p_review->>'note')));
    kind := 'review_flagged';
  END IF;

  anchors := private.commitment_anchors(actor, p_evidence);
  IF p_review->>'kind' = 'conflicting' AND
     (SELECT count(DISTINCT value->>'emailId') FROM jsonb_array_elements(anchors)) < 2 THEN
    RAISE EXCEPTION 'Conflicting evidence requires distinct emails' USING ERRCODE = 'PT422';
  END IF;
  IF new_state = previous.state AND anchors = previous.anchors THEN
    RAISE EXCEPTION 'Commitment revision has no changes' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO private.commitment_revisions (user_id, commitment_id, version, request_key, request_hash, kind, state, changed_fields, anchors)
  VALUES (actor, head.id, head.version, p_request_key, command_hash, kind, new_state,
    ARRAY(SELECT key FROM jsonb_each(new_state)
      WHERE previous.state->key IS DISTINCT FROM new_state->key ORDER BY key), anchors);
  IF p_id IS NOT NULL THEN
    UPDATE private.commitments SET version = head.version WHERE user_id = actor AND id = head.id;
  END IF;

  RETURN jsonb_build_object('id', head.id, 'version', head.version, 'replayed', false);
END;
$$;

CREATE FUNCTION private.commitment_sources(p_user uuid, p_anchors jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'emailId', a.anchor->>'emailId', 'field', a.anchor->>'field',
    'availability', CASE WHEN e.id IS NULL THEN 'unavailable' WHEN checked.matches THEN 'available' ELSE 'changed' END,
    'href', CASE WHEN e.id IS NOT NULL THEN '/inbox?email=' || e.id::text END,
    'subject', e.subject, 'receivedAt', e.received_at,
    'quote', CASE WHEN checked.matches THEN excerpt.quote END
  ) ORDER BY a.ordinality)
  FROM jsonb_array_elements(p_anchors) WITH ORDINALITY AS a(anchor, ordinality)
  LEFT JOIN public.emails e ON e.id = (a.anchor->>'emailId')::uuid AND e.user_id = p_user
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  CROSS JOIN LATERAL (
    SELECT substr(CASE a.anchor->>'field' WHEN 'subject' THEN e.subject ELSE e.body_text END,
      (a.anchor->>'start')::integer, (a.anchor->>'length')::integer) AS quote
  ) AS excerpt
  CROSS JOIN LATERAL (
    SELECT encode(sha256(convert_to(excerpt.quote, 'UTF8')), 'hex') = a.anchor->>'hash' AS matches
  ) AS checked
$$;

CREATE FUNCTION public.list_commitments(p_limit integer, p_before_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  before_at timestamptz;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE = '22023'; END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT created_at INTO before_at FROM private.commitments WHERE user_id = actor AND id = p_before_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commitment page unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;
  WITH heads AS (
    SELECT c.id, c.reference_key, c.version, c.created_at, r.recorded_at, r.state
    FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,c.version)
    WHERE c.user_id = actor AND (p_before_id IS NULL OR (c.created_at,c.id) < (before_at,p_before_id))
    ORDER BY c.created_at DESC,c.id DESC LIMIT p_limit + 1
  ), page AS (
    SELECT * FROM heads ORDER BY created_at DESC,id DESC LIMIT p_limit
  )
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'referenceKey',reference_key,'version',version,'createdAt',created_at,'updatedAt',recorded_at,'state',state
  ) ORDER BY created_at DESC,id DESC) FROM page), '[]'::jsonb),
    'nextBeforeId', CASE WHEN (SELECT count(*) FROM heads) > p_limit
      THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) END) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.read_commitment(p_id uuid, p_limit integer, p_before_version integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  head private.commitments;
  current_revision private.commitment_revisions;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_before_version < 1 THEN
    RAISE EXCEPTION 'Invalid history page' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO head FROM private.commitments WHERE user_id = actor AND id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO STRICT current_revision FROM private.commitment_revisions
  WHERE user_id = actor AND commitment_id = head.id AND version = head.version;

  WITH revisions AS (
    SELECT version,kind,state,changed_fields,anchors,recorded_at FROM private.commitment_revisions
    WHERE user_id = actor AND commitment_id = head.id AND (p_before_version IS NULL OR version < p_before_version)
    ORDER BY version DESC LIMIT p_limit + 1
  ), page AS (
    SELECT * FROM revisions ORDER BY version DESC LIMIT p_limit
  )
  SELECT jsonb_build_object('id', head.id, 'referenceKey', head.reference_key, 'version', head.version,
    'createdAt', head.created_at, 'updatedAt', current_revision.recorded_at, 'state', current_revision.state,
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'version',version,'kind',kind,'state',state,'changedFields',changed_fields,'recordedAt',recorded_at,
      'sources',private.commitment_sources(actor,anchors)
    ) ORDER BY version DESC) FROM page), '[]'::jsonb),
    'nextBeforeVersion', CASE WHEN (SELECT count(*) FROM revisions) > p_limit THEN (SELECT min(version) FROM page) END
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.commitment_state(jsonb), private.commitment_anchors(uuid,jsonb),
  private.commitment_sources(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb),
  public.list_commitments(integer,uuid), public.read_commitment(uuid,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_commitment(uuid,uuid,integer,text,jsonb,jsonb,jsonb),
  public.list_commitments(integer,uuid), public.read_commitment(uuid,integer,integer) TO authenticated;

COMMIT;
