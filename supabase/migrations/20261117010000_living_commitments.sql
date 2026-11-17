BEGIN;

CREATE TABLE private.living_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL, scope_key text NOT NULL, fingerprint text NOT NULL,
  model text NOT NULL, events jsonb NOT NULL CHECK (jsonb_typeof(events)='array' AND jsonb_array_length(events)<=32),
  metrics jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(user_id,scope_key,fingerprint,model)
);
CREATE TABLE private.living_decisions (
  user_id uuid NOT NULL, analysis_id uuid NOT NULL REFERENCES private.living_analyses(id) ON DELETE CASCADE,
  event_index integer NOT NULL, request_key uuid NOT NULL, command jsonb NOT NULL, receipt jsonb NOT NULL,
  PRIMARY KEY(user_id,analysis_id,event_index), UNIQUE(user_id,request_key)
);
ALTER TABLE private.living_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.living_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.living_analyses, private.living_decisions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.living_scope_key(e public.emails) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(e.source_account_id::text,'none')||':'||coalesce(nullif(e.thread_id,''),e.id::text)
$$;
-- Serialize concurrent incoming evidence and confirmations, including new rows.
CREATE FUNCTION private.lock_living_mail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[];
BEGIN
  IF TG_OP='INSERT' THEN keys:=ARRAY[NEW.user_id::text||':'||private.living_scope_key(NEW)];
  ELSIF TG_OP='DELETE' THEN keys:=ARRAY[OLD.user_id::text||':'||private.living_scope_key(OLD)];
  ELSE keys:=ARRAY[OLD.user_id::text||':'||private.living_scope_key(OLD),NEW.user_id::text||':'||private.living_scope_key(NEW)]; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('living:'||k,0)) FROM (SELECT DISTINCT unnest(keys) k ORDER BY 1) q;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER lock_living_mail BEFORE INSERT OR DELETE OR UPDATE OF user_id,source_account_id,thread_id,from_address,from_name,subject,body_text,received_at,created_at,provider_deleted,is_deleted ON public.emails
  FOR EACH ROW EXECUTE FUNCTION private.lock_living_mail();

CREATE FUNCTION private.living_scope(p_actor uuid,p_source uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE src public.emails; rows jsonb; n integer; bytes integer;
BEGIN
  SELECT * INTO src FROM public.emails WHERE user_id=p_actor AND id=p_source AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='PT404'; END IF;
  SELECT count(*),sum(length(coalesce(body_text,''))) INTO n,bytes FROM public.emails e
    WHERE e.user_id=p_actor AND private.living_scope_key(e)=private.living_scope_key(src) AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  IF n>16 OR bytes>24000 OR EXISTS(SELECT 1 FROM public.emails e WHERE e.user_id=p_actor
    AND private.living_scope_key(e)=private.living_scope_key(src) AND NOT provider_deleted AND is_deleted IS NOT TRUE AND length(coalesce(body_text,''))>8000)
    THEN RAISE EXCEPTION 'Conversation exceeds local analysis budget' USING ERRCODE='PT413'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',e.id,'sender',e.from_address,'account',e.source_account_id,
    'subject',e.subject,'body',left(coalesce(e.body_text,''),8000),'at',coalesce(e.received_at,e.created_at),
    'arrivedAt',e.created_at,'fingerprint',private.commitment_detection_fingerprint(e)) ORDER BY e.created_at,e.id)
  INTO rows FROM public.emails e WHERE e.user_id=p_actor AND private.living_scope_key(e)=private.living_scope_key(src)
    AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  RETURN jsonb_build_object('scopeKey',private.living_scope_key(src),'messages',rows,
    'fingerprint',encode(sha256(convert_to(rows::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.read_living_scope(p_source uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); scope jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
  scope:=private.living_scope(actor,p_source);
  RETURN scope||jsonb_build_object('analyses',coalesce((SELECT jsonb_agg(to_jsonb(a)-'user_id' ORDER BY created_at DESC)
    FROM private.living_analyses a WHERE a.user_id=actor AND a.scope_key=scope->>'scopeKey' AND a.fingerprint=scope->>'fingerprint'),'[]'::jsonb));
END $$;

CREATE FUNCTION public.store_living_analysis(p_actor uuid,p_source uuid,p_fingerprint text,p_model text,p_events jsonb,p_metrics jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope jsonb; result uuid;
BEGIN
  scope:=private.living_scope(p_actor,p_source);
  PERFORM pg_advisory_xact_lock(hashtextextended('living:'||p_actor::text||':'||(scope->>'scopeKey'),0));
  scope:=private.living_scope(p_actor,p_source);
  IF scope->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Conversation changed' USING ERRCODE='PT409'; END IF;
  IF length(p_model) NOT BETWEEN 1 AND 160 OR octet_length(p_events::text)>32000 OR octet_length(p_metrics::text)>2048
    OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>32 THEN RAISE EXCEPTION 'Invalid analysis' USING ERRCODE='22023'; END IF;
  INSERT INTO private.living_analyses(user_id,source_id,scope_key,fingerprint,model,events,metrics)
    VALUES(p_actor,p_source,scope->>'scopeKey',p_fingerprint,p_model,p_events,p_metrics)
    ON CONFLICT(user_id,scope_key,fingerprint,model) DO UPDATE SET model=excluded.model RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.read_living_review(p_analysis uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); a private.living_analyses; scope jsonb; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM private.living_analyses WHERE id=p_analysis AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Analysis unavailable' USING ERRCODE='PT404'; END IF;
  scope:=private.living_scope(actor,a.source_id);
  SELECT coalesce(jsonb_agg(event.value||jsonb_build_object('index',event.ordinality-1,
    'target',c.id,'version',c.version,'previous',r.state,
    'receipt',coalesce(
      (SELECT d.receipt FROM private.living_decisions d WHERE d.user_id=actor AND d.analysis_id=a.id AND d.event_index=event.ordinality-1),
      (SELECT d.receipt FROM private.living_decisions d JOIN private.living_analyses prior ON prior.id=d.analysis_id AND prior.user_id=actor
        WHERE d.user_id=actor AND prior.scope_key=a.scope_key
          AND prior.events->d.event_index->>'referenceKey'=event.value->>'referenceKey'
          AND prior.events->d.event_index->>'source'=event.value->>'source'
          AND prior.events->d.event_index->>'kind'=event.value->>'kind'
          AND prior.events->d.event_index->>'quote'=event.value->>'quote'
        ORDER BY (d.receipt->>'version')::integer DESC LIMIT 1)))
    ORDER BY event.ordinality),'[]'::jsonb) INTO result
    FROM jsonb_array_elements(a.events) WITH ORDINALITY event(value,ordinality)
    LEFT JOIN private.commitments c ON c.user_id=actor AND c.reference_key=event.value->>'referenceKey'
    LEFT JOIN private.commitment_revisions r ON r.user_id=actor AND r.commitment_id=c.id AND r.version=c.version;
  RETURN jsonb_build_object('id',a.id,'sourceId',a.source_id,'subject',(SELECT subject FROM public.emails WHERE user_id=actor AND id=a.source_id),'model',a.model,'metrics',a.metrics,'events',result,
    'stale',scope->>'fingerprint'<>a.fingerprint);
END $$;

CREATE FUNCTION public.confirm_living_event(p_analysis uuid,p_index integer,p_version integer,p_request uuid,p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE actor uuid:=auth.uid(); a private.living_analyses; event jsonb; scope jsonb; target private.commitments;
  prev private.commitment_revisions; decision private.living_decisions; command jsonb; state jsonb; evidence jsonb;
  source public.emails; latest_at timestamptz; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM private.living_analyses WHERE user_id=actor AND id=p_analysis;
  IF NOT FOUND THEN RAISE EXCEPTION 'Analysis unavailable' USING ERRCODE='PT404'; END IF;
  IF p_index IS NULL OR p_index<0 OR p_index>=jsonb_array_length(a.events) OR p_request IS NULL THEN RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023'; END IF;
  IF p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR p_state-ARRAY['title','ownerName','ownerEmail','dueOn','dueAt','status']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Only ordinary commitment fields may be confirmed' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('living:'||actor::text||':'||a.scope_key,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('living-request:'||actor::text||':'||p_request::text,0));
  command:=jsonb_build_array(p_analysis,p_index,p_version,p_state);
  SELECT * INTO decision FROM private.living_decisions WHERE user_id=actor AND request_key=p_request;
  IF FOUND THEN
    IF decision.command<>command THEN RAISE EXCEPTION 'Request reused' USING ERRCODE='PT409'; END IF;
    RETURN decision.receipt||jsonb_build_object('replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM private.living_decisions WHERE user_id=actor AND analysis_id=a.id AND event_index=p_index) THEN
    RAISE EXCEPTION 'Event already confirmed' USING ERRCODE='PT409'; END IF;
  scope:=private.living_scope(actor,a.source_id);
  IF scope->>'fingerprint'<>a.fingerprint THEN RAISE EXCEPTION 'Conversation changed' USING ERRCODE='PT409'; END IF;
  event:=a.events->p_index;
  IF event->>'blocked' IS NOT NULL OR event->>'certainty'<>'firm' THEN RAISE EXCEPTION 'Evidence needs review' USING ERRCODE='PT422'; END IF;
  SELECT * INTO source FROM public.emails WHERE id=(event->>'source')::uuid AND user_id=actor AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  IF NOT FOUND OR private.living_scope_key(source)<>a.scope_key THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='PT404'; END IF;
  evidence:=jsonb_build_array(jsonb_build_object('emailId',source.id,'field','body_text','quote',event->>'quote'));
  SELECT * INTO target FROM private.commitments WHERE user_id=actor AND reference_key=event->>'referenceKey' FOR UPDATE;
  IF event->>'kind'='create' THEN
    IF target.id IS NOT NULL OR p_version IS NOT NULL THEN RAISE EXCEPTION 'Creation stale' USING ERRCODE='PT409'; END IF;
    state:=private.commitment_state(p_state);
    IF state->>'status'<>'open' THEN RAISE EXCEPTION 'Creation must remain open' USING ERRCODE='PT422'; END IF;
    result:=public.save_commitment(p_request,NULL,NULL,event->>'referenceKey',p_state,NULL,evidence);
  ELSE
    IF target.id IS NULL OR target.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Ledger changed' USING ERRCODE='PT409'; END IF;
    SELECT * INTO STRICT prev FROM private.commitment_revisions WHERE user_id=actor AND commitment_id=target.id AND version=target.version;
    IF prev.state->>'status'<>'open' THEN RAISE EXCEPTION 'Commitment closed' USING ERRCODE='PT409'; END IF;
    IF lower(source.from_address) IS DISTINCT FROM lower(prev.state->>'ownerEmail') THEN RAISE EXCEPTION 'Sender lacks authority' USING ERRCODE='PT422'; END IF;
    SELECT max(coalesce(e.received_at,e.created_at)) INTO latest_at FROM private.commitment_revisions r
      CROSS JOIN LATERAL jsonb_array_elements(r.anchors) x
      JOIN public.emails e ON e.user_id=actor AND e.id=(x->>'emailId')::uuid WHERE r.user_id=actor AND r.commitment_id=target.id;
    IF coalesce(source.received_at,source.created_at)<=latest_at THEN RAISE EXCEPTION 'Out of order evidence' USING ERRCODE='PT409'; END IF;
    state:=private.commitment_state(p_state);
    IF event->>'kind'='deadline' THEN state:=prev.state||jsonb_build_object('dueOn',state->'dueOn','dueAt',state->'dueAt');
    ELSIF event->>'kind'='owner' THEN
      IF state->>'ownerEmail' IS NULL THEN RAISE EXCEPTION 'New owner email is required' USING ERRCODE='PT422'; END IF;
      state:=prev.state||jsonb_build_object('ownerName',state->'ownerName','ownerEmail',state->'ownerEmail');
    ELSIF event->>'kind' IN ('completed','cancelled') THEN state:=prev.state||jsonb_build_object('status',event->>'kind');
    ELSE RAISE EXCEPTION 'Invalid update kind' USING ERRCODE='22023'; END IF;
    result:=public.save_commitment(p_request,target.id,p_version,NULL,state-'review',NULL,evidence);
  END IF;
  INSERT INTO private.living_decisions VALUES(actor,a.id,p_index,p_request,command,result);
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.living_scope_key(public.emails),private.lock_living_mail(),private.living_scope(uuid,uuid),
  public.read_living_scope(uuid),public.read_living_review(uuid),public.store_living_analysis(uuid,uuid,text,text,jsonb,jsonb),
  public.confirm_living_event(uuid,integer,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_living_scope(uuid),public.read_living_review(uuid),public.confirm_living_event(uuid,integer,integer,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_living_analysis(uuid,uuid,text,text,jsonb,jsonb) TO service_role;
COMMIT;
