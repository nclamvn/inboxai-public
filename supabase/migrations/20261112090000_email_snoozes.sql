BEGIN;

ALTER TABLE public.emails
  ADD COLUMN snooze_version integer NOT NULL DEFAULT 0,
  ADD COLUMN inbox_appearance_at timestamptz GENERATED ALWAYS AS (greatest(received_at, snoozed_until)) STORED;

CREATE INDEX emails_inbox_appearance ON public.emails(user_id,inbox_appearance_at DESC NULLS LAST,id DESC)
  WHERE direction='inbound' AND is_archived=false AND is_deleted=false AND provider_deleted=false;
CREATE INDEX emails_inbox_snooze ON public.emails(user_id,snoozed_until,id)
  WHERE direction='inbound' AND is_archived=false AND is_deleted=false AND provider_deleted=false AND snoozed_until IS NOT NULL;

-- The local browser fixture replaces this function in its disposable database.
CREATE FUNCTION private.email_snooze_now() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$ SELECT statement_timestamp() $$;

CREATE FUNCTION public.email_is_snoozed(e public.emails) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(e.snoozed_until>private.email_snooze_now(),false)
$$;

-- Keep the clock and the visibility filter on the same timestamp authority.
CREATE FUNCTION public.email_snooze_clock(p_accounts uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('now',private.email_snooze_now(),'nextAt',(
    SELECT min(e.snoozed_until) FROM public.emails e WHERE e.user_id=auth.uid()
      AND (p_accounts IS NULL OR e.source_account_id=ANY(p_accounts))
      AND e.direction='inbound' AND e.is_archived=false AND e.is_deleted=false AND e.provider_deleted=false
      AND e.snoozed_until>private.email_snooze_now()
  )) WHERE auth.uid() IS NOT NULL
$$;

CREATE FUNCTION private.bump_email_snooze_version() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  NEW.snooze_version := OLD.snooze_version + CASE WHEN OLD.snoozed_until IS DISTINCT FROM NEW.snoozed_until THEN 1 ELSE 0 END;
  RETURN NEW;
END $$;
CREATE TRIGGER bump_email_snooze_version BEFORE UPDATE OF snoozed_until,snooze_version ON public.emails
FOR EACH ROW EXECUTE FUNCTION private.bump_email_snooze_version();

CREATE TABLE private.email_snooze_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  expected_version integer NOT NULL,
  until_at timestamptz,
  version integer NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX email_snooze_receipts_source ON private.email_snooze_receipts(email_id);
ALTER TABLE private.email_snooze_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_snooze_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.change_email_snooze(p_email uuid,p_version integer,p_until timestamptz,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source public.emails; receipt private.email_snooze_receipts;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_email IS NULL OR p_request IS NULL OR p_version IS NULL OR p_version<0 OR
    (p_until IS NOT NULL AND NOT isfinite(p_until)) THEN RAISE SQLSTATE '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('snooze:'||actor::text||':'||p_request::text,0));
  SELECT * INTO receipt FROM private.email_snooze_receipts WHERE user_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF (receipt.email_id,receipt.expected_version,receipt.until_at) IS DISTINCT FROM (p_email,p_version,p_until)
      THEN RAISE SQLSTATE 'PT409'; END IF;
    RETURN jsonb_build_object('until',receipt.until_at,'version',receipt.version);
  END IF;

  SELECT * INTO source FROM public.emails WHERE id=p_email AND user_id=actor AND direction='inbound'
    AND is_deleted=false AND provider_deleted=false FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF source.snooze_version<>p_version OR (p_until IS NOT NULL AND source.is_archived IS DISTINCT FROM false)
    THEN RAISE SQLSTATE 'PT409'; END IF;
  IF p_until IS NOT NULL AND p_until<=private.email_snooze_now() THEN RAISE SQLSTATE '22023'; END IF;

  IF source.snoozed_until IS DISTINCT FROM p_until THEN
    UPDATE public.emails SET snoozed_until=p_until WHERE id=p_email AND user_id=actor RETURNING * INTO source;
  END IF;
  INSERT INTO private.email_snooze_receipts(user_id,request_id,email_id,expected_version,until_at,version)
    VALUES(actor,p_request,p_email,p_version,source.snoozed_until,source.snooze_version);
  RETURN jsonb_build_object('until',source.snoozed_until,'version',source.snooze_version);
END $$;

REVOKE ALL ON FUNCTION private.email_snooze_now(),private.bump_email_snooze_version() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.email_is_snoozed(public.emails),public.email_snooze_clock(uuid[]),
  public.change_email_snooze(uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.email_is_snoozed(public.emails),public.email_snooze_clock(uuid[]),
  public.change_email_snooze(uuid,integer,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
