BEGIN;
-- Append-only review decisions. A dismissal is not a ledger revision or receipt.
CREATE TABLE private.living_review_history (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 review_key text NOT NULL, version integer NOT NULL CHECK(version>0),
 analysis_id uuid NOT NULL REFERENCES private.living_analyses(id), event_index integer NOT NULL,
 active boolean NOT NULL, reason text, request_key uuid NOT NULL, command jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,review_key,version), UNIQUE(user_id,request_key),
 CHECK((active AND reason IS NOT NULL AND reason IN ('not_commitment','not_relevant','duplicate')) OR (NOT active AND reason IS NULL))
);
ALTER TABLE private.living_review_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.living_review_history FROM PUBLIC,anon,authenticated,service_role;

-- Exclude mutable titles, model versions and event ordinals. Bind both decisive
-- and original owned evidence, type and proposed factual effect. New decisive
-- mail, edited bytes, changed responsibility/date/type cannot inherit a dismissal.
CREATE FUNCTION private.living_review_key(p_actor uuid,p_scope text,p_event jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE source_id uuid; origin_id uuid; result text;
BEGIN
 -- Unknown model aliases remain blocked/inspectable; never cast them unchecked.
 BEGIN source_id:=(p_event->>'source')::uuid;origin_id:=(p_event->>'origin')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
 SELECT encode(sha256(convert_to(jsonb_build_array(p_scope,s.id,o.id,
   private.commitment_detection_fingerprint(s),private.commitment_detection_fingerprint(o),s.subject,o.subject,
   p_event->>'kind',p_event->>'certainty',p_event->>'quote',p_event->>'owner',p_event->>'due')::text,'UTF8')),'hex') INTO result
 FROM public.emails s JOIN public.emails o ON o.user_id=p_actor AND o.id=origin_id
 WHERE s.user_id=p_actor AND s.id=source_id
   AND private.living_scope_key(s)=p_scope AND private.living_scope_key(o)=p_scope
   AND NOT s.provider_deleted AND s.is_deleted IS NOT TRUE AND NOT o.provider_deleted AND o.is_deleted IS NOT TRUE;
 RETURN result;
END $$;
CREATE FUNCTION private.living_disposition(p_actor uuid,p_scope text,p_event jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('version',h.version,'active',h.active,'reason',h.reason,'at',h.created_at)
 FROM private.living_review_history h WHERE h.user_id=p_actor
 AND h.review_key=private.living_review_key(p_actor,p_scope,p_event) ORDER BY h.version DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.read_living_review(p_analysis uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); a private.living_analyses; scope jsonb; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM private.living_analyses WHERE id=p_analysis AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Analysis unavailable' USING ERRCODE='PT404'; END IF;
  scope:=private.living_scope(actor,a.source_id);
  SELECT coalesce(jsonb_agg(event.value||jsonb_build_object('index',event.ordinality-1,
    'disposition',private.living_disposition(actor,a.scope_key,event.value),
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


CREATE OR REPLACE FUNCTION public.confirm_living_event(p_analysis uuid,p_index integer,p_version integer,p_request uuid,p_state jsonb)
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
  IF EXISTS(SELECT 1 FROM private.living_review_history WHERE user_id=actor AND request_key=p_request) THEN
    RAISE EXCEPTION 'Request reused for review' USING ERRCODE='PT409'; END IF;
  scope:=private.living_scope(actor,a.source_id);
  IF scope->>'fingerprint'<>a.fingerprint THEN RAISE EXCEPTION 'Conversation changed' USING ERRCODE='PT409'; END IF;
  event:=a.events->p_index;
  IF coalesce((private.living_disposition(actor,a.scope_key,event)->>'active')::boolean,false) THEN
    RAISE EXCEPTION 'Dismissed proposal must be restored first' USING ERRCODE='PT409'; END IF;
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

CREATE FUNCTION public.decide_living_review(p_analysis uuid,p_index integer,p_version integer,p_ledger_version integer,
 p_request uuid,p_action text,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' SET lock_timeout='5s' AS $$
DECLARE actor uuid:=auth.uid(); a private.living_analyses; scope jsonb; event jsonb; key text; command jsonb;
 prior private.living_review_history; old_request private.living_review_history; target private.commitments;
 current_review jsonb; result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM private.living_analyses WHERE id=p_analysis AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Analysis unavailable' USING ERRCODE='PT404';END IF;
 IF p_request IS NULL OR p_index IS NULL OR p_index<0 OR p_index>=jsonb_array_length(a.events)
  OR p_version IS NULL OR p_version<0 OR p_action IS NULL OR p_action NOT IN ('dismiss','restore')
  OR (p_action='dismiss' AND (p_reason IS NULL OR p_reason NOT IN ('not_commitment','not_relevant','duplicate')))
  OR (p_action='restore' AND p_reason IS NOT NULL) THEN RAISE EXCEPTION 'Invalid review decision' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('living:'||actor::text||':'||a.scope_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('living-request:'||actor::text||':'||p_request::text,0));
 command:=jsonb_build_array(p_analysis,p_index,p_version,p_ledger_version,p_action,p_reason);
 SELECT * INTO old_request FROM private.living_review_history WHERE user_id=actor AND request_key=p_request;
 IF FOUND THEN
  IF old_request.command<>command THEN RAISE EXCEPTION 'Request reused' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('version',old_request.version,'active',old_request.active,'reason',old_request.reason,'replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM private.living_decisions WHERE user_id=actor AND request_key=p_request) THEN
  RAISE EXCEPTION 'Request reused for approval' USING ERRCODE='PT409';END IF;
 scope:=private.living_scope(actor,a.source_id);
 IF scope->>'fingerprint' IS DISTINCT FROM a.fingerprint THEN RAISE EXCEPTION 'Conversation changed' USING ERRCODE='PT409';END IF;
 event:=a.events->p_index;key:=private.living_review_key(actor,a.scope_key,event);
 IF key IS NULL THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='PT422';END IF;
 current_review:=public.read_living_review(a.id)->'events'->p_index;
 SELECT * INTO target FROM private.commitments WHERE user_id=actor AND reference_key=event->>'referenceKey' FOR UPDATE;
 IF target.version IS DISTINCT FROM p_ledger_version OR current_review->>'receipt' IS NOT NULL
   OR (event->>'kind'='create' AND target.id IS NOT NULL) THEN RAISE EXCEPTION 'Ledger changed or already confirmed' USING ERRCODE='PT409';END IF;
 SELECT * INTO prior FROM private.living_review_history WHERE user_id=actor AND review_key=key ORDER BY version DESC LIMIT 1;
 IF coalesce(prior.version,0)<>p_version OR (p_action='restore' AND prior.active IS DISTINCT FROM true)
   OR (p_action='dismiss' AND coalesce(prior.active,false)) THEN RAISE EXCEPTION 'Decision changed' USING ERRCODE='PT409';END IF;
 INSERT INTO private.living_review_history(user_id,review_key,version,analysis_id,event_index,active,reason,request_key,command)
 VALUES(actor,key,p_version+1,a.id,p_index,p_action='dismiss',p_reason,p_request,command);
 RETURN jsonb_build_object('version',p_version+1,'active',p_action='dismiss','reason',p_reason,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION private.living_review_key(uuid,text,jsonb),private.living_disposition(uuid,text,jsonb),
 public.decide_living_review(uuid,integer,integer,integer,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_living_review(uuid,integer,integer,integer,uuid,text,text) TO authenticated;
COMMIT;
