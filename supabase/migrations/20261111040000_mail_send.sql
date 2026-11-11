BEGIN;

CREATE TABLE private.mail_send_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  request_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  provider text NOT NULL CHECK (provider IN ('gmail', 'smtp')),
  state text NOT NULL DEFAULT 'dispatching' CHECK (state IN ('dispatching', 'unknown', 'accepted', 'partial', 'rejected')),
  payload jsonb,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_reconcile_at timestamptz,
  FOREIGN KEY (account_id, user_id) REFERENCES public.source_accounts(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, request_key),
  CHECK ((payload IS NOT NULL) = (state IN ('dispatching', 'unknown')))
);
ALTER TABLE private.mail_send_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mail_send_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.mail_send_receipt(operation private.mail_send_operations, claimed boolean, reconcile boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id', operation.id, 'provider', operation.provider, 'state', operation.state,
    'messageId', '<' || operation.id::text || '@inboxai.invalid>',
    'providerId', operation.provider_id, 'claimed', claimed, 'reconcile', reconcile
  )
$$;
REVOKE ALL ON FUNCTION private.mail_send_receipt(private.mail_send_operations, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- A null payload only reads an existing operation. Only a committed insert wins dispatch.
CREATE FUNCTION public.begin_mail_send(p_user_id uuid, p_account_id uuid, p_request_key uuid, p_request_hash text, p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  operation private.mail_send_operations;
  account public.source_accounts;
  can_reconcile boolean := false;
BEGIN
  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid send request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO operation FROM private.mail_send_operations
    WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;

  IF NOT FOUND AND p_payload IS NOT NULL THEN
    SELECT * INTO account FROM public.source_accounts
      WHERE id=p_account_id AND user_id=p_user_id AND is_active IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Send account unavailable' USING ERRCODE='42501'; END IF;
    IF p_payload#>>'{from,address}' IS DISTINCT FROM account.email_address OR
       jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2097152 THEN
      RAISE EXCEPTION 'Invalid send payload' USING ERRCODE='22023';
    END IF;
    INSERT INTO private.mail_send_operations(user_id, account_id, request_key, request_hash, provider, payload)
      VALUES(p_user_id, p_account_id, p_request_key, p_request_hash,
        CASE WHEN account.auth_type='oauth_google' THEN 'gmail' ELSE 'smtp' END, p_payload)
      ON CONFLICT (user_id, request_key) DO NOTHING RETURNING * INTO operation;
    IF FOUND THEN RETURN private.mail_send_receipt(operation, true, false); END IF;

    SELECT * INTO operation FROM private.mail_send_operations
      WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;
  END IF;

  IF operation.id IS NULL THEN RETURN NULL; END IF;
  IF operation.account_id IS DISTINCT FROM p_account_id OR operation.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'Send key already used' USING ERRCODE='PT409';
  END IF;

  IF operation.state='dispatching' AND operation.created_at <= clock_timestamp()-interval '90 seconds' THEN
    UPDATE private.mail_send_operations SET state='unknown', updated_at=clock_timestamp()
      WHERE id=operation.id AND user_id=p_user_id AND account_id=p_account_id RETURNING * INTO operation;
  END IF;
  IF operation.state='unknown' AND operation.provider='gmail'
     AND (operation.next_reconcile_at IS NULL OR operation.next_reconcile_at<=clock_timestamp())
     AND EXISTS (SELECT 1 FROM public.source_accounts
       WHERE id=p_account_id AND user_id=p_user_id AND is_active IS TRUE AND auth_type='oauth_google') THEN
    UPDATE private.mail_send_operations SET next_reconcile_at=clock_timestamp()+interval '15 seconds'
      WHERE id=operation.id AND user_id=p_user_id AND account_id=p_account_id;
    can_reconcile := true;
  END IF;
  RETURN private.mail_send_receipt(operation, false, can_reconcile);
END $$;

CREATE FUNCTION public.finish_mail_send(p_user_id uuid, p_account_id uuid, p_operation_id uuid, p_state text, p_provider_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  operation private.mail_send_operations;
  v_email_id uuid;
  v_time timestamptz := clock_timestamp();
BEGIN
  -- Match the parent lock ordering of sync and credential writers.
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Send account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO operation FROM private.mail_send_operations
    WHERE id=p_operation_id AND user_id=p_user_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Send operation unavailable' USING ERRCODE='42501'; END IF;
  IF operation.state IN ('accepted', 'partial', 'rejected') THEN
    RETURN private.mail_send_receipt(operation, false, false);
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('unknown', 'accepted', 'partial', 'rejected')
     OR (p_state='partial' AND operation.provider<>'smtp')
     OR (operation.provider='gmail' AND p_state='accepted' AND COALESCE(p_provider_id,'') !~ '^[A-Za-z0-9_-]{1,128}$')
     OR (p_provider_id IS NOT NULL AND (operation.provider<>'gmail' OR p_state<>'accepted')) THEN
    RAISE EXCEPTION 'Invalid send outcome' USING ERRCODE='22023';
  END IF;

  IF p_state IN ('accepted', 'partial') THEN
    INSERT INTO public.emails(user_id, source_account_id, sync_namespace, original_uid, message_id,
      from_address, from_name, to_addresses, cc_addresses, subject, body_text, body_html, body_fetched,
      direction, sent_at, received_at, is_read, is_archived, category, send_status)
    VALUES(p_user_id, p_account_id, CASE WHEN operation.provider='gmail' THEN 'gmail' ELSE 'smtp-sent' END,
      p_provider_id, '<'||operation.id::text||'@inboxai.invalid>',
      operation.payload#>>'{from,address}', operation.payload#>>'{from,name}',
      operation.payload->'to', operation.payload->'cc', operation.payload->>'subject',
      operation.payload->>'text', operation.payload->>'html', true, 'outbound',
      v_time, v_time, true, operation.provider='gmail', 'work', CASE WHEN p_state='partial' THEN 'partial' ELSE 'sent' END)
    ON CONFLICT(source_account_id, sync_namespace, original_uid) DO UPDATE
      SET sent_at=COALESCE(emails.sent_at, EXCLUDED.sent_at), send_status=EXCLUDED.send_status
      WHERE emails.user_id=p_user_id
    RETURNING id INTO v_email_id;
    IF v_email_id IS NULL THEN RAISE EXCEPTION 'Send mirror ownership conflict' USING ERRCODE='42501'; END IF;
  END IF;

  UPDATE private.mail_send_operations
    SET state=p_state, provider_id=p_provider_id, updated_at=v_time,
        payload=CASE WHEN p_state='unknown' THEN payload ELSE NULL END
    WHERE id=operation.id AND user_id=p_user_id AND account_id=p_account_id RETURNING * INTO operation;
  RETURN private.mail_send_receipt(operation, false, false);
END $$;

REVOKE ALL ON FUNCTION public.begin_mail_send(uuid, uuid, uuid, text, jsonb),
  public.finish_mail_send(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_mail_send(uuid, uuid, uuid, text, jsonb),
  public.finish_mail_send(uuid, uuid, uuid, text, text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
