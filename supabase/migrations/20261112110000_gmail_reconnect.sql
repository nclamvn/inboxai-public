BEGIN;

CREATE TABLE private.gmail_reconnect_required (
  account_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  FOREIGN KEY (account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE
);
ALTER TABLE private.gmail_reconnect_required ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gmail_reconnect_required FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.gmail_needs_reconnect(p_user_id uuid,p_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM private.gmail_reconnect_required
    WHERE account_id=p_account_id AND user_id=p_user_id)
$$;

-- A failed request using old credentials cannot re-block a freshly authorized account.
CREATE FUNCTION public.mark_gmail_reconnect(p_user_id uuid,p_account_id uuid,p_revision integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id
    AND auth_type='oauth_google' AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM private.account_credentials
    WHERE account_id=p_account_id AND user_id=p_user_id AND kind='google' AND revision=p_revision)
  THEN RETURN false; END IF;
  INSERT INTO private.gmail_reconnect_required(account_id,user_id) VALUES(p_account_id,p_user_id)
    ON CONFLICT (account_id) DO NOTHING;
  RETURN true;
END $$;

-- Store the fresh grant and fence old workers in one transaction, preserving the checkpoint.
CREATE FUNCTION public.store_gmail_reconnect(p_user_id uuid,p_account_id uuid,p_expected_revision integer,p_envelope jsonb,
  p_metadata jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE next_revision integer;
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id
    AND auth_type='oauth_google' AND (is_active OR p_metadata IS NOT NULL) FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  next_revision := public.store_account_credential(p_user_id,p_account_id,'google',p_envelope,p_expected_revision,p_metadata);
  DELETE FROM private.gmail_reconnect_required WHERE account_id=p_account_id AND user_id=p_user_id;
  UPDATE private.account_sync SET lease_id=NULL,lease_until=NULL,fence=fence+1,failures=0,retry_at=NULL,last_error=NULL
    WHERE account_id=p_account_id AND user_id=p_user_id;
  UPDATE public.source_accounts SET sync_status='pending',sync_error=NULL WHERE id=p_account_id AND user_id=p_user_id;
  RETURN next_revision;
END $$;

-- A worker that discovers revocation during preflight releases its lease without spending a send attempt.
CREATE FUNCTION public.defer_scheduled_gmail(p_actor uuid,p_id uuid,p_lease uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE private.scheduled_mail q SET lease=NULL,lease_until=NULL,attempts=GREATEST(q.attempts-1,0),retry_at=NULL
  WHERE q.id=p_id AND q.user_id=p_actor AND q.lease=p_lease AND NOT EXISTS (
    SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=q.user_id AND op.request_key=q.request_key)
$$;

REVOKE ALL ON FUNCTION private.gmail_needs_reconnect(uuid,uuid),
  public.mark_gmail_reconnect(uuid,uuid,integer),public.store_gmail_reconnect(uuid,uuid,integer,jsonb,jsonb),
  public.defer_scheduled_gmail(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_gmail_reconnect(uuid,uuid,integer),
  public.store_gmail_reconnect(uuid,uuid,integer,jsonb,jsonb),public.defer_scheduled_gmail(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_account_sync(p_user_id uuid,p_account_id uuid,p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.source_accounts; state private.account_sync;
BEGIN
 SELECT * INTO account FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT account.is_active OR p_provider IS NULL OR p_provider NOT IN ('gmail','imap') OR
   (p_provider='gmail') IS DISTINCT FROM (account.auth_type='oauth_google') THEN
   RAISE EXCEPTION 'Sync account unavailable' USING ERRCODE='42501'; END IF;
 IF p_provider='gmail' AND private.gmail_needs_reconnect(p_user_id,p_account_id) THEN RETURN NULL; END IF;
 INSERT INTO private.account_sync(account_id,user_id,provider) VALUES(p_account_id,p_user_id,p_provider) ON CONFLICT DO NOTHING;
 SELECT * INTO state FROM private.account_sync WHERE account_id=p_account_id AND user_id=p_user_id FOR UPDATE;
 IF state.lease_until>clock_timestamp() OR state.retry_at>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE private.account_sync SET provider=p_provider,cursor=CASE WHEN provider=p_provider THEN cursor ELSE NULL END,
   last_attempt=clock_timestamp(),lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '150 seconds',fence=fence+1
 WHERE account_id=p_account_id AND user_id=p_user_id RETURNING * INTO state;
 UPDATE public.source_accounts SET sync_status='syncing',sync_error=NULL WHERE id=p_account_id AND user_id=p_user_id;
 RETURN jsonb_build_object('id',state.lease_id,'fence',state.fence,'revision',state.revision,'cursor',state.cursor);
END $$;

CREATE OR REPLACE FUNCTION public.list_due_sync_accounts(p_limit integer DEFAULT 10,p_user_id uuid DEFAULT NULL,p_force boolean DEFAULT false)
RETURNS SETOF public.source_accounts LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT a.* FROM public.source_accounts a LEFT JOIN private.account_sync s ON s.account_id=a.id AND s.user_id=a.user_id
 WHERE a.is_active AND (a.auth_type IS DISTINCT FROM 'oauth_google' OR NOT private.gmail_needs_reconnect(a.user_id,a.id)) AND (p_user_id IS NULL OR a.user_id=p_user_id) AND (s.lease_until IS NULL OR s.lease_until<=clock_timestamp())
 AND (s.retry_at IS NULL OR s.retry_at<=clock_timestamp())
 AND (p_force OR a.sync_status IS DISTINCT FROM 'idle' OR a.last_sync_at IS NULL OR a.last_sync_at<clock_timestamp()-interval '1 minute')
 ORDER BY s.last_attempt ASC NULLS FIRST,a.id LIMIT LEAST(GREATEST(p_limit,1),50)
$$;

CREATE OR REPLACE FUNCTION public.read_commitment_catchup_status(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF cardinality(p_accounts) > 50 THEN RAISE EXCEPTION 'Invalid accounts' USING ERRCODE = '22023'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',a.id,'email',a.email_address,'lastSyncAt',a.last_sync_at,'status',
        CASE WHEN a.auth_type='oauth_google' AND private.gmail_needs_reconnect(actor,a.id) THEN 'reconnect' ELSE a.sync_status END,
      'waitingAnalysis',(SELECT count(*) FROM private.commitment_catchup q
        WHERE q.user_id = actor AND q.account_id = a.id AND q.hashes IS NULL)
    ) ORDER BY a.email_address,a.id),'[]'::jsonb)
    FROM public.source_accounts a WHERE a.user_id = actor AND a.is_active
      AND (COALESCE(cardinality(p_accounts),0) = 0 OR a.id = ANY(p_accounts))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_scheduled_mail_send(p_user_id uuid,p_account_id uuid,p_id uuid,p_lease uuid,
  p_key uuid,p_hash text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET inboxai.scheduled_mail_lease='' AS $$
DECLARE q private.scheduled_mail;
BEGIN
  SELECT * INTO q FROM private.scheduled_mail WHERE id=p_id AND user_id=p_user_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR q.request_key IS DISTINCT FROM p_key OR q.request_hash IS DISTINCT FROM p_hash
    OR q.lease IS DISTINCT FROM p_lease OR q.lease_until IS NULL OR q.lease_until<=clock_timestamp()
    OR q.canceled OR q.failed OR q.send_at>private.scheduled_mail_now()
  THEN RAISE SQLSTATE 'PT409'; END IF;
  PERFORM 1 FROM public.source_accounts WHERE id=p_account_id AND user_id=p_user_id
    AND auth_type='oauth_google' AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501'; END IF;
  IF private.gmail_needs_reconnect(p_user_id,p_account_id) THEN RAISE SQLSTATE 'PT423'; END IF;
  PERFORM set_config('inboxai.scheduled_mail_lease',p_lease::text,true);
  IF q.compose_id IS NOT NULL THEN
    RETURN public.begin_file_compose(p_user_id,p_account_id,q.compose_id,p_key,p_hash,p_payload);
  END IF;
  RETURN public.begin_reply_send(p_user_id,p_account_id,q.reply_id,p_key,p_hash,p_payload);
END $$;

CREATE OR REPLACE FUNCTION public.claim_scheduled_mail() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  WITH due AS (
    SELECT q.id FROM private.scheduled_mail q
    LEFT JOIN private.mail_send_operations op ON op.user_id=q.user_id AND op.request_key=q.request_key
    WHERE NOT private.gmail_needs_reconnect(q.user_id,q.account_id) AND NOT q.canceled AND NOT q.failed AND q.attempts<8
      AND q.send_at<=private.scheduled_mail_now()
      AND (q.retry_at IS NULL OR q.retry_at<=private.scheduled_mail_now())
      AND (q.lease_until IS NULL OR q.lease_until<=clock_timestamp())
      AND (op.id IS NULL OR op.state IN ('dispatching','unknown'))
    ORDER BY q.send_at,q.id LIMIT 3 FOR UPDATE OF q SKIP LOCKED
  ), leased AS (
    UPDATE private.scheduled_mail q SET lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',
      attempts=q.attempts+1 FROM due WHERE q.id=due.id RETURNING q.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'actor',q.user_id,'accountId',q.account_id,
    'key',q.request_key,'hash',q.request_hash,'lease',q.lease,'input',COALESCE(c.approved,r.approved))),'[]'::jsonb)
  FROM leased q LEFT JOIN private.file_compose_drafts c ON c.id=q.compose_id AND c.user_id=q.user_id
    LEFT JOIN private.reply_drafts r ON r.id=q.reply_id AND r.user_id=q.user_id
$$;

CREATE OR REPLACE FUNCTION public.list_scheduled_mail() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(item ORDER BY rank,send_at DESC,id),'[]'::jsonb) FROM (
    SELECT q.id,q.send_at,
      CASE WHEN q.canceled OR op.state IN ('accepted','partial') THEN 1 ELSE 0 END AS rank,
      jsonb_build_object('id',q.id,'draftId',q.compose_id,'sourceId',q.source_id,'version',q.version,
        'sendAt',q.send_at,'account',a.email_address,'accountId',q.account_id,
        'reconnectRequired',NOT q.canceled AND COALESCE(op.state,'') NOT IN ('accepted','partial')
          AND private.gmail_needs_reconnect(q.user_id,q.account_id),'subject',q.subject,'to',q.recipients,'cc',q.cc,
        'state',CASE WHEN q.canceled THEN 'canceled' WHEN op.state IS NOT NULL THEN op.state
          WHEN q.failed OR (q.attempts>=8 AND q.lease_until<=clock_timestamp()) THEN 'failed'
          WHEN q.attempts>0 THEN 'dispatching' ELSE 'scheduled' END,
        'sentId',(SELECT e.id FROM public.emails e WHERE e.user_id=q.user_id AND e.source_account_id=q.account_id
          AND e.direction='outbound' AND e.message_id='<'||op.id::text||'@inboxai.invalid>'
          AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE ORDER BY e.id LIMIT 1)) AS item
    FROM private.scheduled_mail q JOIN public.source_accounts a ON a.id=q.account_id AND a.user_id=q.user_id
    LEFT JOIN private.mail_send_operations op ON op.user_id=q.user_id AND op.account_id=q.account_id AND op.request_key=q.request_key
    WHERE q.user_id=actor ORDER BY rank,q.send_at DESC,q.id LIMIT 100
  ) rows);
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
