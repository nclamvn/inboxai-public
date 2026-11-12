BEGIN;

CREATE TABLE private.personal_mail_rules (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  sender text NOT NULL CHECK (length(sender) BETWEEN 3 AND 320),
  category text NOT NULL CHECK (category IN ('work','personal','transaction','promotion','newsletter','social')),
  preview_token text NOT NULL,
  applied_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  undone_at timestamptz,
  restored_count integer NOT NULL DEFAULT 0,
  kept_count integer NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id,user_id) REFERENCES public.source_accounts(id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX personal_mail_one_sender_rule ON private.personal_mail_rules(account_id,sender) WHERE undone_at IS NULL;
CREATE INDEX personal_mail_rules_owner ON private.personal_mail_rules(user_id,created_at DESC,id DESC);

CREATE TABLE private.personal_mail_categories (
  email_id uuid PRIMARY KEY REFERENCES public.emails(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('work','personal','transaction','promotion','newsletter','social','spam','uncategorized')),
  rule_id uuid REFERENCES private.personal_mail_rules(id) ON DELETE SET NULL,
  manual boolean NOT NULL
);
CREATE INDEX personal_mail_categories_rule ON private.personal_mail_categories(rule_id);
CREATE INDEX personal_mail_inbox_sender ON public.emails(source_account_id,lower(btrim(from_address)),id)
  WHERE direction='inbound' AND NOT is_archived AND NOT is_deleted AND NOT provider_deleted;
ALTER TABLE private.personal_mail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.personal_mail_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.personal_mail_rules,private.personal_mail_categories FROM PUBLIC,anon,authenticated,service_role;

-- PostgREST exposes the effective label for messages already visible to the caller.
CREATE FUNCTION public.mail_category(mail public.emails) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(
    (SELECT c.category FROM private.personal_mail_categories c
      WHERE c.email_id=mail.id AND c.user_id=mail.user_id AND c.user_id=auth.uid()
        AND (c.manual OR c.rule_id IS NOT NULL)
        AND (mail.category IS DISTINCT FROM 'spam' OR c.category='spam')),
    mail.category)
$$;

CREATE FUNCTION private.apply_personal_mail_rule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO private.personal_mail_categories(email_id,user_id,category,rule_id,manual)
  SELECT NEW.id,NEW.user_id,r.category,r.id,false
  FROM private.personal_mail_rules r
  WHERE r.account_id=NEW.source_account_id AND r.user_id=NEW.user_id
    AND r.sender=lower(btrim(NEW.from_address)) AND r.undone_at IS NULL
  ON CONFLICT (email_id) DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER apply_personal_mail_rule AFTER INSERT ON public.emails FOR EACH ROW
  WHEN (NEW.sync_namespace='gmail' AND NEW.direction='inbound' AND NOT NEW.is_archived
    AND NOT NEW.is_deleted AND NOT NEW.provider_deleted AND NEW.category IS DISTINCT FROM 'spam')
  EXECUTE FUNCTION private.apply_personal_mail_rule();

-- The Gmail page writer locks this account before inserting. Rule confirmation and
-- removal take the same lock so a new provider message observes one active rule state.
CREATE FUNCTION private.personal_mail_source(p_actor uuid,p_email uuid,p_lock boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source record;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.source_accounts a JOIN public.emails e ON e.source_account_id=a.id AND e.user_id=a.user_id
    WHERE e.id=p_email AND a.user_id=p_actor AND a.is_active AND a.provider='gmail' FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='PT404'; END IF;
  END IF;
  SELECT a.id,a.email_address,lower(btrim(e.from_address)) AS sender INTO source
  FROM public.emails e JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=e.user_id
  WHERE e.id=p_email AND e.user_id=p_actor AND e.direction='inbound' AND e.sync_namespace='gmail'
    AND NOT e.is_deleted AND NOT e.provider_deleted AND a.is_active AND a.provider='gmail';
  IF NOT FOUND OR COALESCE(length(source.sender),0) NOT BETWEEN 3 AND 320 OR position('@' IN source.sender)=0 THEN
    RAISE EXCEPTION 'Source unavailable' USING ERRCODE='PT404';
  END IF;
  RETURN jsonb_build_object('accountId',source.id,'account',source.email_address,'sender',source.sender);
END $$;

CREATE FUNCTION private.personal_mail_candidates(p_actor uuid,p_account uuid,p_sender text)
RETURNS SETOF public.emails LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT e.* FROM public.emails e
  WHERE e.user_id=p_actor AND e.source_account_id=p_account AND e.sync_namespace='gmail'
    AND lower(btrim(e.from_address))=p_sender AND e.direction='inbound' AND NOT e.is_archived
    AND NOT e.is_deleted AND NOT e.provider_deleted AND e.category IS DISTINCT FROM 'spam'
  ORDER BY e.id
$$;

CREATE FUNCTION private.personal_mail_snapshot(p_actor uuid,p_source jsonb,p_email uuid,p_category text,p_existing boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE candidates jsonb := '[]'; snapshot jsonb;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('work','personal','transaction','promotion','newsletter','social') OR p_existing IS NULL THEN
    RAISE EXCEPTION 'Invalid rule' USING ERRCODE='22023';
  END IF;
  IF p_existing THEN
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'id'),'[]') INTO candidates
    FROM (
      SELECT jsonb_build_object('id',e.id,'subject',left(e.subject,200),'category',e.category) AS item
      FROM private.personal_mail_candidates(p_actor,(p_source->>'accountId')::uuid,p_source->>'sender') e
      WHERE NOT EXISTS (SELECT 1 FROM private.personal_mail_categories c WHERE c.email_id=e.id)
      ORDER BY e.id LIMIT 201
    ) matched;
  END IF;
  snapshot := p_source || jsonb_build_object('emailId',p_email,'category',p_category,'includeExisting',p_existing,'items',candidates);
  RETURN snapshot || jsonb_build_object('token',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION private.personal_mail_rule_result(rule private.personal_mail_rules) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',rule.id,'account',a.email_address,'sender',rule.sender,'category',rule.category,
    'applied',rule.applied_count,'undone',rule.undone_at IS NOT NULL,'restored',rule.restored_count,'kept',rule.kept_count)
  FROM public.source_accounts a WHERE a.id=rule.account_id AND a.user_id=rule.user_id
$$;

CREATE FUNCTION public.preview_personal_mail_rule(p_email uuid,p_category text,p_existing boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source jsonb;
BEGIN
  source := private.personal_mail_source(actor,p_email,false);
  IF EXISTS (SELECT 1 FROM private.personal_mail_rules r WHERE r.user_id=actor AND r.account_id=(source->>'accountId')::uuid
      AND r.sender=source->>'sender' AND r.undone_at IS NULL) THEN
    RAISE EXCEPTION 'Existing sender rule' USING ERRCODE='PT409';
  END IF;
  RETURN private.personal_mail_snapshot(actor,source,p_email,p_category,p_existing);
END $$;

CREATE FUNCTION public.confirm_personal_mail_rule(p_email uuid,p_category text,p_existing boolean,p_token text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); source jsonb; snapshot jsonb; rule private.personal_mail_rules; changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid confirmation' USING ERRCODE='22023';
  END IF;
  SELECT * INTO rule FROM private.personal_mail_rules WHERE id=p_id AND user_id=actor;
  IF FOUND THEN
    IF rule.preview_token<>p_token THEN RAISE EXCEPTION 'Confirmation conflict' USING ERRCODE='PT409'; END IF;
    RETURN private.personal_mail_rule_result(rule);
  END IF;
  source := private.personal_mail_source(actor,p_email,true);
  -- Check again after locking against a concurrent retry.
  SELECT * INTO rule FROM private.personal_mail_rules WHERE id=p_id AND user_id=actor;
  IF FOUND THEN
    IF rule.preview_token<>p_token THEN RAISE EXCEPTION 'Confirmation conflict' USING ERRCODE='PT409'; END IF;
    RETURN private.personal_mail_rule_result(rule);
  END IF;
  IF p_existing THEN
    PERFORM 1 FROM public.emails e
    WHERE e.id IN (
      SELECT matched.id FROM private.personal_mail_candidates(actor,(source->>'accountId')::uuid,source->>'sender') matched
      WHERE NOT EXISTS (SELECT 1 FROM private.personal_mail_categories c WHERE c.email_id=matched.id)
      ORDER BY matched.id LIMIT 201
    ) ORDER BY e.id FOR UPDATE;
  END IF;
  snapshot := private.personal_mail_snapshot(actor,source,p_email,p_category,p_existing);
  IF snapshot->>'token'<>p_token OR jsonb_array_length(snapshot->'items')>200 THEN
    RAISE EXCEPTION 'Preview changed or exceeds limit' USING ERRCODE='PT409';
  END IF;
  INSERT INTO private.personal_mail_rules(id,user_id,account_id,sender,category,preview_token)
  VALUES (p_id,actor,(source->>'accountId')::uuid,source->>'sender',p_category,p_token)
  ON CONFLICT DO NOTHING RETURNING * INTO rule;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing sender rule' USING ERRCODE='PT409'; END IF;
  INSERT INTO private.personal_mail_categories(email_id,user_id,category,rule_id,manual)
  SELECT (item->>'id')::uuid,actor,p_category,p_id,false FROM jsonb_array_elements(snapshot->'items') item;
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE private.personal_mail_rules SET applied_count=changed WHERE id=p_id RETURNING * INTO rule;
  RETURN private.personal_mail_rule_result(rule);
END $$;

CREATE FUNCTION public.set_personal_mail_category(p_emails uuid[],p_category text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF COALESCE(cardinality(p_emails),0) NOT BETWEEN 1 AND 200 OR array_position(p_emails,NULL) IS NOT NULL OR p_category IS NULL
    OR p_category NOT IN ('work','personal','transaction','promotion','newsletter','social','spam','uncategorized') THEN
    RAISE EXCEPTION 'Invalid label' USING ERRCODE='22023';
  END IF;
  WITH owned AS MATERIALIZED (
    SELECT e.id FROM public.emails e WHERE e.id=ANY(p_emails) AND e.user_id=actor
      AND NOT e.provider_deleted ORDER BY e.id FOR UPDATE
  ), changed_mail AS (
    UPDATE public.emails e SET category=p_category FROM owned
    WHERE e.id=owned.id AND e.user_id=actor RETURNING e.id
  )
  INSERT INTO private.personal_mail_categories(email_id,user_id,category,manual)
  SELECT id,actor,p_category,true FROM changed_mail
  ON CONFLICT (email_id) DO UPDATE SET category=EXCLUDED.category,manual=true
  WHERE personal_mail_categories.user_id=actor;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed<>(SELECT count(DISTINCT id) FROM unnest(p_emails) id) THEN
    RAISE EXCEPTION 'Message unavailable' USING ERRCODE='PT404';
  END IF;
  RETURN changed;
END $$;

CREATE FUNCTION public.undo_personal_mail_rule(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); rule private.personal_mail_rules; restored integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT * INTO rule FROM private.personal_mail_rules WHERE id=p_id AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM 1 FROM public.source_accounts WHERE id=rule.account_id AND user_id=actor FOR UPDATE;
  SELECT * INTO rule FROM private.personal_mail_rules WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule unavailable' USING ERRCODE='PT404'; END IF;
  IF rule.undone_at IS NOT NULL THEN RETURN private.personal_mail_rule_result(rule); END IF;
  DELETE FROM private.personal_mail_categories WHERE rule_id=p_id AND user_id=actor AND NOT manual;
  GET DIAGNOSTICS restored = ROW_COUNT;
  UPDATE private.personal_mail_rules SET undone_at=clock_timestamp(),restored_count=restored,
    kept_count=(SELECT count(*) FROM private.personal_mail_categories WHERE rule_id=p_id AND user_id=actor AND manual)
  WHERE id=p_id AND user_id=actor RETURNING * INTO rule;
  RETURN private.personal_mail_rule_result(rule);
END $$;

CREATE FUNCTION public.list_personal_mail_rules() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(private.personal_mail_rule_result(r) ORDER BY r.created_at DESC,r.id DESC),'[]')
  FROM (
    SELECT * FROM private.personal_mail_rules WHERE user_id=auth.uid() AND undone_at IS NULL
    UNION ALL
    (SELECT * FROM private.personal_mail_rules WHERE user_id=auth.uid() AND undone_at IS NOT NULL
     ORDER BY created_at DESC,id DESC LIMIT 10)
  ) r
$$;

REVOKE ALL ON FUNCTION private.apply_personal_mail_rule(),private.personal_mail_source(uuid,uuid,boolean),
  private.personal_mail_candidates(uuid,uuid,text),private.personal_mail_snapshot(uuid,jsonb,uuid,text,boolean),
  private.personal_mail_rule_result(private.personal_mail_rules) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mail_category(public.emails),public.preview_personal_mail_rule(uuid,text,boolean),
  public.confirm_personal_mail_rule(uuid,text,boolean,text,uuid),public.set_personal_mail_category(uuid[],text),
  public.undo_personal_mail_rule(uuid),public.list_personal_mail_rules() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mail_category(public.emails),public.preview_personal_mail_rule(uuid,text,boolean),
  public.confirm_personal_mail_rule(uuid,text,boolean,text,uuid),public.set_personal_mail_category(uuid[],text),
  public.undo_personal_mail_rule(uuid),public.list_personal_mail_rules() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
