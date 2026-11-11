BEGIN;

ALTER TABLE public.emails
  ADD COLUMN inbox_priority text CHECK (inbox_priority IN ('action', 'later')),
  ADD COLUMN inbox_priority_version integer NOT NULL DEFAULT 0 CHECK (inbox_priority_version >= 0);

CREATE INDEX inbox_action_pagination ON public.emails (user_id, received_at DESC NULLS LAST, id DESC)
  WHERE direction = 'inbound' AND NOT is_deleted AND NOT is_archived AND NOT provider_deleted;

-- PostgREST computed field over a row already visible to the caller. Bound
-- plaintext evidence and preview payload without adding a stored body copy.
CREATE FUNCTION public.inbox_preview(e public.emails)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(left(e.snippet, 480), ''), left(e.body_text, 480))
$$;
REVOKE ALL ON FUNCTION public.inbox_preview(public.emails) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_preview(public.emails) TO authenticated, service_role;

-- Compare-and-set on the existing RLS-protected message. Classification and provider
-- sync update their own fields and do not participate in this revision.
CREATE FUNCTION public.set_inbox_priority(p_email_id uuid, p_choice text, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_choice text;
  v_version integer;
BEGIN
  IF p_version IS NULL OR p_version < 0 OR (p_choice IS NOT NULL AND p_choice NOT IN ('action', 'later')) THEN
    RAISE EXCEPTION 'Invalid priority correction' USING ERRCODE = '22023';
  END IF;

  SELECT e.inbox_priority, e.inbox_priority_version INTO v_choice, v_version
  FROM public.emails e
  WHERE e.id = p_email_id AND e.user_id = auth.uid()
    AND e.direction = 'inbound' AND NOT e.is_deleted AND NOT e.is_archived AND NOT e.provider_deleted
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inbox email unavailable' USING ERRCODE = 'PT404';
  END IF;

  -- A repeated request after an uncertain acknowledgement converges on the same choice.
  IF v_choice IS NOT DISTINCT FROM p_choice THEN
    RETURN jsonb_build_object('status', 'saved', 'choice', v_choice, 'version', v_version);
  END IF;
  IF v_version <> p_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'choice', v_choice, 'version', v_version);
  END IF;

  UPDATE public.emails SET inbox_priority = p_choice, inbox_priority_version = v_version + 1
  WHERE id = p_email_id AND user_id = auth.uid();
  RETURN jsonb_build_object('status', 'saved', 'choice', p_choice, 'version', v_version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.set_inbox_priority(uuid, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_inbox_priority(uuid, text, integer) TO authenticated;

COMMIT;
