BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION private.mail_lookup_fields(e public.emails) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.ask_fold(e.subject) || chr(10) || private.ask_fold(e.from_name) || chr(10) || private.ask_fold(e.from_address)
$$;

-- The extension can already be installed under the Supabase extensions schema.
DO $$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pg_trgm';
  EXECUTE format('CREATE INDEX mail_lookup_fields_trgm ON public.emails USING gin (private.mail_lookup_fields(emails) %I.gin_trgm_ops)
    WHERE NOT provider_deleted AND is_deleted IS NOT TRUE', extension_schema);
  EXECUTE format('CREATE INDEX mail_lookup_attachment_trgm ON public.attachments USING gin (private.ask_fold(filename) %I.gin_trgm_ops)
    WHERE is_inline IS NOT TRUE', extension_schema);
  EXECUTE format('CREATE INDEX mail_lookup_sent_file_trgm ON private.mail_files USING gin (private.ask_fold(filename) %I.gin_trgm_ops)', extension_schema);
END $$;

CREATE FUNCTION private.mail_lookup_files(p_email uuid,p_actor uuid)
RETURNS TABLE(id uuid,filename text,size bigint)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT s.id,f.filename,f.size::bigint
  FROM private.sent_mail_files s JOIN private.mail_files f ON f.id=s.file_id AND f.user_id=p_actor
  WHERE s.email_id=p_email
  UNION ALL
  SELECT a.id,a.filename,a.size::bigint FROM public.attachments a
  WHERE a.email_id=p_email AND a.is_inline IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM private.sent_mail_files s WHERE s.email_id=p_email)
$$;

CREATE FUNCTION public.search_synced_mail(
  p_query text,p_accounts uuid[],p_category text,p_has_file boolean,
  p_before_rank integer,p_before_at timestamptz,p_before_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := auth.uid();
  needle text := private.ask_fold(btrim(p_query));
  pattern text;
  words tsquery;
  page_size constant integer := 20;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_query IS NULL OR length(p_query)>200 OR p_accounts IS NULL OR cardinality(p_accounts)>20
    OR p_has_file IS NULL OR (p_category IS NOT NULL AND p_category NOT IN
      ('work','personal','transaction','promotion','newsletter','social','spam','uncategorized'))
    OR num_nonnulls(p_before_rank,p_before_at,p_before_id) NOT IN (0,3)
    OR p_before_rank NOT BETWEEN 0 AND 2 THEN
    RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_accounts) AS ids(id) WHERE NOT EXISTS
    (SELECT 1 FROM public.source_accounts a WHERE a.id=ids.id AND a.user_id=actor)) THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE='PT404';
  END IF;
  IF needle='' AND cardinality(p_accounts)=0 AND p_category IS NULL AND NOT p_has_file THEN
    RETURN jsonb_build_object('hits','[]'::jsonb,'next',NULL);
  END IF;
  IF needle<>'' THEN
    pattern := '%' || replace(replace(replace(needle,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') || '%';
    words := plainto_tsquery('pg_catalog.simple',needle);
  END IF;

  WITH scoped AS NOT MATERIALIZED (
    SELECT e.* FROM public.emails e
    WHERE e.user_id=actor AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
      AND (p_category IS NULL OR COALESCE(public.mail_category(e),'uncategorized')=p_category)
      AND (NOT p_has_file OR EXISTS (SELECT 1 FROM private.mail_lookup_files(e.id,actor)))
  ), matches AS (
    SELECT e.id,private.ask_date(e) AS at,1 AS rank FROM scoped e
    WHERE pattern IS NULL OR private.mail_lookup_fields(e) LIKE pattern
    UNION ALL
    SELECT e.id,private.ask_date(e),0 FROM scoped e
    WHERE numnode(words)>0 AND private.ask_document(e) @@ words
    UNION ALL
    SELECT e.id,private.ask_date(e),2 FROM scoped e JOIN public.attachments a ON a.email_id=e.id
    WHERE a.is_inline IS NOT TRUE AND private.ask_fold(a.filename) LIKE pattern
      AND NOT EXISTS (SELECT 1 FROM private.sent_mail_files s WHERE s.email_id=e.id)
    UNION ALL
    SELECT e.id,private.ask_date(e),2 FROM scoped e
      JOIN private.sent_mail_files s ON s.email_id=e.id
      JOIN private.mail_files f ON f.id=s.file_id AND f.user_id=actor
    WHERE private.ask_fold(f.filename) LIKE pattern
  ), best AS (
    SELECT id,at,max(rank) AS rank FROM matches GROUP BY id,at
  ), windowed AS MATERIALIZED (
    SELECT * FROM best WHERE p_before_id IS NULL OR (rank,at,id)<(p_before_rank,p_before_at,p_before_id)
    ORDER BY rank DESC,at DESC,id DESC LIMIT page_size+1
  ), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY rank DESC,at DESC,id DESC LIMIT page_size
  ), hits AS (
    SELECT p.rank,p.at,p.id,jsonb_build_object(
      'id',e.id,'subject',e.subject,'sender',e.from_address,'senderName',e.from_name,
      'account',a.email_address,'at',p.at,'category',public.mail_category(e),'direction',e.direction,
      'preview',public.inbox_preview(e),'files',COALESCE(files.items,'[]'::jsonb),'moreFiles',COALESCE(files.more,false)
    ) AS item
    FROM page p JOIN public.emails e ON e.id=p.id AND e.user_id=actor
    LEFT JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=actor
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.filename,'size',f.size) ORDER BY f.place)
        FILTER (WHERE f.place<=6) AS items, count(*)>6 AS more
      FROM (
        SELECT x.*,row_number() OVER (ORDER BY
          COALESCE(private.ask_fold(x.filename) LIKE pattern,false) DESC,x.filename,x.id) AS place
        FROM private.mail_lookup_files(e.id,actor) x
        ORDER BY place LIMIT 7
      ) f
    ) files ON true
  )
  SELECT jsonb_build_object(
    'hits',COALESCE((SELECT jsonb_agg(item ORDER BY rank DESC,at DESC,id DESC) FROM hits),'[]'::jsonb),
    'next',CASE WHEN (SELECT count(*) FROM windowed)>page_size THEN
      (SELECT jsonb_build_object('rank',rank,'at',at,'id',id) FROM page ORDER BY rank,at,id LIMIT 1) END
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.mail_lookup_fields(public.emails),private.mail_lookup_files(uuid,uuid),
  public.search_synced_mail(text,uuid[],text,boolean,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- PostgreSQL maintains expression indexes under the role writing the row.
GRANT EXECUTE ON FUNCTION private.mail_lookup_fields(public.emails),private.ask_fold(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_synced_mail(text,uuid[],text,boolean,integer,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
