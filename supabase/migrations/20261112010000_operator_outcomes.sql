BEGIN;

CREATE TABLE private.operator_email_revisions (
  email_id uuid PRIMARY KEY REFERENCES public.emails(id) ON DELETE CASCADE,
  revision uuid NOT NULL
);

CREATE TABLE private.operator_effects (
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  email_id uuid NOT NULL,
  before_flag boolean,
  applied_revision uuid NOT NULL,
  applied_fingerprint text NOT NULL,
  PRIMARY KEY (user_id,plan_id,email_id),
  FOREIGN KEY (user_id,plan_id) REFERENCES private.operator_plans(user_id,id) ON DELETE CASCADE
);

CREATE TABLE private.operator_outcome_events (
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  request_key uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('verified','undone','undo_blocked')),
  matched integer NOT NULL CHECK (matched BETWEEN 0 AND 40),
  changed integer NOT NULL CHECK (changed BETWEEN 0 AND 40),
  unavailable integer NOT NULL CHECK (unavailable BETWEEN 0 AND 40),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,plan_id,request_key),
  FOREIGN KEY (user_id,plan_id) REFERENCES private.operator_plans(user_id,id) ON DELETE CASCADE,
  CHECK (matched + changed + unavailable BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX operator_one_undo ON private.operator_outcome_events(user_id,plan_id) WHERE event = 'undone';
CREATE INDEX operator_recent_outcomes ON private.operator_outcome_events(user_id,plan_id,recorded_at DESC,request_key DESC);

ALTER TABLE private.operator_email_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operator_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operator_outcome_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_email_revisions,private.operator_effects,private.operator_outcome_events
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operator_bump_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO private.operator_email_revisions(email_id,revision) VALUES(NEW.id,gen_random_uuid())
    ON CONFLICT (email_id) DO UPDATE SET revision = EXCLUDED.revision;
  RETURN NEW;
END;
$$;

CREATE TRIGGER operator_bump_revision AFTER UPDATE OF is_read,is_archived,is_deleted,provider_deleted,user_id,source_account_id,direction
  ON public.emails FOR EACH ROW WHEN (
    (OLD.is_read,OLD.is_archived,OLD.is_deleted,OLD.provider_deleted,OLD.user_id,OLD.source_account_id,OLD.direction)
    IS DISTINCT FROM
    (NEW.is_read,NEW.is_archived,NEW.is_deleted,NEW.provider_deleted,NEW.user_id,NEW.source_account_id,NEW.direction)
  ) EXECUTE FUNCTION private.operator_bump_revision();

CREATE FUNCTION private.operator_outcome_targets(p private.operator_plans)
RETURNS TABLE(email_id uuid,tracked boolean,before_flag boolean,state text)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT ids.email_id,f.email_id IS NOT NULL,f.before_flag,
    CASE WHEN e.id IS NULL THEN 'unavailable'
      WHEN (CASE WHEN p.spec->>'action' = 'archive' THEN e.is_archived ELSE e.is_read END) IS NOT TRUE
        OR (f.email_id IS NOT NULL AND (r.revision IS DISTINCT FROM f.applied_revision
          OR private.operator_fingerprint(e,p.spec->>'action') IS DISTINCT FROM f.applied_fingerprint))
        THEN 'changed'
      ELSE 'matched' END
  FROM unnest(p.approved_ids) AS ids(email_id)
  LEFT JOIN private.operator_effects f ON f.user_id = p.user_id AND f.plan_id = p.id AND f.email_id = ids.email_id
  LEFT JOIN public.emails e ON e.user_id = p.user_id AND e.id = ids.email_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND private.ask_scope(e,p.user_id,'{}')
  LEFT JOIN private.operator_email_revisions r ON r.email_id = e.id
$$;

CREATE FUNCTION private.operator_outcome_receipt(ev private.operator_outcome_events, replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id',ev.request_key,'event',ev.event,'at',ev.recorded_at,
    'matched',ev.matched,'changed',ev.changed,'unavailable',ev.unavailable,'replayed',replayed)
$$;

CREATE FUNCTION private.operator_undo_hash(p private.operator_plans)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array('undo',p.id,p.approved_hash)::text,'UTF8')),'hex')
$$;

-- Keep the existing validation, approval and execute semantics behind the new receipt boundary.
ALTER FUNCTION public.operator_plan_action(uuid,text,text,uuid[]) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.operator_plan_action(uuid,text,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.operator_plan_action(p_id uuid,p_phase text,p_scope_hash text,p_selected uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  plan private.operator_plans;
  snapshot jsonb;
  result jsonb;
  saved integer;
BEGIN
  IF p_phase IS DISTINCT FROM 'execute' OR p_selected IS NOT NULL OR actor IS NULL THEN
    RETURN private.operator_plan_action(p_id,p_phase,p_scope_hash,p_selected);
  END IF;
  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND id = p_id FOR UPDATE;
  IF NOT FOUND OR plan.status <> 'approved' OR plan.approved_hash IS DISTINCT FROM p_scope_hash
    OR plan.expires_at <= clock_timestamp() THEN
    RETURN private.operator_plan_action(p_id,p_phase,p_scope_hash,p_selected);
  END IF;

  PERFORM 1 FROM public.emails e WHERE e.user_id = actor AND e.id = ANY(plan.approved_ids) ORDER BY e.id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',e.id,'before',
    CASE WHEN plan.spec->>'action' = 'archive' THEN e.is_archived ELSE e.is_read END)) INTO snapshot
  FROM public.emails e WHERE e.user_id = actor AND e.id = ANY(plan.approved_ids);

  result := private.operator_plan_action(p_id,p_phase,p_scope_hash,p_selected);
  IF result->>'status' = 'executed' AND result->>'replayed' = 'false' THEN
    INSERT INTO private.operator_effects(user_id,plan_id,email_id,before_flag,applied_revision,applied_fingerprint)
    SELECT actor,plan.id,e.id,(s.item->>'before')::boolean,r.revision,private.operator_fingerprint(e,plan.spec->>'action')
    FROM jsonb_array_elements(snapshot) AS s(item)
    JOIN public.emails e ON e.id = (s.item->>'id')::uuid AND e.user_id = actor
    JOIN private.operator_email_revisions r ON r.email_id = e.id;
    GET DIAGNOSTICS saved = ROW_COUNT;
    IF saved <> cardinality(plan.approved_ids) OR EXISTS (
      SELECT 1 FROM private.operator_outcome_targets(plan) t WHERE t.state <> 'matched' OR NOT t.tracked
    ) THEN RAISE EXCEPTION 'Operator execution verification failed'; END IF;
    INSERT INTO private.operator_outcome_events(user_id,plan_id,request_key,event,matched,changed,unavailable)
      VALUES(actor,plan.id,gen_random_uuid(),'verified',saved,0,0);
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.operator_outcome_action(p_id uuid,p_operation text,p_request_key uuid,p_undo_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  plan private.operator_plans;
  receipt private.operator_outcome_events;
  tracked_count integer;
  matches integer;
  changes integer;
  missing integer;
  written integer;
  event_name text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR p_request_key IS NULL OR p_request_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR COALESCE(p_operation,'') NOT IN ('verify','undo')
    OR (p_operation = 'verify' AND p_undo_hash IS NOT NULL)
    OR (p_operation = 'undo' AND COALESCE(p_undo_hash,'') !~ '^[0-9a-f]{64}$')
  THEN RAISE EXCEPTION 'Invalid operator outcome request' USING ERRCODE = '22023'; END IF;

  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE = 'PT404'; END IF;
  IF plan.status <> 'executed' OR (p_operation = 'undo' AND p_undo_hash <> private.operator_undo_hash(plan))
    THEN RAISE EXCEPTION 'Execution receipt or undo scope required' USING ERRCODE = 'PT409'; END IF;

  SELECT * INTO receipt FROM private.operator_outcome_events WHERE user_id = actor AND plan_id = p_id AND request_key = p_request_key;
  IF FOUND THEN
    IF (receipt.event = 'verified') <> (p_operation = 'verify')
      THEN RAISE EXCEPTION 'Outcome key reused' USING ERRCODE = 'PT409'; END IF;
    RETURN private.operator_outcome_receipt(receipt,true);
  END IF;
  SELECT * INTO receipt FROM private.operator_outcome_events WHERE user_id = actor AND plan_id = p_id AND event = 'undone';
  IF FOUND THEN
    IF p_operation = 'undo' THEN RETURN private.operator_outcome_receipt(receipt,true); END IF;
    RAISE EXCEPTION 'Execution was already undone' USING ERRCODE = 'PT409';
  END IF;

  IF p_operation = 'undo' THEN
    PERFORM 1 FROM public.emails e WHERE e.user_id = actor AND e.id = ANY(plan.approved_ids) ORDER BY e.id FOR UPDATE;
  END IF;
  SELECT count(*) FILTER (WHERE tracked),count(*) FILTER (WHERE state = 'matched'),
    count(*) FILTER (WHERE state = 'changed'),count(*) FILTER (WHERE state = 'unavailable')
    INTO tracked_count,matches,changes,missing FROM private.operator_outcome_targets(plan);
  event_name := 'verified';

  IF p_operation = 'undo' THEN
    IF tracked_count <> cardinality(plan.approved_ids) THEN
      RAISE EXCEPTION 'Original state unavailable for undo' USING ERRCODE = 'PT409';
    END IF;
    event_name := 'undo_blocked';
    IF matches = cardinality(plan.approved_ids) THEN
      IF plan.spec->>'action' = 'archive' THEN
        UPDATE public.emails e SET is_archived = f.before_flag FROM private.operator_effects f
        WHERE f.user_id = actor AND f.plan_id = p_id AND e.user_id = actor AND e.id = f.email_id AND e.id = ANY(plan.approved_ids);
      ELSE
        UPDATE public.emails e SET is_read = f.before_flag FROM private.operator_effects f
        WHERE f.user_id = actor AND f.plan_id = p_id AND e.user_id = actor AND e.id = f.email_id AND e.id = ANY(plan.approved_ids);
      END IF;
      GET DIAGNOSTICS written = ROW_COUNT;
      IF written <> cardinality(plan.approved_ids) OR EXISTS (
        SELECT 1 FROM private.operator_effects f JOIN public.emails e ON e.user_id = actor AND e.id = f.email_id
        WHERE f.user_id = actor AND f.plan_id = p_id AND f.before_flag IS DISTINCT FROM
          (CASE WHEN plan.spec->>'action' = 'archive' THEN e.is_archived ELSE e.is_read END)
      ) THEN RAISE EXCEPTION 'Operator undo verification failed'; END IF;
      event_name := 'undone';
    END IF;
  END IF;

  INSERT INTO private.operator_outcome_events(user_id,plan_id,request_key,event,matched,changed,unavailable)
    VALUES(actor,p_id,p_request_key,event_name,matches,changes,missing) RETURNING * INTO receipt;
  RETURN private.operator_outcome_receipt(receipt,false);
END;
$$;

ALTER FUNCTION public.read_operator_plan(uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.read_operator_plan(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_operator_plan(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb := private.read_operator_plan(p_id);
  actor uuid := auth.uid();
  plan private.operator_plans;
  outcome jsonb;
BEGIN
  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND id = p_id;
  IF plan.status = 'executed' THEN
    WITH targets AS MATERIALIZED (SELECT * FROM private.operator_outcome_targets(plan))
    SELECT jsonb_build_object(
      'tracked',(SELECT bool_and(tracked) FROM targets),
      'undoHash',CASE WHEN (SELECT bool_and(tracked) FROM targets) THEN private.operator_undo_hash(plan) END,
      'undone',EXISTS (SELECT 1 FROM private.operator_outcome_events WHERE user_id = actor AND plan_id = p_id AND event = 'undone'),
      'targets',(SELECT jsonb_agg(jsonb_build_object('id',email_id,'before',before_flag,'state',state) ORDER BY email_id) FROM targets),
      'events',COALESCE((SELECT jsonb_agg(private.operator_outcome_receipt(ev,false) ORDER BY ev.recorded_at DESC,ev.request_key DESC)
        FROM (SELECT * FROM private.operator_outcome_events WHERE user_id = actor AND plan_id = p_id
          ORDER BY recorded_at DESC,request_key DESC LIMIT 20) ev),'[]')
    ) INTO outcome;
  END IF;
  RETURN result || jsonb_build_object('outcome',outcome);
END;
$$;

REVOKE ALL ON FUNCTION private.operator_bump_revision(),private.operator_outcome_targets(private.operator_plans),
  private.operator_outcome_receipt(private.operator_outcome_events,boolean),private.operator_undo_hash(private.operator_plans),
  public.operator_plan_action(uuid,text,text,uuid[]),public.operator_outcome_action(uuid,text,uuid,text),
  public.read_operator_plan(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_plan_action(uuid,text,text,uuid[]),public.operator_outcome_action(uuid,text,uuid,text),
  public.read_operator_plan(uuid) TO authenticated;

COMMIT;
