BEGIN;
-- Reuse a confirmed creation only when its owned, original evidence uniquely
-- overlaps the newly selected exact quote. Never merge by title or account name.
CREATE OR REPLACE FUNCTION public.store_living_analysis(p_actor uuid,p_source uuid,p_fingerprint text,p_model text,p_events jsonb,p_metrics jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope jsonb; result uuid; event jsonb; candidates text[]; aliases jsonb:='{}'; ambiguous jsonb:='{}'; unavailable jsonb:='{}'; rewritten jsonb:='[]';
BEGIN
  scope:=private.living_scope(p_actor,p_source);
  PERFORM pg_advisory_xact_lock(hashtextextended('living:'||p_actor::text||':'||(scope->>'scopeKey'),0));
  scope:=private.living_scope(p_actor,p_source);
  IF scope->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Conversation changed' USING ERRCODE='PT409'; END IF;
  IF length(p_model) NOT BETWEEN 1 AND 160 OR octet_length(p_events::text)>32000 OR octet_length(p_metrics::text)>2048
    OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>32 THEN RAISE EXCEPTION 'Invalid analysis' USING ERRCODE='22023'; END IF;
  FOR event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF event->>'kind'='create' AND event->>'source'=event->>'origin' AND event->>'blocked' IS NULL THEN
      SELECT array_agg(DISTINCT c.reference_key) INTO candidates
      FROM private.commitments c JOIN private.commitment_revisions r ON r.user_id=p_actor AND r.commitment_id=c.id AND r.version=1
      CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) anchor
      JOIN public.emails e ON e.user_id=p_actor AND e.id=(anchor->>'emailId')::uuid
      WHERE c.user_id=p_actor AND c.reference_key LIKE 'living:%' AND e.id=(event->>'source')::uuid
        AND private.living_scope_key(e)=scope->>'scopeKey' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        AND anchor->>'field'='body_text' AND anchor->>'availability'='available'
        AND length(event->>'quote')>=12 AND length(anchor->>'quote')>=12
        AND position(event->>'quote' in e.body_text)>0
        AND (position(anchor->>'quote' in event->>'quote')>0 OR position(event->>'quote' in anchor->>'quote')>0);
      IF cardinality(candidates)=1 THEN aliases:=aliases||jsonb_build_object(event->>'referenceKey',candidates[1]);
      ELSIF cardinality(candidates)>1 THEN ambiguous:=ambiguous||jsonb_build_object(event->>'referenceKey',true);
      ELSIF EXISTS(SELECT 1 FROM private.commitments c JOIN private.commitment_revisions r ON r.user_id=p_actor AND r.commitment_id=c.id AND r.version=1
        CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) anchor
        WHERE c.user_id=p_actor AND c.reference_key LIKE 'living:%' AND anchor->>'emailId'=event->>'source'
          AND anchor->>'availability'<>'available') THEN unavailable:=unavailable||jsonb_build_object(event->>'referenceKey',true); END IF;
    END IF;
  END LOOP;
  FOR event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF ambiguous ? (event->>'referenceKey') THEN event:=event||jsonb_build_object('blocked','Nguồn tạo khớp nhiều cam kết đã duyệt; cần đối chiếu trong sổ.');
    ELSIF unavailable ? (event->>'referenceKey') THEN event:=event||jsonb_build_object('blocked','Bằng chứng tạo đã xác nhận không còn khớp nguồn; cần đối chiếu trong sổ trước khi tạo thêm.');
    ELSIF aliases ? (event->>'referenceKey') THEN event:=event||jsonb_build_object('referenceKey',aliases->>(event->>'referenceKey')); END IF;
    rewritten:=rewritten||jsonb_build_array(event);
  END LOOP;
  INSERT INTO private.living_analyses(user_id,source_id,scope_key,fingerprint,model,events,metrics)
    VALUES(p_actor,p_source,scope->>'scopeKey',p_fingerprint,p_model,rewritten,p_metrics)
    ON CONFLICT(user_id,scope_key,fingerprint,model) DO UPDATE SET model=excluded.model RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.store_living_analysis(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_living_analysis(uuid,uuid,text,text,jsonb,jsonb) TO service_role;
COMMIT;
