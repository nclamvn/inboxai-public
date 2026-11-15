BEGIN;

CREATE FUNCTION private.ask_answer_version(e public.emails)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(e.id,e.source_account_id,e.subject,e.body_text,
    e.from_address,private.ask_date(e) AT TIME ZONE 'UTC')::text,'UTF8')),'hex')
$$;

CREATE FUNCTION public.ask_inbox_reference_evidence(p_reference text, p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  reference_pattern text;
  reference_term tsquery;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF COALESCE(p_reference,'') !~ '^[A-Z]{2,12}-[0-9]{1,16}$' THEN
    RAISE EXCEPTION 'Invalid case reference' USING ERRCODE = '22023';
  END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  reference_pattern := '(^|[^[:alnum:]_-])' || p_reference || '($|[^[:alnum:]_-])';
  reference_term := plainto_tsquery('pg_catalog.simple',lower(p_reference));
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT e.id,private.ask_date(e) AS at
      FROM public.emails e WHERE e.user_id = actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        AND private.ask_document(e) @@ reference_term
        AND private.ask_scope(e,actor,p_filters)
        AND (left(e.subject,501) ~* reference_pattern OR left(e.body_text,24001) ~* reference_pattern)
      ORDER BY at DESC,e.id DESC LIMIT 25
    ), batch AS (
      SELECT e, matched.at FROM (SELECT * FROM matched ORDER BY at DESC,id DESC LIMIT 24) matched
      JOIN public.emails e ON e.user_id = actor AND e.id = matched.id
    )
    SELECT jsonb_build_object(
      'capped',(SELECT count(*) FROM matched) > 24,
      'sources',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',(b.e).id,'version',private.ask_answer_version(b.e),
        'subject',left((b.e).subject,500),'body',left((b.e).body_text,24000),
        'subjectClipped',COALESCE(length((b.e).subject) > 500,false),
        'bodyClipped',COALESCE(length((b.e).body_text) > 24000,false),
        'sender',left((b.e).from_address,320),'account',a.email_address,
        'at',CASE WHEN isfinite(b.at) THEN b.at END
      ) ORDER BY b.at DESC,(b.e).id DESC) FROM batch b
        LEFT JOIN public.source_accounts a ON a.user_id = actor AND a.id = (b.e).source_account_id),'[]'::jsonb)
    )
  );
END;
$$;

CREATE FUNCTION public.ask_inbox_source_status(p_email_id uuid, p_version text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  current_version text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_email_id IS NULL OR COALESCE(p_version,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid answer citation' USING ERRCODE = '22023';
  END IF;
  SELECT private.ask_answer_version(e) INTO current_version
  FROM public.emails e WHERE e.user_id = actor AND e.id = p_email_id
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND private.ask_scope(e,actor,'{}');
  RETURN CASE WHEN NOT FOUND THEN 'unavailable' WHEN current_version = p_version THEN 'current' ELSE 'changed' END;
END;
$$;

REVOKE ALL ON FUNCTION private.ask_answer_version(public.emails),
  public.ask_inbox_reference_evidence(text,jsonb),public.ask_inbox_source_status(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ask_inbox_reference_evidence(text,jsonb),public.ask_inbox_source_status(uuid,text) TO authenticated;

COMMIT;
