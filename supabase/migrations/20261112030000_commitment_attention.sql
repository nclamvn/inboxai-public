BEGIN;

CREATE INDEX emails_commitment_reply ON public.emails (user_id, lower(btrim(from_address)), received_at DESC)
  WHERE direction = 'inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE;

CREATE FUNCTION private.commitment_owned_addresses(p_actor uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT ARRAY(
    SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = p_actor AND u.email IS NOT NULL
    UNION
    SELECT lower(btrim(a.email_address)) FROM public.source_accounts a WHERE a.user_id = p_actor
  )
$$;

CREATE FUNCTION private.commitment_due_attention(p_state jsonb, p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_state->>'status' IS DISTINCT FROM 'open' THEN NULL
    WHEN private.commitment_board_group(p_state,'waiting',p_now) = 'overdue' THEN 'overdue'
    WHEN (p_state->>'dueOn')::date = (p_now AT TIME ZONE INTERVAL '+07:00')::date
      OR ((p_state->>'dueAt')::timestamptz AT TIME ZONE INTERVAL '+07:00')::date =
         (p_now AT TIME ZONE INTERVAL '+07:00')::date THEN 'today'
  END
$$;

CREATE FUNCTION private.commitment_reminder_key(p_actor uuid,p_id uuid,p_version integer)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (substr(digest,1,12) || '4' || substr(digest,14,3) || '8' || substr(digest,18,15))::uuid
  FROM (SELECT encode(sha256(convert_to('commitment-reminder:v1:' || p_actor || ':' || p_id || ':' || p_version,'UTF8')), 'hex') AS digest) key
$$;

CREATE FUNCTION public.list_commitment_attention(p_accounts uuid[],p_reply_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  addresses text[];
  now_at timestamptz := statement_timestamp();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR p_reply_ids IS NULL OR cardinality(p_accounts)>50 OR cardinality(p_reply_ids)>24
  THEN RAISE EXCEPTION 'Invalid commitment attention scope' USING ERRCODE='22023'; END IF;
  addresses := private.commitment_owned_addresses(actor);
  RETURN (
    WITH current AS MATERIALIZED (
      SELECT c.id,c.version,c.detection_reference,r.state,r.anchors,r.recorded_at,
        private.commitment_responsibility(r.state->>'ownerEmail',addresses) AS responsibility
      FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
      WHERE c.user_id=actor AND r.state->>'status'='open'
    ), ordered AS (
      SELECT c.*, CASE WHEN c.id=ANY(p_reply_ids) THEN 'reply'
        WHEN c.state->>'review' IS NOT NULL THEN 'review'
        ELSE private.commitment_due_attention(c.state,now_at) END AS reason
      FROM current c
    ), candidates AS (
      SELECT *, CASE reason WHEN 'reply' THEN 1 WHEN 'review' THEN 2 WHEN 'overdue' THEN 3 ELSE 4 END AS bucket,
        COALESCE((state->>'dueAt')::timestamptz,
          ((state->>'dueOn')::date + time '23:59:59') AT TIME ZONE INTERVAL '+07:00') AS due
      FROM ordered WHERE reason IS NOT NULL
    ), visible AS (
      SELECT c.*, source.evidence,
        operation.state AS reminder_state
      FROM candidates c
      CROSS JOIN LATERAL (
        SELECT anchor.value AS evidence
        FROM jsonb_array_elements(private.commitment_sources(actor,c.anchors)) WITH ORDINALITY AS anchor(value,position)
        JOIN public.emails e ON e.user_id=actor AND e.id=(anchor.value->>'emailId')::uuid
        WHERE anchor.value->>'availability'='available'
          AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
        ORDER BY anchor.position LIMIT 1
      ) source
      LEFT JOIN private.mail_send_operations operation
        ON operation.user_id=actor AND operation.request_key=private.commitment_reminder_key(actor,c.id,c.version)
      ORDER BY c.bucket,c.due NULLS LAST,c.recorded_at DESC,c.id LIMIT 4
    )
    SELECT jsonb_build_object(
      'tracking', EXISTS (SELECT 1 FROM current WHERE detection_reference IS NOT NULL),
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'version',v.version,'state',v.state,'reason',v.reason,'responsibility',v.responsibility,
        'group',private.commitment_board_group(v.state,v.responsibility,now_at),
        'source',v.evidence,'reminderState',v.reminder_state
      ) ORDER BY v.bucket,v.due NULLS LAST,v.recorded_at DESC,v.id) FROM visible v),'[]'::jsonb))
  );
END
$$;

CREATE FUNCTION private.commitment_reminder_snapshot(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version',c.version,'accountId',a.id,'fromAddress',a.email_address,
    'fromName',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1)),
    'to',lower(btrim(head.state->>'ownerEmail')),
    'subject',CASE WHEN e.subject IS NULL OR btrim(e.subject)='' OR e.subject ~ '[[:cntrl:]]'
      THEN 'Re: Theo dõi cam kết ' || c.detection_reference
      WHEN e.subject ~* '^re:' THEN btrim(left(e.subject,500)) ELSE 'Re: ' || btrim(left(e.subject,496)) END,
    'text',format(E'Chào anh/chị,\n\nTôi muốn hỏi tiến độ cam kết “%s” (hạn %s). Anh/chị có thể xác nhận tình trạng hiện tại hoặc lịch mới được không?\n\nCảm ơn anh/chị.',
      head.state->>'title', COALESCE(to_char((head.state->>'dueOn')::date,'DD/MM/YYYY'),
        to_char((head.state->>'dueAt')::timestamptz AT TIME ZONE INTERVAL '+07:00','HH24:MI DD/MM/YYYY') || ' (UTC+7)')),
    'source',origin.evidence,
    'sourceFingerprint',private.commitment_detection_fingerprint(e),
    'messageId',CASE WHEN length(e.message_id)<=998 AND e.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN e.message_id END,
    'mailIdentity',jsonb_build_array(e.sync_namespace,e.original_uid,a.auth_type)
  )
  FROM private.commitments c
  JOIN private.commitment_revisions head ON (head.user_id,head.commitment_id,head.version)=(c.user_id,c.id,c.version)
  CROSS JOIN LATERAL (
    SELECT candidate.value AS evidence
    FROM private.commitment_revisions r
    CROSS JOIN LATERAL jsonb_array_elements(private.commitment_sources(p_actor,r.anchors)) AS candidate(value)
    JOIN public.emails message ON message.id=(candidate.value->>'emailId')::uuid AND message.user_id=p_actor
    JOIN public.source_accounts account ON account.id=message.source_account_id AND account.user_id=p_actor AND account.is_active
    WHERE r.user_id=p_actor AND r.commitment_id=c.id AND candidate.value->>'availability'='available'
      AND message.direction='inbound' AND message.received_at IS NOT NULL
      AND lower(btrim(message.from_address))=lower(btrim(head.state->>'ownerEmail'))
      AND private.commitment_subject_reference(message.subject)=c.detection_reference
    ORDER BY message.received_at DESC,r.version DESC,message.id LIMIT 1
  ) origin
  JOIN public.emails e ON e.id=(origin.evidence->>'emailId')::uuid AND e.user_id=p_actor
  JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=p_actor AND a.is_active
  WHERE c.user_id=p_actor AND c.id=p_id AND head.state->>'status'='open'
    AND head.state->>'review' IS NULL AND c.detection_reference IS NOT NULL
    AND private.commitment_due_attention(head.state,statement_timestamp()) IS NOT NULL
    AND private.commitment_responsibility(head.state->>'ownerEmail',private.commitment_owned_addresses(p_actor))='waiting'
    AND NOT EXISTS (
      SELECT 1 FROM public.emails newer
      WHERE newer.user_id=p_actor AND newer.direction='inbound' AND NOT newer.provider_deleted AND newer.is_deleted IS NOT TRUE
        AND lower(btrim(newer.from_address))=lower(btrim(e.from_address)) AND newer.received_at>e.received_at
        AND private.commitment_subject_reference(newer.subject)=c.detection_reference
    )
    AND NOT EXISTS (
      SELECT 1 FROM private.commitment_revisions old
      JOIN private.mail_send_operations op ON op.user_id=old.user_id
        AND op.request_key=private.commitment_reminder_key(old.user_id,old.commitment_id,old.version)
      WHERE old.user_id=p_actor AND old.commitment_id=c.id AND old.version<>c.version AND op.state IN ('dispatching','unknown')
    )
$$;

CREATE FUNCTION public.read_commitment_reminder(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  snapshot jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.commitments WHERE user_id=actor AND id=p_id)
  THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  snapshot := private.commitment_reminder_snapshot(actor,p_id);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Reminder requires current evidence' USING ERRCODE='PT409'; END IF;
  RETURN (snapshot - 'sourceFingerprint' - 'mailIdentity' - 'messageId') ||
    jsonb_build_object('proof',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'));
END
$$;

CREATE FUNCTION public.begin_commitment_reminder(p_user_id uuid,p_account_id uuid,p_commitment_id uuid,
  p_version integer,p_proof text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM 1 FROM private.commitments WHERE user_id=p_user_id AND id=p_commitment_id AND version=p_version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder changed' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder account changed' USING ERRCODE='PT409'; END IF;
  snapshot := private.commitment_reminder_snapshot(p_user_id,p_commitment_id);
  PERFORM 1 FROM public.emails WHERE user_id=p_user_id AND id=(snapshot#>>'{source,emailId}')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder source changed' USING ERRCODE='PT409'; END IF;
  snapshot := private.commitment_reminder_snapshot(p_user_id,p_commitment_id);
  IF snapshot IS NULL OR (snapshot->>'accountId')::uuid IS DISTINCT FROM p_account_id
    OR encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM p_proof
    OR p_payload IS DISTINCT FROM (jsonb_build_object(
      'from',jsonb_build_object('address',snapshot->>'fromAddress','name',snapshot->>'fromName'),
      'to',jsonb_build_array(snapshot->>'to'),'cc','[]'::jsonb,'bcc','[]'::jsonb,
      'subject',snapshot->>'subject','text',snapshot->>'text') ||
      CASE WHEN snapshot->>'messageId' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('inReplyTo',snapshot->>'messageId') END)
  THEN RAISE EXCEPTION 'Reminder preview changed' USING ERRCODE='PT409'; END IF;
  RETURN public.begin_mail_send(p_user_id,p_account_id,private.commitment_reminder_key(p_user_id,p_commitment_id,p_version),p_proof,p_payload);
END
$$;

REVOKE ALL ON FUNCTION private.commitment_owned_addresses(uuid), private.commitment_due_attention(jsonb,timestamptz),
  private.commitment_reminder_key(uuid,uuid,integer), private.commitment_reminder_snapshot(uuid,uuid),
  public.list_commitment_attention(uuid[],uuid[]), public.read_commitment_reminder(uuid),
  public.begin_commitment_reminder(uuid,uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_commitment_attention(uuid[],uuid[]), public.read_commitment_reminder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_commitment_reminder(uuid,uuid,uuid,integer,text,jsonb) TO service_role;

COMMIT;
