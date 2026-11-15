BEGIN;

ALTER TABLE private.gmail_reconnect_required
  ADD COLUMN notification_id uuid NOT NULL DEFAULT gen_random_uuid();

-- Viewing an item never updates the underlying work.
CREATE TABLE private.action_notification_seen (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (event_key ~ '^[0-9a-f]{64}$'),
  seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id,event_key)
);
ALTER TABLE private.action_notification_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.action_notification_seen FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_action_notification_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  RETURN jsonb_build_object(
    'reconnect', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'email',a.email_address,'eventId',r.notification_id)
        ORDER BY a.email_address,a.id)
      FROM private.gmail_reconnect_required r
      JOIN public.source_accounts a ON a.id=r.account_id AND a.user_id=actor
      WHERE r.user_id=actor AND a.is_active AND a.auth_type='oauth_google'
    ), '[]'::jsonb),
    'replyWork', public.list_reply_work('{}'::uuid[]),
    'commitments', public.list_commitment_attention('{}'::uuid[],'{}'::uuid[])->'items'
  );
END $$;

CREATE FUNCTION public.read_action_notification_sources(p_emails uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_emails IS NULL OR cardinality(p_emails)>30 THEN RAISE SQLSTATE '22023'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(e.id,a.email_address)
    FROM public.emails e
    LEFT JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=actor
    WHERE e.user_id=actor AND e.id=ANY(p_emails) AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND (e.source_account_id IS NULL OR a.id IS NOT NULL)
  ), '{}'::jsonb);
END $$;

CREATE FUNCTION public.read_action_notification_seen(p_keys text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_keys IS NULL OR cardinality(p_keys)>200 THEN RAISE SQLSTATE '22023'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(event_key,seen_at)
    FROM private.action_notification_seen WHERE user_id=actor AND event_key=ANY(p_keys)
  ), '{}'::jsonb);
END $$;

-- The server calls this only after verifying the event against the user's current feed.
CREATE FUNCTION public.mark_action_notification_seen(p_actor uuid,p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' THEN RAISE SQLSTATE '22023'; END IF;
  INSERT INTO private.action_notification_seen(user_id,event_key) VALUES (p_actor,p_key)
  ON CONFLICT (user_id,event_key) DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.read_action_notification_context(),public.read_action_notification_seen(text[]),
  public.read_action_notification_sources(uuid[])
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_action_notification_context(),public.read_action_notification_seen(text[]),
  public.read_action_notification_sources(uuid[])
  TO authenticated;
REVOKE ALL ON FUNCTION public.mark_action_notification_seen(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_action_notification_seen(uuid,text) TO service_role;

COMMIT;
