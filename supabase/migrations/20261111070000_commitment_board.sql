BEGIN;

CREATE FUNCTION private.commitment_responsibility(p_email text, p_addresses text[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN NULLIF(btrim(p_email),'') IS NULL THEN 'unassigned'
    WHEN lower(btrim(p_email)) = ANY(p_addresses) THEN 'mine' ELSE 'waiting' END
$$;

CREATE FUNCTION private.commitment_board_group(p_state jsonb, p_responsibility text, p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_state->>'status' <> 'open' THEN 'closed'
    WHEN (p_state->>'dueAt')::timestamptz < p_now
      OR (p_state->>'dueOn')::date < (p_now AT TIME ZONE INTERVAL '+07:00')::date THEN 'overdue'
    ELSE p_responsibility END
$$;

CREATE FUNCTION public.list_commitment_board(p_group text, p_limit integer, p_before_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  addresses text[];
  before_at timestamptz;
  result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR
     COALESCE(p_group,'') NOT IN ('mine','waiting','overdue','unassigned','closed') THEN
    RAISE EXCEPTION 'Invalid commitment board page' USING ERRCODE = '22023';
  END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT created_at INTO before_at FROM private.commitments WHERE user_id = actor AND id = p_before_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commitment page unavailable' USING ERRCODE = 'PT404'; END IF;
  END IF;

  SELECT ARRAY(
    SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = actor AND u.email IS NOT NULL
    UNION
    SELECT lower(btrim(a.email_address)) FROM public.source_accounts a WHERE a.user_id = actor
  ) INTO addresses;

  WITH owned AS (
    SELECT c.id,c.reference_key,c.version,c.created_at,r.recorded_at,r.state,
      private.commitment_responsibility(r.state->>'ownerEmail',addresses) AS responsibility
    FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version) = (c.user_id,c.id,c.version)
    WHERE c.user_id = actor
  ), grouped AS MATERIALIZED (
    SELECT *,private.commitment_board_group(state,responsibility,statement_timestamp()) AS board_group FROM owned
  ), slice AS (
    SELECT * FROM grouped WHERE board_group = p_group
      AND (p_before_id IS NULL OR (created_at,id) < (before_at,p_before_id))
    ORDER BY created_at DESC,id DESC LIMIT p_limit + 1
  ), page AS (
    SELECT * FROM slice ORDER BY created_at DESC,id DESC LIMIT p_limit
  ), totals AS (
    SELECT jsonb_build_object(
      'mine',count(*) FILTER (WHERE board_group = 'mine'),
      'waiting',count(*) FILTER (WHERE board_group = 'waiting'),
      'overdue',count(*) FILTER (WHERE board_group = 'overdue'),
      'unassigned',count(*) FILTER (WHERE board_group = 'unassigned'),
      'closed',count(*) FILTER (WHERE board_group = 'closed')
    ) AS counts FROM grouped
  )
  SELECT jsonb_build_object('totals',(SELECT counts FROM totals),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'referenceKey',reference_key,'version',version,'createdAt',created_at,'updatedAt',recorded_at,
      'state',state,'responsibility',responsibility
    ) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb),
    'nextBeforeId',CASE WHEN (SELECT count(*) FROM slice) > p_limit
      THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) END) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.commitment_responsibility(text,text[]),
  private.commitment_board_group(jsonb,text,timestamptz), public.list_commitment_board(text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_commitment_board(text,integer,uuid) TO authenticated;

COMMIT;
