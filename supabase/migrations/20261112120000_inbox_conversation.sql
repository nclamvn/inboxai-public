BEGIN;

-- A sent mirror can precede Gmail's next history page. Its accepted reply
-- receipt still identifies the original email without a subject or date guess.
CREATE FUNCTION private.email_conversation_members(p_source public.emails)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  parent public.emails;
  gmail_thread text := CASE WHEN p_source.sync_namespace='gmail' THEN p_source.thread_id END;
  operation_id uuid := substring(p_source.message_id FROM
    '^<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@inboxai[.]invalid>$')::uuid;
BEGIN
  IF p_source.source_account_id IS NULL THEN
    RETURN NEXT p_source.id;
    RETURN;
  END IF;

  IF gmail_thread IS NULL AND p_source.direction='outbound' AND operation_id IS NOT NULL THEN
    SELECT e.* INTO parent
    FROM private.mail_send_operations op
    JOIN private.reply_drafts d ON d.user_id=op.user_id AND d.account_id=op.account_id AND d.request_key=op.request_key
    JOIN public.emails e ON e.id=d.source_id AND e.user_id=d.user_id AND e.source_account_id=d.account_id
    WHERE op.id=operation_id AND op.user_id=p_source.user_id AND op.account_id=p_source.source_account_id
      AND op.state IN ('accepted','partial') AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE;
  END IF;

  -- Use an explicit, unique RFC parent when provider metadata is missing.
  IF gmail_thread IS NULL AND parent.id IS NULL AND p_source.in_reply_to IS NOT NULL THEN
    SELECT e.* INTO parent
    FROM public.emails e
    WHERE e.user_id=p_source.user_id AND e.source_account_id=p_source.source_account_id
      AND e.message_id=p_source.in_reply_to AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM public.emails other
        WHERE other.user_id=e.user_id AND other.source_account_id=e.source_account_id
          AND other.message_id=e.message_id AND other.id<>e.id AND NOT other.provider_deleted AND other.is_deleted IS NOT TRUE);
  END IF;

  IF gmail_thread IS NULL AND parent.sync_namespace='gmail' THEN gmail_thread := parent.thread_id; END IF;

  RETURN QUERY
  WITH provider_members AS MATERIALIZED (
    SELECT e.id FROM public.emails e
    WHERE e.user_id=p_source.user_id AND e.source_account_id=p_source.source_account_id
      AND e.sync_namespace='gmail' AND e.thread_id=gmail_thread
      AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
    UNION SELECT p_source.id
    UNION SELECT parent.id WHERE parent.id IS NOT NULL
  ), related_ids AS (
    SELECT id FROM provider_members
    UNION
    SELECT e.id FROM provider_members m
    JOIN private.reply_drafts d ON d.user_id=p_source.user_id AND d.account_id=p_source.source_account_id AND d.source_id=m.id
    JOIN private.mail_send_operations op ON op.user_id=d.user_id AND op.account_id=d.account_id AND op.request_key=d.request_key
    JOIN public.emails e ON e.user_id=op.user_id AND e.source_account_id=op.account_id
      AND e.message_id='<'||op.id::text||'@inboxai.invalid>' AND e.direction='outbound'
    WHERE op.state IN ('accepted','partial') AND (gmail_thread IS NULL OR e.thread_id IS NULL OR e.thread_id=gmail_thread)
    UNION
    SELECT e.id FROM public.emails e
    WHERE e.user_id=p_source.user_id AND e.source_account_id=p_source.source_account_id
      AND (gmail_thread IS NULL OR e.sync_namespace<>'gmail' OR e.thread_id IS NULL)
      AND ((p_source.in_reply_to IS NOT NULL AND e.message_id=p_source.in_reply_to)
        OR (cardinality(p_source.reply_references)>0 AND e.message_id=ANY(p_source.reply_references))
        OR (p_source.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$'
          AND (e.in_reply_to=p_source.message_id OR e.reply_references @> ARRAY[p_source.message_id])))
  )
  SELECT e.id FROM related_ids m JOIN public.emails e ON e.id=m.id
  WHERE e.user_id=p_source.user_id AND e.source_account_id=p_source.source_account_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE;
END $$;

CREATE FUNCTION public.read_email_conversation(p_email_id uuid,p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source public.emails;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF (p_before_at IS NULL)<> (p_before_id IS NULL) OR (p_before_at IS NOT NULL AND NOT isfinite(p_before_at))
  THEN RAISE SQLSTATE '22023'; END IF;
  SELECT * INTO source FROM public.emails WHERE id=p_email_id AND user_id=actor
    AND NOT provider_deleted AND is_deleted IS NOT TRUE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;

  RETURN (
    WITH members AS MATERIALIZED (
      SELECT e.id,e.direction,COALESCE(e.received_at,e.sent_at,e.created_at) AS at
      FROM private.email_conversation_members(source) m(id)
      JOIN public.emails e ON e.id=m.id AND e.user_id=actor
    ), page_window AS (
      SELECT * FROM members WHERE p_before_id IS NULL OR (at,id)<(p_before_at,p_before_id)
      ORDER BY at DESC,id DESC LIMIT 21
    ), visible AS (
      SELECT * FROM page_window ORDER BY at DESC,id DESC LIMIT 20
    ), display_rows AS (
      SELECT * FROM visible
      UNION
      SELECT * FROM members WHERE id=source.id AND p_before_id IS NULL
    )
    SELECT jsonb_build_object(
      'account',(SELECT a.email_address FROM public.source_accounts a WHERE a.user_id=actor AND a.id=source.source_account_id),
      'replyId',(SELECT m.id FROM members m JOIN public.source_accounts a
        ON a.user_id=actor AND a.id=source.source_account_id AND a.is_active
        WHERE m.direction='inbound' ORDER BY m.at DESC,m.id DESC LIMIT 1),
      'messages',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'direction',v.direction,'sender',COALESCE(NULLIF(e.from_name,''),e.from_address),
        'subject',e.subject,'preview',left(e.body_text,160),'unread',NOT e.is_read,'at',v.at
      ) ORDER BY v.at,v.id) FROM display_rows v JOIN public.emails e ON e.id=v.id AND e.user_id=actor),'[]'::jsonb),
      'older',CASE WHEN (SELECT count(*) FROM page_window)>20 THEN
        (SELECT jsonb_build_object('at',v.at,'id',v.id) FROM visible v ORDER BY v.at,v.id LIMIT 1) END
    )
  );
END $$;

REVOKE ALL ON FUNCTION private.email_conversation_members(public.emails),
  public.read_email_conversation(uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_email_conversation(uuid,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
