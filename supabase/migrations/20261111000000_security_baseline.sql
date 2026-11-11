-- Forward-only M0 hardening. Does not migrate credentials or silently repair data.
BEGIN;

-- Fresh initial_schema declares NUMERIC, while the legacy risk trigger only had
-- an INTEGER overload. Preserve stored values and thresholds; do not rescale data.
CREATE OR REPLACE FUNCTION public.get_phishing_risk_level(score NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT CASE WHEN score >= 80 THEN 'critical' WHEN score >= 60 THEN 'high'
  WHEN score >= 40 THEN 'medium' WHEN score >= 20 THEN 'low' ELSE 'safe' END $$;

-- The old definer function trusted caller-controlled p_user_id and bypassed RLS.
CREATE OR REPLACE FUNCTION public.set_primary_account(p_user_id UUID, p_account_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized tenant' USING ERRCODE = '42501';
  END IF;
  -- Validate before clearing existing primary. Serialize changes per owner.
  PERFORM 1 FROM public.source_accounts WHERE user_id = p_user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.source_accounts WHERE id = p_account_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;
  UPDATE public.source_accounts SET is_primary = (id = p_account_id)
  WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_primary_account(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_account(UUID, UUID) TO authenticated;

-- Own-profile RLS must not permit self-promotion. Server/service role may manage roles.
CREATE OR REPLACE FUNCTION public.guard_profile_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_admin IS TRUE THEN
        RAISE EXCEPTION 'Admin role is server managed' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Admin role is server managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_admin ON public.profiles;
CREATE TRIGGER guard_profile_admin BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin();

-- No direct public waitlist reads/writes. Existing server routes use service role.
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read only own whitelist membership" ON public.whitelist
FOR SELECT TO authenticated USING (lower(email) = lower(auth.jwt()->>'email'));

-- RLS already protects row ownership. Also protect cross-tenant foreign references.
CREATE POLICY "Email source belongs to tenant" ON public.emails AS RESTRICTIVE
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND (source_account_id IS NULL OR EXISTS (
  SELECT 1 FROM public.source_accounts a WHERE a.id = source_account_id AND a.user_id = auth.uid()
)));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['action_items', 'follow_ups', 'email_feedback',
    'classification_feedback', 'ai_classification_logs', 'email_action_logs', 'ai_feature_usage'] LOOP
    EXECUTE format('CREATE POLICY "Email evidence belongs to tenant" ON public.%I AS RESTRICTIVE
      FOR ALL TO authenticated USING (auth.uid() = user_id AND
        (email_id IS NULL OR EXISTS (SELECT 1 FROM public.emails e WHERE e.id = email_id AND e.user_id = auth.uid())))
      WITH CHECK (auth.uid() = user_id AND
        (email_id IS NULL OR EXISTS (SELECT 1 FROM public.emails e WHERE e.id = email_id AND e.user_id = auth.uid())))', t);
  END LOOP;
END;
$$;

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
COMMIT;
