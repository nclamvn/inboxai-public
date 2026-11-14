BEGIN;

CREATE TABLE private.commitment_warehouse_corrections (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  receipt_number text NOT NULL,
  number text NOT NULL CHECK (number ~ '^DC-[0-9]{1,12}$'),
  version integer NOT NULL,
  amount integer NOT NULL CHECK (amount BETWEEN 0 AND 9999999),
  source_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,commitment_id,number),
  FOREIGN KEY (user_id,commitment_id,receipt_number)
    REFERENCES private.commitment_warehouse_receipts(user_id,commitment_id,number) ON DELETE CASCADE,
  FOREIGN KEY (user_id,commitment_id,version)
    REFERENCES private.commitment_revisions(user_id,commitment_id,version) ON DELETE CASCADE,
  UNIQUE (user_id,commitment_id,version)
);
CREATE INDEX commitment_warehouse_correction_history
  ON private.commitment_warehouse_corrections(user_id,commitment_id,receipt_number,version DESC);
REVOKE ALL ON TABLE private.commitment_warehouse_corrections FROM PUBLIC,anon,authenticated,service_role;

-- Amount is absolute for the named receipt. Prior correction time is retained even if the email is removed.
CREATE FUNCTION private.commitment_warehouse_receipt_checkpoint(p_actor uuid,p_id uuid,p_number text)
RETURNS TABLE(original jsonb, latest jsonb, amount integer, effective_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT src.value, previous.evidence,
    COALESCE(previous.amount,(regexp_match(src.value->>'quote',
      '^(phiếu nhập|biên nhận) PN-[0-9]{1,12}[ ]{0,3}[:–-] (kho (đã )?nhận|thực nhập|thực nhận) ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$', 'i'))[4]::integer),
    COALESCE(previous.source_at,(src.value->>'receivedAt')::timestamptz)
  FROM private.commitment_warehouse_receipts w
  JOIN private.commitment_revisions r USING (user_id,commitment_id,version)
  CROSS JOIN LATERAL (SELECT private.commitment_sources(p_actor,r.anchors)->0 AS value) src
  LEFT JOIN LATERAL (
    SELECT c.amount,c.source_at,private.commitment_sources(p_actor,h.anchors)->0 AS evidence
    FROM private.commitment_warehouse_corrections c
    JOIN private.commitment_revisions h USING (user_id,commitment_id,version)
    WHERE c.user_id=p_actor AND c.commitment_id=p_id AND c.receipt_number=p_number
    ORDER BY c.version DESC LIMIT 1
  ) previous ON true
  WHERE w.user_id=p_actor AND w.commitment_id=p_id AND w.number=p_number
$$;

CREATE FUNCTION public.read_warehouse_correction_evidence(p_signals jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF octet_length(p_signals::text)>8192 OR jsonb_typeof(p_signals) IS DISTINCT FROM 'array' OR jsonb_array_length(p_signals)>24 THEN
    RAISE EXCEPTION 'Invalid warehouse correction scope' USING ERRCODE='22023';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',t.id,'reference',s.reference,'receiptNumber',s.receipt,'correctionNumber',s.correction,
    'original',p.original,'latest',p.latest,'amount',p.amount,'effectiveAt',p.effective_at,
    'duplicate',EXISTS (SELECT 1 FROM private.commitment_warehouse_corrections c
      WHERE c.user_id=actor AND c.commitment_id=t.id AND c.number=s.correction)))
    FROM (SELECT DISTINCT * FROM jsonb_to_recordset(p_signals) AS r(reference text,receipt text,correction text)) s
    CROSS JOIN LATERAL private.commitment_lifecycle_targets(actor,s.reference) t
    LEFT JOIN LATERAL private.commitment_warehouse_receipt_checkpoint(actor,t.id,s.receipt) p ON true
    WHERE s.reference ~ '^PO-[0-9]{1,12}$' AND s.receipt ~ '^PN-[0-9]{1,12}$' AND s.correction ~ '^DC-[0-9]{1,12}$'
      AND t.state ? 'receiving'), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.confirm_commitment_warehouse_correction(p_id uuid,p_request_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor uuid := auth.uid();
  head private.commitments;
  source public.emails;
  prior jsonb;
  proof record;
  remembered private.commitment_receiving_commands;
  pieces text[];
  quote text := p_command->>'quote';
  correction_number text;
  receipt_number text;
  corrected_amount integer;
  new_total integer;
  command_hash bytea;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_request_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'operation' IS DISTINCT FROM 'correct'
    OR octet_length(p_command::text)>4096 OR COALESCE(p_command->>'expectedVersion','') !~ '^[1-9][0-9]{0,9}$'
  THEN RAISE EXCEPTION 'Invalid correction command' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || actor || ':' || (p_command->>'emailId'),0));
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor || ':' || p_request_key,0));
  command_hash := sha256(convert_to(jsonb_build_array(p_id,p_command)::text,'UTF8'));
  SELECT * INTO remembered FROM private.commitment_receiving_commands WHERE user_id=actor AND request_key=p_request_key;
  IF FOUND THEN
    IF remembered.command_hash<>command_hash THEN RAISE EXCEPTION 'Receiving request reused' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('id',remembered.commitment_id,'version',remembered.version,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Receiving request reused' USING ERRCODE='PT409'; END IF;

  SELECT * INTO head FROM private.commitments WHERE id=p_id AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  IF NOT COALESCE(head.detection_reference ~ '^PO-[0-9]{1,12}$',false)
  THEN RAISE EXCEPTION 'Correction requires a cited purchase order' USING ERRCODE='PT409'; END IF;
  SELECT * INTO source FROM public.emails WHERE id=(p_command->>'emailId')::uuid AND user_id=actor
    AND direction='inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Warehouse email unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || head.detection_reference,0));
  SELECT * INTO head FROM private.commitments WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment unavailable' USING ERRCODE='PT404'; END IF;
  IF head.version <> (p_command->>'expectedVersion')::int THEN RAISE EXCEPTION 'Commitment changed' USING ERRCODE='PT409'; END IF;

  SELECT t.state INTO prior FROM private.commitment_lifecycle_targets(actor,head.detection_reference) t
    WHERE t.id=p_id AND NOT t.multi_origin AND t.origin_sender IS NOT NULL;
  pieces := regexp_match(quote,
    '^đính chính (DC-[0-9]{1,12}) cho (PN-[0-9]{1,12})[ ]{0,3}[:–-] (kho thực nhận|thực nhận) (0|[1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$', 'i');
  IF NOT COALESCE(prior ? 'receiving',false) OR prior->>'status' NOT IN ('open','completed') OR prior->>'review' IS NOT NULL
    OR (SELECT count(*) FROM private.commitment_lifecycle_targets(actor,head.detection_reference)) <> 1
    OR source.source_account_id::text IS DISTINCT FROM prior#>>'{receiving,accountId}'
    OR lower(btrim(source.from_address)) IS DISTINCT FROM prior#>>'{receiving,sender}'
    OR private.commitment_subject_reference(source.subject) IS DISTINCT FROM head.detection_reference
    OR p_command->>'sourceFingerprint' IS DISTINCT FROM private.commitment_detection_fingerprint(source)
    OR pieces IS NULL OR lower(pieces[5]) IS DISTINCT FROM prior#>>'{delivery,unit}'
    OR length(COALESCE(source.body_text,''))>8000
    OR NOT EXISTS (SELECT 1 FROM public.source_accounts a WHERE a.user_id=actor AND a.id=source.source_account_id AND a.is_active)
    OR NOT COALESCE((
      SELECT count(*)=1 AND bool_and(btrim(line)=quote)
      FROM regexp_split_to_table(source.body_text,E'\r?\n') WITH ORDINALITY AS msg(line,position)
      WHERE btrim(line) ~* '^(đính chính DC-[0-9]|(phiếu nhập|biên nhận) PN-[0-9])'
        AND position<COALESCE((
          SELECT min(pos) FROM regexp_split_to_table(source.body_text,E'\r?\n') WITH ORDINALITY AS q(text,pos)
          WHERE btrim(text) ~* '^(>|--([[:space:]]|$)|-{2,}[[:space:]]*(original message|forwarded message|thư gốc|thư được chuyển tiếp)|begin forwarded message:|from:|từ:|on .+ wrote:|vào .+ đã viết:)'
        ),9223372036854775807)
    ),false)
  THEN RAISE EXCEPTION 'Correction source does not match' USING ERRCODE='PT409'; END IF;

  correction_number := upper(pieces[1]);
  receipt_number := upper(pieces[2]);
  corrected_amount := pieces[4]::int;
  SELECT * INTO proof FROM private.commitment_warehouse_receipt_checkpoint(actor,p_id,receipt_number);
  PERFORM 1 FROM public.emails e WHERE e.user_id=actor
    AND e.id IN (SELECT (w.evidence->>'emailId')::uuid FROM private.commitment_warehouse_sources(actor,p_id) w)
    ORDER BY e.id FOR SHARE;
  SELECT * INTO proof FROM private.commitment_warehouse_receipt_checkpoint(actor,p_id,receipt_number);
  new_total := (prior#>>'{receiving,received}')::int - proof.amount + corrected_amount;
  IF proof.original->>'availability' IS DISTINCT FROM 'available'
    OR (proof.latest IS NOT NULL AND proof.latest->>'availability' IS DISTINCT FROM 'available')
    OR (source.received_at > proof.effective_at) IS DISTINCT FROM true
    OR proof.amount IS NULL OR corrected_amount=proof.amount
    OR EXISTS (SELECT 1 FROM private.commitment_warehouse_sources(actor,p_id) w
      WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
    OR (SELECT count(*) FROM private.commitment_warehouse_corrections w
      WHERE w.user_id=actor AND w.commitment_id=p_id)>=200
    OR new_total NOT BETWEEN 0 AND (prior#>>'{delivery,ordered}')::int
    OR EXISTS (SELECT 1 FROM private.commitment_warehouse_corrections w
      WHERE w.user_id=actor AND w.commitment_id=p_id AND w.number=correction_number)
  THEN RAISE EXCEPTION 'Correction duplicates, precedes or conflicts with the receipt' USING ERRCODE='PT409'; END IF;

  result := private.save_commitment(p_request_key,p_id,head.version,NULL,
    jsonb_set((prior-'review') || '{"status":"open"}','{receiving,received}',to_jsonb(new_total)),NULL,
    jsonb_build_array(
      jsonb_build_object('emailId',source.id,'field','body_text','quote',quote),
      jsonb_build_object('emailId',proof.original->>'emailId','field','body_text','quote',proof.original->>'quote')) ||
      CASE WHEN proof.latest IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
        jsonb_build_object('emailId',proof.latest->>'emailId','field','body_text','quote',proof.latest->>'quote')) END);
  INSERT INTO private.commitment_warehouse_corrections(user_id,commitment_id,receipt_number,number,version,amount,source_at)
    VALUES(actor,p_id,receipt_number,correction_number,(result->>'version')::int,corrected_amount,source.received_at);
  INSERT INTO private.commitment_receiving_commands VALUES(actor,p_id,(result->>'version')::int,p_request_key,command_hash);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.commitment_warehouse_sources(p_actor uuid,p_id uuid)
RETURNS TABLE(number text, evidence jsonb) LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT w.number,private.commitment_sources(p_actor,r.anchors)->0
  FROM (
    SELECT number,version FROM private.commitment_warehouse_receipts WHERE user_id=p_actor AND commitment_id=p_id
    UNION ALL
    SELECT number,version FROM private.commitment_warehouse_corrections WHERE user_id=p_actor AND commitment_id=p_id
  ) w JOIN private.commitment_revisions r ON r.user_id=p_actor AND r.commitment_id=p_id AND r.version=w.version
  ORDER BY w.version
$$;

REVOKE ALL ON FUNCTION private.commitment_warehouse_receipt_checkpoint(uuid,uuid,text),
  public.read_warehouse_correction_evidence(jsonb),public.confirm_commitment_warehouse_correction(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_warehouse_correction_evidence(jsonb),public.confirm_commitment_warehouse_correction(uuid,uuid,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.read_commitment_catchup(p_accounts uuid[],p_before_id uuid,p_source_id uuid,p_focus boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  before_at timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF cardinality(p_accounts) > 50 THEN RAISE EXCEPTION 'Invalid accounts' USING ERRCODE = '22023'; END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT COALESCE(received_at,created_at,'-infinity'::timestamptz) INTO before_at
      FROM public.emails WHERE user_id = actor AND id = p_before_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mail page unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;
  RETURN (
    WITH batch AS MATERIALIZED (
      SELECT q.email_id,q.scan_at,jsonb_build_object(
        'id',e.id,'accountId',e.source_account_id,'sender',e.from_address,'senderName',left(e.from_name,120),
        'subject',left(e.subject,501),'body',left(e.body_text,8001),'at',COALESCE(e.received_at,e.created_at),
        'receivedAt',e.received_at,'fingerprint',private.commitment_detection_fingerprint(e),
        'usedQuotes',consumption.quotes || q.dismissed,'manualUsed',false,
        'catchupToken',CASE WHEN q.hashes IS NOT NULL THEN q.token END
      ) AS source
      FROM private.commitment_catchup q
      JOIN public.emails e ON e.id = q.email_id AND e.user_id = actor
      CROSS JOIN LATERAL (
        SELECT COALESCE(array_agg(DISTINCT anchor->>'hash') FILTER (WHERE anchor->>'field' = 'body_text'), '{}') AS quotes,
          COALESCE(bool_or(c.reference_key !~ '^mail:[0-9a-f]{64}$' OR anchor->>'field' <> 'body_text'),false) AS manual
        FROM private.commitment_revisions r
        JOIN private.commitments c ON (c.user_id,c.id) = (r.user_id,r.commitment_id)
        CROSS JOIN LATERAL jsonb_array_elements(r.anchors) AS a(anchor)
        WHERE r.user_id = actor AND r.anchors @> jsonb_build_array(jsonb_build_object('emailId',e.id))
          AND anchor->>'emailId' = e.id::text
      ) consumption
      WHERE q.user_id = actor AND (COALESCE(cardinality(p_accounts),0) = 0 OR q.account_id = ANY(p_accounts))
        AND (p_before_id IS NULL OR (q.scan_at,q.email_id) < (before_at,p_before_id))
        AND (p_source_id IS NULL OR q.email_id = p_source_id)
        AND (NOT p_focus OR EXISTS (
          SELECT 1 FROM private.commitments c JOIN private.commitment_revisions r
            ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,c.version)
          WHERE c.user_id = actor AND c.detection_reference = q.reference AND (r.state->>'status' = 'open' OR (
            r.state->>'status'='completed' AND r.state ? 'receiving'
            AND q.account_id::text=r.state#>>'{receiving,accountId}'
            AND left(e.body_text,8001) ~* E'(^|[\r\n])[[:blank:]]*đính chính DC-[0-9]'
          ))
        ))
        AND NOT consumption.manual
        AND (NOT (q.hashes <@ (consumption.quotes || q.dismissed))
          OR (q.hashes IS NULL AND (p_focus OR p_source_id IS NOT NULL)))
      ORDER BY q.scan_at DESC,q.email_id DESC LIMIT 25
    ), page AS (
      SELECT * FROM batch ORDER BY scan_at DESC,email_id DESC LIMIT 24
    )
    SELECT jsonb_build_object('messages',COALESCE(
      (SELECT jsonb_agg(source ORDER BY scan_at DESC,email_id DESC) FROM page),'[]'::jsonb),
      'nextBeforeId', CASE WHEN (SELECT count(*) FROM batch) > 24
        THEN (SELECT email_id FROM page ORDER BY scan_at,email_id LIMIT 1) END)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.list_commitment_attention(p_accounts uuid[],p_reply_ids uuid[])
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
      WHERE c.user_id=actor AND (r.state->>'status'='open' OR (r.state->>'status'='completed' AND r.state ? 'receiving'))
    ), ordered AS (
      SELECT c.*, CASE WHEN c.id=ANY(p_reply_ids) THEN 'reply'
        WHEN c.state->>'status'<>'open' THEN NULL
        WHEN c.state#>>'{receiving,received}'=c.state#>>'{delivery,ordered}'
          AND c.state#>>'{delivery,delivered}'=c.state#>>'{delivery,ordered}'
          AND c.state->>'review' IS NULL THEN 'receiving_ready'
        WHEN ((c.state#>>'{receiving,received}')::int < (c.state#>>'{delivery,delivered}')::int AND (
          (c.state#>>'{receiving,received}')::int > 0 OR EXISTS (
            SELECT 1 FROM private.commitment_warehouse_corrections w WHERE w.user_id=actor AND w.commitment_id=c.id)
        )) THEN 'receiving'
        WHEN c.state->>'review' IS NOT NULL THEN 'review'
        ELSE private.commitment_due_attention(c.state,now_at) END AS reason
      FROM current c
    ), candidates AS (
      SELECT *, CASE reason WHEN 'reply' THEN 1 WHEN 'receiving' THEN 2 WHEN 'receiving_ready' THEN 3 WHEN 'review' THEN 4 WHEN 'overdue' THEN 5 ELSE 6 END AS bucket,
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


CREATE OR REPLACE FUNCTION private.commitment_reminder_snapshot(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version',c.version,'accountId',a.id,'fromAddress',a.email_address,
    'fromName',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1)),
    'to',lower(btrim(head.state->>'ownerEmail')),
    'subject',CASE WHEN e.subject IS NULL OR btrim(e.subject)='' OR e.subject ~ '[[:cntrl:]]'
      THEN 'Re: Theo dõi cam kết ' || c.detection_reference
      WHEN e.subject ~* '^re:' THEN btrim(left(e.subject,500)) ELSE 'Re: ' || btrim(left(e.subject,496)) END,
    'text',CASE WHEN ((head.state#>>'{receiving,received}')::int < (head.state#>>'{delivery,delivered}')::int AND (
      (head.state#>>'{receiving,received}')::int > 0 OR EXISTS (
        SELECT 1 FROM private.commitment_warehouse_corrections w WHERE w.user_id=p_actor AND w.commitment_id=c.id)
    ))
      THEN format(E'Chào anh/chị,\n\nKho đã ghi nhận %s/%s %s cho %s, còn thiếu %s %s so với số lượng đặt. Anh/chị vui lòng kiểm tra và xác nhận lịch giao phần còn thiếu.\n\nCảm ơn anh/chị.',
        head.state#>>'{receiving,received}',head.state#>>'{delivery,ordered}',head.state#>>'{delivery,unit}',
        c.detection_reference,
        (head.state#>>'{delivery,ordered}')::int-(head.state#>>'{receiving,received}')::int,head.state#>>'{delivery,unit}')
      ELSE format(E'Chào anh/chị,\n\nTôi muốn hỏi tiến độ cam kết “%s” (hạn %s). Anh/chị có thể xác nhận tình trạng hiện tại hoặc lịch mới được không?\n\nCảm ơn anh/chị.',
      head.state->>'title', COALESCE(to_char((head.state->>'dueOn')::date,'DD/MM/YYYY'),
        to_char((head.state->>'dueAt')::timestamptz AT TIME ZONE INTERVAL '+07:00','HH24:MI DD/MM/YYYY') || ' (UTC+7)')) END,
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
    AND (private.commitment_due_attention(head.state,statement_timestamp()) IS NOT NULL
      OR ((head.state#>>'{receiving,received}')::int < (head.state#>>'{delivery,delivered}')::int AND (
      (head.state#>>'{receiving,received}')::int > 0 OR EXISTS (
        SELECT 1 FROM private.commitment_warehouse_corrections w WHERE w.user_id=p_actor AND w.commitment_id=c.id)
    )))
    AND (NOT (head.state ? 'receiving') OR (
      head.state#>>'{receiving,received}' IS DISTINCT FROM head.state#>>'{delivery,ordered}' AND
      NOT EXISTS (SELECT 1 FROM private.commitment_warehouse_sources(p_actor,p_id) w
        WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
    ))
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


CREATE OR REPLACE FUNCTION public.ask_warehouse_reconciliation(p_reference text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  target record;
  supplier jsonb;
  receipts jsonb;
  evidence jsonb;
  source_count integer;
  last_reopen uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_reference,'') !~ '^PO-[0-9]{1,12}$' THEN RETURN '{}'::jsonb; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  IF (SELECT count(*) FROM private.commitment_lifecycle_targets(actor,p_reference)) <> 1 THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO target FROM private.commitment_lifecycle_targets(actor,p_reference);
  IF NOT (target.state ? 'receiving') THEN RETURN '{}'::jsonb; END IF;
  supplier := private.commitment_supplier_source(actor,target.id);
  SELECT COALESCE(jsonb_agg(w.evidence || jsonb_build_object('correction',w.number LIKE 'DC-%') ORDER BY w.number),'[]'::jsonb) INTO receipts
    FROM private.commitment_warehouse_sources(actor,target.id) w;
  WITH sources AS (
    SELECT supplier AS value,0 AS role,0::bigint AS position
    UNION ALL SELECT value,1,ordinality FROM jsonb_array_elements(receipts) WITH ORDINALITY
  ), scoped AS (
    SELECT s.role,s.position,s.value || jsonb_build_object(
      'version',private.ask_answer_version(e),'sender',e.from_address,'account',a.email_address,'at',e.received_at) AS value
    FROM sources s JOIN public.emails e ON e.user_id=actor AND e.id=(s.value->>'emailId')::uuid
    LEFT JOIN public.source_accounts a ON a.user_id=actor AND a.id=e.source_account_id
    WHERE s.value->>'availability'='available' AND private.ask_scope(e,actor,p_filters)
  )
  SELECT COALESCE(jsonb_agg(value ORDER BY role,position) FILTER (WHERE position<=6),'[]'::jsonb), count(*)
    INTO evidence,source_count FROM scoped;
  IF source_count<>jsonb_array_length(receipts)+1 THEN RETURN '{}'::jsonb; END IF;
  SELECT (r.anchors->0->>'emailId')::uuid INTO last_reopen
  FROM private.commitment_warehouse_corrections w
  JOIN private.commitment_revisions r USING (user_id,commitment_id,version)
  JOIN private.commitment_revisions before ON (before.user_id,before.commitment_id,before.version)=(r.user_id,r.commitment_id,r.version-1)
  WHERE w.user_id=actor AND w.commitment_id=target.id AND before.state->>'status'='completed'
  ORDER BY w.version DESC LIMIT 1;
  -- The API cites every receipt or abstains from the aggregate.
  IF source_count>7 THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('status',target.state->>'status','commitmentId',target.id,
    'ordered',target.state#>'{delivery,ordered}','reported',target.state#>'{delivery,delivered}',
    'received',target.state#>'{receiving,received}','unit',target.state#>'{delivery,unit}',
    'supplier',evidence->0,
    'receipts',COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(evidence-0) WHERE value->>'correction'='false'),'[]'::jsonb),
    'corrections',COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(evidence-0) WHERE value->>'correction'='true'),'[]'::jsonb),
    'reopenedBy',last_reopen);
END;
$$;

COMMIT;
