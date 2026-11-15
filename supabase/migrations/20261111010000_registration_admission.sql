BEGIN;
ALTER TABLE public.whitelist ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE public.registration_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'open_beta' CHECK (mode IN ('open_beta', 'whitelist')),
  max_users integer NOT NULL DEFAULT 100 CHECK (max_users BETWEEN 1 AND 100000)
);
INSERT INTO public.registration_policy DEFAULT VALUES;
ALTER TABLE public.registration_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_policy FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.registration_policy TO service_role;

CREATE TABLE public.registration_attempts (
  scope text NOT NULL CHECK (scope IN ('ip', 'email')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (scope, subject_hash, window_start)
);
ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.registration_attempts TO service_role;

CREATE FUNCTION public.consume_registration_attempt(p_ip_key text, p_email_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ip_count integer; email_count integer; now_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.registration_attempts WHERE ctid IN (
    SELECT ctid FROM public.registration_attempts WHERE window_start < now_at - interval '2 hours' LIMIT 1000
  );
  INSERT INTO public.registration_attempts VALUES ('ip', p_ip_key,
    to_timestamp(floor(extract(epoch FROM now_at) / 900) * 900), 1)
  ON CONFLICT (scope, subject_hash, window_start) DO UPDATE SET attempts = registration_attempts.attempts + 1
  RETURNING attempts INTO ip_count;
  IF ip_count > 20 THEN RETURN false; END IF;
  INSERT INTO public.registration_attempts VALUES ('email', p_email_key, date_trunc('hour', now_at), 1)
  ON CONFLICT (scope, subject_hash, window_start) DO UPDATE SET attempts = registration_attempts.attempts + 1
  RETURNING attempts INTO email_count;
  RETURN email_count <= 6;
END;
$$;

CREATE FUNCTION public.registration_admission(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE policy public.registration_policy; allowed boolean;
BEGIN
  SELECT * INTO policy FROM public.registration_policy WHERE singleton;
  IF NOT FOUND OR NOT policy.enabled THEN
    RETURN jsonb_build_object('enabled', false, 'allowed', false);
  END IF;
  allowed := (SELECT count(*) FROM auth.users) < policy.max_users;
  allowed := allowed AND NOT EXISTS (
    SELECT 1 FROM public.whitelist WHERE lower(email) = lower(p_email) AND NOT is_active
  );
  IF policy.mode = 'whitelist' THEN
    allowed := allowed AND (EXISTS (SELECT 1 FROM public.whitelist WHERE lower(email) = lower(p_email) AND is_active)
      OR EXISTS (SELECT 1 FROM public.access_requests WHERE lower(email) = lower(p_email) AND status = 'approved'));
  END IF;
  RETURN jsonb_build_object('enabled', true, 'allowed', allowed);
END;
$$;

CREATE FUNCTION public.enforce_registration_admission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE verdict jsonb;
BEGIN
  -- Serialize admission, including direct Auth API calls that bypass Next.
  PERFORM 1 FROM public.registration_policy WHERE singleton FOR UPDATE;
  verdict := public.registration_admission(NEW.email);
  IF NOT COALESCE((verdict->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Registration is unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_registration_admission BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_admission();

-- Preserve the existing page membership gate for newly admitted accounts.
-- Confirmation is still required by Auth before a session can be obtained.
-- Never reactivate a revoked membership or backfill privileges for legacy users.
CREATE FUNCTION public.record_registration_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.whitelist(email, is_active) VALUES (lower(NEW.email), true)
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_registration_membership AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.record_registration_membership();

REVOKE ALL ON FUNCTION public.consume_registration_attempt(text,text), public.registration_admission(text),
  public.enforce_registration_admission(), public.record_registration_membership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_registration_attempt(text,text), public.registration_admission(text) TO service_role;
COMMIT;
