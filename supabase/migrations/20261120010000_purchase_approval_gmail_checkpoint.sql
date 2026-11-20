BEGIN;

-- Bind the reviewer’s scoped evidence to a fully committed Gmail cursor.
CREATE OR REPLACE FUNCTION private.purchase_approval_review_scope(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT state-ARRAY['total','checked','unavailable','matches','checks'] ||
    jsonb_build_object('handoffId',h.id,
      'truncated',(state->>'unavailable')::boolean OR (state->>'total')::int-(state->>'checked')::int>6,
      'syncHistoryId',CASE WHEN sync.cursor->>'provider'='gmail' AND sync.cursor->>'phase'='history'
        AND NOT (sync.cursor ?| ARRAY['pageToken','pending','resumePageToken','endHistoryId'])
        AND sync.cursor->>'historyId' ~ '^[0-9]{1,30}$' THEN sync.cursor->>'historyId' END)
  FROM private.purchase_handoffs h
  JOIN private.purchase_due_exceptions x ON x.response_handoff=h.id AND x.owner_id=h.owner_id AND x.commitment_id=h.commitment_id
    AND x.reviewer_id=p_actor AND x.stage IN ('reviewer','closed')
  CROSS JOIN LATERAL private.purchase_supplement_review_state(x.origin_handoff,h.invoice_id) state
  LEFT JOIN private.account_sync sync ON sync.account_id=(state->>'accountId')::uuid
    AND sync.user_id=h.owner_id AND sync.provider='gmail'
  WHERE h.id=p_handoff AND h.reviewer_id=p_actor
$$;

CREATE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb,p_review_token text,p_verified_history_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE saved jsonb; current_scope jsonb;
BEGIN
  saved:=private.apply_purchase_due_handoff(p_actor,p_key,p_command);
  IF p_command->>'action'<>'approve' OR saved->>'replayed'='true' THEN RETURN saved; END IF;

  -- The handoff write holds the account lock used by Gmail sync. Re-read the
  -- evidence and checkpoint under that lock, rolling back the decision and
  -- its receipt together if either changed after verification.
  current_scope:=private.purchase_approval_review_scope(p_actor,(saved->>'id')::uuid);
  IF current_scope->>'hasReplacement'='true' THEN
    RAISE EXCEPTION 'Có chứng từ đính chính mới. Mua hàng cần kiểm tra và bàn giao lại trước khi duyệt.' USING ERRCODE='PT432';
  END IF;
  IF current_scope->>'truncated'='true'
    OR p_review_token IS DISTINCT FROM private.purchase_approval_review_token(current_scope)
    OR (current_scope IS NOT NULL AND (p_verified_history_id IS NULL
      OR p_verified_history_id IS DISTINCT FROM current_scope->>'syncHistoryId'))
  THEN RAISE EXCEPTION 'Nguồn chứng từ vừa thay đổi. Hãy kiểm tra lại hồ sơ trước khi duyệt.' USING ERRCODE='PT433'; END IF;
  RETURN saved;
END;
$$;

-- In mixed-version rollouts, older callers can still replay receipts and use
-- non-supplemental actions. They cannot create a new supplemental approval.
CREATE OR REPLACE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb,p_review_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.confirm_purchase_handoff(p_actor,p_key,p_command,p_review_token,NULL::text)
$$;

REVOKE ALL ON FUNCTION public.confirm_purchase_handoff(uuid,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_handoff(uuid,uuid,jsonb,text,text) TO service_role;
COMMIT;
