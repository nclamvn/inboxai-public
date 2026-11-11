BEGIN;

CREATE FUNCTION private.ask_fold(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT translate(lower(normalize(COALESCE(value,''), NFC)),
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$$;

CREATE FUNCTION private.ask_text(e public.emails)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(e.body_text,''), e.snippet, '')
$$;

CREATE FUNCTION private.ask_document(e public.emails)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY DEFINER SET search_path = '' AS $$
  SELECT setweight(to_tsvector('pg_catalog.simple',private.ask_fold(left(e.subject,500))), 'A') ||
    setweight(to_tsvector('pg_catalog.simple',private.ask_fold(left(e.from_address,320) || ' ' || COALESCE(left(e.from_name,240),''))), 'B') ||
    setweight(to_tsvector('pg_catalog.simple',private.ask_fold(left(private.ask_text(e),24000))), 'C')
$$;

CREATE FUNCTION private.ask_date(e public.emails)
RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT COALESCE(e.received_at,e.sent_at,e.created_at,'-infinity'::timestamptz)
$$;

CREATE INDEX emails_ask_document ON public.emails USING gin (private.ask_document(emails))
  WHERE NOT provider_deleted AND is_deleted IS NOT TRUE;
CREATE INDEX emails_ask_date ON public.emails (user_id, private.ask_date(emails) DESC, id DESC)
  WHERE NOT provider_deleted AND is_deleted IS NOT TRUE;

CREATE TABLE private.ask_inbox_vectors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  part smallint NOT NULL CHECK (part BETWEEN 0 AND 3),
  embedding real[] NOT NULL CHECK (array_ndims(embedding) = 1 AND cardinality(embedding) = 384),
  PRIMARY KEY (user_id,email_id,part)
);
CREATE INDEX ask_inbox_vectors_email ON private.ask_inbox_vectors(email_id);
ALTER TABLE private.ask_inbox_vectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ask_inbox_vectors FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.ask_fingerprint(e public.emails)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(left(e.subject,280), left(private.ask_text(e),2320))::text,'UTF8')), 'hex')
$$;

CREATE FUNCTION private.ask_parts(body text, max_parts integer)
RETURNS TABLE(part integer, excerpt text) LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT i, substr(body, i * 560 + 1, 640) FROM generate_series(0, max_parts - 1) AS i
  WHERE i = 0 OR length(body) > i * 560 + 80
$$;

CREATE FUNCTION private.ask_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_deleted IS TRUE OR NEW.provider_deleted OR NEW.user_id <> OLD.user_id
    OR private.ask_fingerprint(NEW) <> private.ask_fingerprint(OLD) THEN
    DELETE FROM private.ask_inbox_vectors WHERE user_id = OLD.user_id AND email_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ask_invalidate AFTER UPDATE OF user_id, subject, body_text, snippet, is_deleted, provider_deleted ON public.emails
  FOR EACH ROW WHEN (
    OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.subject IS DISTINCT FROM NEW.subject OR
    OLD.body_text IS DISTINCT FROM NEW.body_text OR OLD.snippet IS DISTINCT FROM NEW.snippet OR
    OLD.is_deleted IS DISTINCT FROM NEW.is_deleted OR OLD.provider_deleted IS DISTINCT FROM NEW.provider_deleted
  ) EXECUTE FUNCTION private.ask_invalidate();

CREATE FUNCTION private.ask_scope(e public.emails, actor uuid, filters jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT
    (e.source_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.source_accounts a WHERE a.id = e.source_account_id AND a.user_id = actor
    )) AND
    (NOT (filters ? 'accounts') OR filters->'accounts' = '[]'::jsonb OR
      (filters->'accounts' ? e.source_account_id::text)) AND
    (NOT (filters ? 'sender') OR strpos(private.ask_fold(e.from_address || ' ' || COALESCE(e.from_name,'')),private.ask_fold(filters->>'sender')) > 0) AND
    (NOT (filters ? 'recipient') OR strpos(private.ask_fold(COALESCE(e.to_addresses::text,'')),private.ask_fold(filters->>'recipient')) > 0) AND
    (NOT (filters ? 'subject') OR strpos(private.ask_fold(e.subject),private.ask_fold(filters->>'subject')) > 0) AND
    (NOT (filters ? 'fromAt') OR private.ask_date(e) >= (filters->>'fromAt')::timestamptz) AND
    (NOT (filters ? 'beforeAt') OR private.ask_date(e) < (filters->>'beforeAt')::timestamptz) AND
    (NOT (filters ? 'category') OR e.category = filters->>'category') AND
    (NOT (filters ? 'unread') OR (e.is_read IS NOT TRUE) = (filters->>'unread')::boolean) AND
    (NOT (filters ? 'starred') OR e.is_starred IS TRUE) AND
    (NOT (filters ? 'attachment') OR e.attachment_count > 0 OR EXISTS (
      SELECT 1 FROM public.attachments a WHERE a.email_id = e.id
    )) AND
    CASE filters->>'priority' WHEN 'high' THEN e.priority >= 4 WHEN 'normal' THEN e.priority BETWEEN 2 AND 3
      WHEN 'low' THEN e.priority <= 2 ELSE true END
$$;

CREATE FUNCTION private.ask_validate_scope(actor uuid, filters jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR octet_length(filters::text) > 4096 OR
    filters - ARRAY['accounts','sender','recipient','subject','fromAt','beforeAt','category','unread','starred','attachment','priority'] <> '{}'::jsonb
    THEN RAISE EXCEPTION 'Invalid search scope' USING ERRCODE = '22023'; END IF;
  IF filters ? 'accounts' THEN
    IF jsonb_typeof(filters->'accounts') <> 'array' OR jsonb_array_length(filters->'accounts') > 20
      THEN RAISE EXCEPTION 'Invalid search accounts' USING ERRCODE = '22023'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(filters->'accounts') item(value)
      WHERE item.value IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.source_accounts a WHERE a.user_id = actor AND a.id = item.value::uuid
      )
    ) THEN RAISE EXCEPTION 'Search account unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;
END;
$$;

-- Cap exact semantic scoring after tenant and metadata scope, without an
-- approximate global index that can discard another tenant's filtered neighbors.
CREATE FUNCTION private.ask_window(actor uuid, filters jsonb)
RETURNS TABLE(id uuid, at timestamptz) LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT e.id, private.ask_date(e) FROM public.emails e
  WHERE e.user_id = actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
    AND private.ask_scope(e,actor,filters)
    AND (btrim(COALESCE(left(e.subject,280),'')) <> '' OR btrim(left(private.ask_text(e),2320)) <> '')
  ORDER BY private.ask_date(e) DESC,e.id DESC LIMIT 601
$$;

CREATE FUNCTION public.ask_inbox_pending(p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',e.id,'fingerprint',private.ask_fingerprint(e),
      'subject',left(COALESCE(e.subject,''),280),'passages',
      (SELECT jsonb_agg(excerpt ORDER BY part) FROM private.ask_parts(left(private.ask_text(e),2320),4)))
      ORDER BY pending.at DESC,pending.id DESC)
    FROM (
      SELECT w.id,w.at FROM (SELECT * FROM private.ask_window(actor,p_filters) ORDER BY at DESC,id DESC LIMIT 600) w
      WHERE NOT EXISTS (
        SELECT 1 FROM private.ask_inbox_vectors v WHERE v.user_id = actor AND v.email_id = w.id AND v.part = 0
      )
      ORDER BY w.at DESC,w.id DESC LIMIT 16
    ) pending JOIN public.emails e ON e.id = pending.id AND e.user_id = actor
  ),'[]'::jsonb);
END;
$$;

CREATE FUNCTION private.ask_vector_valid(v real[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT array_ndims(v) = 1 AND cardinality(v) = 384
    AND (SELECT count(x) = 384 AND bool_and(x BETWEEN -1 AND 1)
      AND sum(x::double precision * x) BETWEEN 0.98 AND 1.02 FROM unnest(v) x)
$$;

CREATE FUNCTION public.ask_inbox_store(p_user_id uuid, p_documents jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  doc jsonb;
  part jsonb;
  slot bigint;
  vector real[];
  source public.emails;
  written integer := 0;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_documents) > 16 OR octet_length(p_documents::text) > 2000000
    THEN RAISE EXCEPTION 'Invalid search documents' USING ERRCODE = '22023'; END IF;
  FOR doc IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    SELECT * INTO source FROM public.emails WHERE id = (doc->>'id')::uuid AND user_id = p_user_id
      AND NOT provider_deleted AND is_deleted IS NOT TRUE FOR SHARE;
    IF NOT FOUND OR private.ask_fingerprint(source) IS DISTINCT FROM doc->>'fingerprint' THEN CONTINUE; END IF;
    IF jsonb_typeof(doc->'vectors') IS DISTINCT FROM 'array' OR
      jsonb_array_length(doc->'vectors') <> (SELECT count(*) FROM private.ask_parts(left(private.ask_text(source),2320),4))
      THEN RAISE EXCEPTION 'Invalid search document passages' USING ERRCODE = '22023'; END IF;
    FOR part, slot IN SELECT value,ordinality FROM jsonb_array_elements(doc->'vectors') WITH ORDINALITY LOOP
      SELECT ARRAY(SELECT value::real FROM jsonb_array_elements_text(part)) INTO vector;
      IF private.ask_vector_valid(vector) IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid search document vector' USING ERRCODE = '22023';
      END IF;
      INSERT INTO private.ask_inbox_vectors(user_id,email_id,part,embedding)
        VALUES(p_user_id,source.id,slot - 1,vector) ON CONFLICT DO NOTHING;
    END LOOP;
    written := written + 1;
  END LOOP;
  RETURN written;
END;
$$;

CREATE FUNCTION private.ask_citation(e public.emails, lexical tsquery, semantic_part integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  body text := left(private.ask_text(e),24000);
  excerpt text;
  field text := CASE WHEN NULLIF(e.body_text,'') IS NOT NULL THEN 'body_text' ELSE 'snippet' END;
BEGIN
  IF lexical IS NOT NULL THEN
    SELECT p.excerpt INTO excerpt FROM private.ask_parts(body,43) p
    WHERE to_tsvector('pg_catalog.simple',private.ask_fold(p.excerpt)) @@ lexical
    ORDER BY ts_rank_cd(to_tsvector('pg_catalog.simple',private.ask_fold(p.excerpt)),lexical) DESC,p.part LIMIT 1;
    IF excerpt IS NULL AND to_tsvector('pg_catalog.simple',private.ask_fold(e.subject)) @@ lexical THEN
      RETURN jsonb_build_object('field','subject','quote',left(e.subject,500));
    END IF;
    IF excerpt IS NULL AND to_tsvector('pg_catalog.simple',private.ask_fold(e.from_address)) @@ lexical THEN
      RETURN jsonb_build_object('field','from_address','quote',left(e.from_address,320));
    END IF;
    IF excerpt IS NULL AND to_tsvector('pg_catalog.simple',private.ask_fold(e.from_name)) @@ lexical THEN
      RETURN jsonb_build_object('field','from_name','quote',left(e.from_name,240));
    END IF;
  END IF;
  IF excerpt IS NULL THEN excerpt := substr(body, COALESCE(semantic_part,0) * 560 + 1, 640); END IF;
  IF NULLIF(btrim(excerpt),'') IS NULL THEN field := 'subject'; excerpt := left(e.subject,500); END IF;
  RETURN jsonb_build_object('field',field,'quote',NULLIF(excerpt,''));
END;
$$;

CREATE FUNCTION public.ask_inbox_search(p_text text, p_filters jsonb, p_vector real[], p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  lexical tsquery;
  phrase tsquery;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_text IS NULL OR length(p_text) > 300 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR (p_vector IS NOT NULL AND private.ask_vector_valid(p_vector) IS NOT TRUE)
    THEN RAISE EXCEPTION 'Invalid search query' USING ERRCODE = '22023'; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  -- Lexemes come from PostgreSQL's parser and are quoted before forming the OR query.
  SELECT string_agg(quote_literal(word),' | ')::tsquery INTO lexical
    FROM unnest(tsvector_to_array(to_tsvector('pg_catalog.simple',private.ask_fold(p_text)))) AS word;
  IF lexical IS NOT NULL THEN phrase := phraseto_tsquery('pg_catalog.simple',private.ask_fold(p_text)); END IF;

  RETURN (
    WITH scoped_window AS MATERIALIZED (
      SELECT * FROM private.ask_window(actor,p_filters) WHERE p_vector IS NOT NULL
    ), nearest_window AS MATERIALIZED (
      SELECT * FROM scoped_window ORDER BY at DESC,id DESC LIMIT 600
    ), keyword_candidates AS MATERIALIZED (
      SELECT e.id, private.ask_date(e) AS at, private.ask_document(e) @@ phrase AS phrase_match,
        ts_rank_cd(private.ask_document(e),lexical, 32) +
          CASE WHEN private.ask_document(e) @@ phrase THEN 1 ELSE 0 END AS score
      FROM public.emails e WHERE lexical IS NOT NULL AND e.user_id = actor
        AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        AND private.ask_document(e) @@ lexical AND private.ask_scope(e,actor,p_filters)
      ORDER BY score DESC,at DESC,e.id DESC LIMIT 80
    ), keyword AS (
      SELECT id,phrase_match,row_number() OVER (ORDER BY score DESC,at DESC,id DESC) AS rank FROM keyword_candidates
    ), semantic_scores AS (
      SELECT w.id,w.at,v.part,
        (SELECT sum(q::double precision * d) FROM unnest(p_vector,v.embedding) x(q,d)) AS similarity
      FROM nearest_window w JOIN private.ask_inbox_vectors v ON v.user_id = actor AND v.email_id = w.id
    ), best_passage AS (
      SELECT DISTINCT ON (id) id,at,part,similarity FROM semantic_scores
      WHERE similarity >= 0.82 ORDER BY id,similarity DESC,part
    ), semantic AS (
      SELECT id,part,row_number() OVER (ORDER BY similarity DESC,at DESC,id DESC) AS rank
      FROM best_passage ORDER BY similarity DESC,at DESC,id DESC LIMIT 80
    ), hits AS (
      SELECT COALESCE(k.id,s.id) AS id,k.rank AS keyword_rank,s.rank AS semantic_rank,s.part,
        COALESCE(1.0 / (20 + k.rank),0) + COALESCE(1.0 / (20 + s.rank),0) +
          CASE WHEN k.phrase_match THEN 0.06 ELSE 0 END AS score
      FROM keyword k FULL JOIN semantic s ON k.id = s.id
      UNION ALL
      SELECT e.id,NULL,NULL,NULL,0 FROM (
        SELECT e.id FROM public.emails e WHERE p_text = '' AND p_filters <> '{}'::jsonb
          AND e.user_id = actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
          AND private.ask_scope(e,actor,p_filters)
        ORDER BY private.ask_date(e) DESC,e.id DESC LIMIT p_limit
      ) e
    ), ordered AS (
      SELECT h.*, private.ask_date(e) AS at, e AS email
      FROM hits h JOIN public.emails e ON e.id = h.id AND e.user_id = actor
      ORDER BY h.score DESC,private.ask_date(e) DESC,e.id DESC LIMIT p_limit
    )
    SELECT jsonb_build_object(
      'hits',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',o.id,'subject',left((o.email).subject,500),'sender',left((o.email).from_address,320),
        'senderName',left((o.email).from_name,240),'accountId',(o.email).source_account_id,
        'account',a.email_address,'at',CASE WHEN isfinite(o.at) THEN o.at END,
        'keyword',o.keyword_rank IS NOT NULL,'semantic',o.semantic_rank IS NOT NULL,
        'citation',private.ask_citation(o.email,CASE WHEN o.keyword_rank IS NOT NULL THEN lexical END,o.part)
      ) ORDER BY o.score DESC,o.at DESC,o.id DESC)
        FROM ordered o LEFT JOIN public.source_accounts a ON a.id = (o.email).source_account_id AND a.user_id = actor),'[]'::jsonb),
      'coverage',CASE WHEN p_vector IS NOT NULL THEN jsonb_build_object(
        'eligible',(SELECT count(*) FROM nearest_window),
        'indexed',(SELECT count(*) FROM nearest_window w WHERE EXISTS (
          SELECT 1 FROM private.ask_inbox_vectors v WHERE v.user_id = actor AND v.email_id = w.id AND v.part = 0
        )),
        'capped',(SELECT count(*) FROM scoped_window) > 600
      ) END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ask_fold(text),private.ask_text(public.emails),private.ask_document(public.emails),
  private.ask_date(public.emails),private.ask_fingerprint(public.emails),private.ask_parts(text,integer),
  private.ask_invalidate(),private.ask_scope(public.emails,uuid,jsonb),private.ask_validate_scope(uuid,jsonb),
  private.ask_window(uuid,jsonb),private.ask_vector_valid(real[]),private.ask_citation(public.emails,tsquery,integer),
  public.ask_inbox_pending(jsonb),public.ask_inbox_store(uuid,jsonb),public.ask_inbox_search(text,jsonb,real[],integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ask_inbox_pending(jsonb),public.ask_inbox_search(text,jsonb,real[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ask_inbox_store(uuid,jsonb) TO service_role;
-- PostgreSQL maintains expression indexes under the writer's role.
GRANT EXECUTE ON FUNCTION private.ask_document(public.emails),private.ask_date(public.emails) TO authenticated,service_role;

-- The existing search header and saved-search API already use this contract.
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recent_searches text[] NOT NULL DEFAULT '{}',
  saved_searches text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY ask_inbox_own_search_preferences ON public.user_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.user_preferences FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.user_preferences TO authenticated;

CREATE FUNCTION public.update_search_history(p_query text, p_action text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 1 AND 300
    OR COALESCE(p_action,'') NOT IN ('recent','save','remove') THEN
    RAISE EXCEPTION 'Invalid search history change' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'remove' THEN
    UPDATE public.user_preferences SET saved_searches = array_remove(saved_searches,p_query),updated_at = now()
      WHERE user_id = actor;
  ELSIF p_action = 'save' THEN
    INSERT INTO public.user_preferences(user_id,saved_searches) VALUES(actor,ARRAY[p_query])
      ON CONFLICT (user_id) DO UPDATE SET
      saved_searches = (ARRAY[p_query] || array_remove(public.user_preferences.saved_searches,p_query))[1:20],
      updated_at = now();
  ELSE
    INSERT INTO public.user_preferences(user_id,recent_searches) VALUES(actor,ARRAY[p_query])
      ON CONFLICT (user_id) DO UPDATE SET
      recent_searches = (ARRAY[p_query] || array_remove(public.user_preferences.recent_searches,p_query))[1:10],
      updated_at = now();
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.update_search_history(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_search_history(text,text) TO authenticated;

COMMIT;
