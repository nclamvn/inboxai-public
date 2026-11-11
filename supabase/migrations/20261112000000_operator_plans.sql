BEGIN;

CREATE TABLE private.operator_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  spec jsonb NOT NULL,
  cutoff timestamptz,
  targets jsonb NOT NULL CHECK (jsonb_typeof(targets) = 'array' AND jsonb_array_length(targets) BETWEEN 1 AND 40),
  preview_hash text NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  approved_ids uuid[],
  approved_hash text CHECK (approved_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','approved','executed','stale','expired')),
  applied_count integer CHECK (applied_count BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id, request_key),
  UNIQUE (user_id, id),
  CHECK ((approved_ids IS NULL) = (approved_hash IS NULL)),
  CHECK (approved_ids IS NULL OR cardinality(approved_ids) BETWEEN 1 AND 40),
  CHECK (status NOT IN ('approved','executed') OR approved_hash IS NOT NULL),
  CHECK ((status = 'executed') = (applied_count IS NOT NULL)),
  CHECK (applied_count IS NULL OR applied_count = cardinality(approved_ids))
);
CREATE INDEX operator_plan_history ON private.operator_plans(user_id,created_at DESC,id DESC);

CREATE TABLE private.operator_events (
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('planned','approved','executed','stale','expired')),
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  target_count integer NOT NULL CHECK (target_count BETWEEN 1 AND 40),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,plan_id,event),
  FOREIGN KEY (user_id,plan_id) REFERENCES private.operator_plans(user_id,id) ON DELETE CASCADE
);
ALTER TABLE private.operator_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operator_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_plans,private.operator_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operator_attachment(e public.emails)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(e.attachment_count,0) > 0 OR EXISTS (SELECT 1 FROM public.attachments a WHERE a.email_id = e.id)
$$;

CREATE FUNCTION private.operator_fingerprint(e public.emails, p_action text)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(private.ask_answer_version(e),e.direction,e.is_archived,
    CASE WHEN p_action = 'mark_read' THEN e.is_read END,private.operator_attachment(e))::text,'UTF8')),'hex')
$$;

CREATE FUNCTION private.operator_eligible(e public.emails, actor uuid, p_spec jsonb, p_cutoff timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT e.user_id = actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
    AND e.direction = 'inbound' AND e.is_archived IS NOT TRUE
    AND (p_spec->>'action' <> 'mark_read' OR e.is_read IS NOT TRUE)
    AND private.ask_scope(e,actor,'{}')
    AND (p_spec->>'accountId' IS NULL OR e.source_account_id = (p_spec->>'accountId')::uuid)
    AND (p_cutoff IS NULL OR (isfinite(private.ask_date(e)) AND private.ask_date(e) < p_cutoff))
    AND (p_spec->>'sender' IS NULL OR lower(btrim(e.from_address)) = p_spec->>'sender')
    AND (NOT (p_spec->>'keepAttachments')::boolean OR NOT private.operator_attachment(e))
$$;

CREATE FUNCTION private.operator_receipt(p private.operator_plans, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id',p.id,'status',CASE WHEN p.status IN ('planned','approved') AND p.expires_at <= statement_timestamp()
    THEN 'expired' ELSE p.status END,'replayed',p_replayed,
    'previewHash',p.preview_hash,'approvedHash',p.approved_hash,'approvedIds',p.approved_ids,
    'appliedCount',p.applied_count,'expiresAt',p.expires_at)
$$;

CREATE FUNCTION public.create_operator_plan(
  p_request_key uuid,p_action text,p_account uuid,p_days integer,p_before date,p_sender text,p_keep_attachments boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  plan private.operator_plans;
  spec jsonb;
  cutoff timestamptz;
  snapshot jsonb;
  plan_id uuid := gen_random_uuid();
  scope_hash text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_request_key IS NULL OR p_request_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR COALESCE(p_action,'') NOT IN ('archive','mark_read') OR p_keep_attachments IS NULL
    OR num_nonnulls(p_days,p_before,p_sender) <> 1 OR p_days NOT BETWEEN 1 AND 365
    OR p_before NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    OR length(p_sender) > 254 OR p_sender !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN RAISE EXCEPTION 'Invalid operator plan' USING ERRCODE = '22023'; END IF;
  spec := jsonb_build_object('action',p_action,'accountId',p_account,'olderThanDays',p_days,
    'beforeDate',p_before,'sender',lower(p_sender),'keepAttachments',p_keep_attachments);
  PERFORM pg_advisory_xact_lock(hashtextextended('operator:' || actor::text || ':' || p_request_key::text,0));
  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND request_key = p_request_key;
  IF FOUND THEN
    IF plan.spec <> spec THEN RAISE EXCEPTION 'Plan request key reused' USING ERRCODE = 'PT409'; END IF;
    RETURN private.operator_receipt(plan,true);
  END IF;
  IF p_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.source_accounts WHERE user_id = actor AND id = p_account) THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE = 'PT404';
  END IF;

  cutoff := CASE WHEN p_days IS NOT NULL THEN statement_timestamp() - p_days * INTERVAL '24 hours'
    WHEN p_before IS NOT NULL THEN p_before::timestamp AT TIME ZONE INTERVAL '+07:00' END;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'fingerprint',private.operator_fingerprint(c.email,p_action))
    ORDER BY c.at,c.id),'[]') INTO snapshot FROM (
    SELECT e.id,e AS email,private.ask_date(e) AS at
    FROM public.emails e WHERE e.user_id = actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND private.operator_eligible(e,actor,spec,cutoff)
    ORDER BY at,e.id LIMIT 41
  ) c;
  IF jsonb_array_length(snapshot) = 0 THEN RETURN jsonb_build_object('status','empty'); END IF;
  IF jsonb_array_length(snapshot) > 40 THEN RETURN jsonb_build_object('status','too_broad'); END IF;
  scope_hash := encode(sha256(convert_to(jsonb_build_array(plan_id,spec,cutoff AT TIME ZONE 'UTC',snapshot)::text,'UTF8')),'hex');
  INSERT INTO private.operator_plans(id,user_id,request_key,spec,cutoff,targets,preview_hash,expires_at)
    VALUES(plan_id,actor,p_request_key,spec,cutoff,snapshot,scope_hash,clock_timestamp() + INTERVAL '15 minutes')
    RETURNING * INTO plan;
  INSERT INTO private.operator_events(user_id,plan_id,event,scope_hash,target_count)
    VALUES(actor,plan.id,'planned',scope_hash,jsonb_array_length(snapshot));
  RETURN private.operator_receipt(plan,false);
END;
$$;

CREATE FUNCTION private.operator_lock_and_check(p private.operator_plans, ids uuid[])
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE matches integer;
BEGIN
  -- Use the same lock order across plans and never re-run the original selection.
  PERFORM 1 FROM public.emails e WHERE e.user_id = p.user_id AND e.id = ANY(ids) ORDER BY e.id FOR UPDATE;
  SELECT count(*) INTO matches
  FROM jsonb_array_elements(p.targets) AS target(item)
  JOIN public.emails e ON e.id = (target.item->>'id')::uuid AND e.user_id = p.user_id
  WHERE e.id = ANY(ids) AND private.operator_eligible(e,p.user_id,p.spec,p.cutoff)
    AND private.operator_fingerprint(e,p.spec->>'action') = target.item->>'fingerprint';
  RETURN matches = cardinality(ids);
END;
$$;

CREATE FUNCTION public.operator_plan_action(p_id uuid,p_phase text,p_scope_hash text,p_selected uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  plan private.operator_plans;
  ids uuid[];
  approval text;
  rejection text;
  count_updated integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR COALESCE(p_phase,'') NOT IN ('approve','execute') OR COALESCE(p_scope_hash,'') !~ '^[0-9a-f]{64}$'
    OR (p_phase = 'approve' AND (p_selected IS NULL OR array_ndims(p_selected) IS DISTINCT FROM 1
      OR cardinality(p_selected) NOT BETWEEN 1 AND 40 OR array_position(p_selected,NULL::uuid) IS NOT NULL))
    OR (p_phase = 'execute' AND p_selected IS NOT NULL)
  THEN RAISE EXCEPTION 'Invalid operator request' USING ERRCODE = '22023'; END IF;
  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE = 'PT404'; END IF;

  IF p_phase = 'approve' THEN
    IF plan.preview_hash <> p_scope_hash THEN RAISE EXCEPTION 'Preview changed' USING ERRCODE = 'PT409'; END IF;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_selected) id;
    IF cardinality(ids) <> cardinality(p_selected) OR EXISTS (
      SELECT 1 FROM unnest(ids) id WHERE NOT plan.targets @> jsonb_build_array(jsonb_build_object('id',id))
    ) THEN RAISE EXCEPTION 'Selection is outside the preview' USING ERRCODE = 'PT409'; END IF;
    approval := encode(sha256(convert_to(jsonb_build_array(plan.id,plan.preview_hash,ids)::text,'UTF8')),'hex');
    IF plan.approved_hash IS NOT NULL THEN
      IF plan.approved_hash <> approval THEN RAISE EXCEPTION 'Approval scope is frozen' USING ERRCODE = 'PT409'; END IF;
      IF plan.status = 'executed' OR (plan.status = 'approved' AND plan.expires_at > clock_timestamp()) THEN
        RETURN private.operator_receipt(plan,true);
      END IF;
    END IF;
  ELSE
    IF plan.approved_hash IS DISTINCT FROM p_scope_hash THEN
      RAISE EXCEPTION 'Approval required or scope changed' USING ERRCODE = 'PT409';
    END IF;
    IF plan.status = 'executed' THEN RETURN private.operator_receipt(plan,true); END IF;
    ids := plan.approved_ids;
    approval := plan.approved_hash;
  END IF;

  IF plan.status IN ('stale','expired') THEN RETURN private.operator_receipt(plan,true); END IF;
  IF plan.expires_at <= clock_timestamp() THEN
    rejection := 'expired';
  ELSIF NOT private.operator_lock_and_check(plan,ids) THEN
    rejection := 'stale';
  ELSIF plan.expires_at <= clock_timestamp() THEN
    rejection := 'expired';
  END IF;
  IF rejection IS NOT NULL THEN
    UPDATE private.operator_plans SET status = rejection WHERE user_id = actor AND id = plan.id RETURNING * INTO plan;
    INSERT INTO private.operator_events(user_id,plan_id,event,scope_hash,target_count)
      VALUES(actor,plan.id,rejection,COALESCE(plan.approved_hash,plan.preview_hash),cardinality(ids));
    RETURN private.operator_receipt(plan,false);
  END IF;

  IF p_phase = 'approve' THEN
    UPDATE private.operator_plans SET status = 'approved',approved_ids = ids,approved_hash = approval
      WHERE user_id = actor AND id = plan.id RETURNING * INTO plan;
    INSERT INTO private.operator_events(user_id,plan_id,event,scope_hash,target_count)
      VALUES(actor,plan.id,'approved',approval,cardinality(ids));
  ELSE
    IF plan.spec->>'action' = 'archive' THEN
      UPDATE public.emails SET is_archived = true WHERE user_id = actor AND id = ANY(ids);
    ELSE
      UPDATE public.emails SET is_read = true WHERE user_id = actor AND id = ANY(ids);
    END IF;
    GET DIAGNOSTICS count_updated = ROW_COUNT;
    IF count_updated <> cardinality(ids) OR EXISTS (
      SELECT 1 FROM public.emails e WHERE e.user_id = actor AND e.id = ANY(ids)
        AND CASE WHEN plan.spec->>'action' = 'archive' THEN e.is_archived IS NOT TRUE ELSE e.is_read IS NOT TRUE END
    ) THEN RAISE EXCEPTION 'Incomplete operator execution'; END IF;
    UPDATE private.operator_plans SET status = 'executed',applied_count = count_updated
      WHERE user_id = actor AND id = plan.id RETURNING * INTO plan;
    INSERT INTO private.operator_events(user_id,plan_id,event,scope_hash,target_count)
      VALUES(actor,plan.id,'executed',approval,count_updated);
  END IF;
  RETURN private.operator_receipt(plan,false);
END;
$$;

CREATE FUNCTION public.list_operator_plans()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',p.id,'action',p.spec->>'action',
      'status',private.operator_receipt(p,false)->>'status','createdAt',p.created_at,
      'targetCount',COALESCE(cardinality(p.approved_ids),jsonb_array_length(p.targets)))
      ORDER BY p.created_at DESC,p.id DESC)
    FROM (SELECT * FROM private.operator_plans WHERE user_id = actor ORDER BY created_at DESC,id DESC LIMIT 20) p
  ),'[]');
END;
$$;

CREATE FUNCTION public.read_operator_plan(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); plan private.operator_plans;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO plan FROM private.operator_plans WHERE user_id = actor AND id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE = 'PT404'; END IF;
  RETURN private.operator_receipt(plan,false) || jsonb_build_object(
    'spec',plan.spec,'cutoff',plan.cutoff,'createdAt',plan.created_at,
    'targets',(
      SELECT jsonb_agg(jsonb_build_object(
        'id',t.item->>'id','subject',left(e.subject,240),'sender',left(e.from_address,254),
        'account',a.email_address,'at',CASE WHEN isfinite(private.ask_date(e)) THEN private.ask_date(e) END,
        'hasAttachment',CASE WHEN e.id IS NOT NULL THEN private.operator_attachment(e) END,
        'available',e.id IS NOT NULL,'matchesPreview',COALESCE(
          private.operator_eligible(e,actor,plan.spec,plan.cutoff) AND
          private.operator_fingerprint(e,plan.spec->>'action') = t.item->>'fingerprint',false)
      ) ORDER BY t.ordinality)
      FROM jsonb_array_elements(plan.targets) WITH ORDINALITY AS t(item,ordinality)
      LEFT JOIN public.emails e ON e.id = (t.item->>'id')::uuid AND e.user_id = actor
        AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND private.ask_scope(e,actor,'{}')
      LEFT JOIN public.source_accounts a ON a.id = e.source_account_id AND a.user_id = actor
    ),
    'events',(
      SELECT jsonb_agg(jsonb_build_object('event',ev.event,'count',ev.target_count,'at',ev.recorded_at,
        'scopeHash',ev.scope_hash) ORDER BY ev.recorded_at,ev.event)
      FROM private.operator_events ev WHERE ev.user_id = actor AND ev.plan_id = plan.id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.operator_attachment(public.emails),private.operator_fingerprint(public.emails,text),
  private.operator_eligible(public.emails,uuid,jsonb,timestamptz),private.operator_receipt(private.operator_plans,boolean),
  private.operator_lock_and_check(private.operator_plans,uuid[]),
  public.create_operator_plan(uuid,text,uuid,integer,date,text,boolean),
  public.operator_plan_action(uuid,text,text,uuid[]),public.list_operator_plans(),public.read_operator_plan(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_operator_plan(uuid,text,uuid,integer,date,text,boolean),
  public.operator_plan_action(uuid,text,text,uuid[]),public.list_operator_plans(),public.read_operator_plan(uuid) TO authenticated;

COMMIT;
