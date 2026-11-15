BEGIN;

CREATE INDEX emails_recipient_history_recent ON public.emails
  (user_id,source_account_id,(COALESCE(sent_at,received_at,created_at)) DESC,id DESC)
  WHERE direction='outbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE
    AND (send_status IS NULL OR send_status='sent');

CREATE FUNCTION public.read_compose_recipient_history(p_account uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); sender text;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT a.email_address INTO sender FROM public.source_accounts a
    WHERE a.user_id=actor AND a.id=p_account AND a.is_active;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;

  RETURN jsonb_build_object('account',sender,'messages',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('to',r.to_addresses,'cc',r.cc_addresses) ORDER BY r.at DESC,r.id DESC)
    FROM (
      SELECT e.id,COALESCE(e.sent_at,e.received_at,e.created_at) AS at,
        CASE WHEN octet_length(e.to_addresses::text)<=16000 THEN e.to_addresses END AS to_addresses,
        CASE WHEN octet_length(e.cc_addresses::text)<=16000 THEN e.cc_addresses END AS cc_addresses
      FROM public.emails e WHERE e.user_id=actor AND e.source_account_id=p_account
        AND e.direction='outbound' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        AND (e.send_status IS NULL OR e.send_status='sent')
        AND lower(btrim(e.from_address))=lower(btrim(sender))
      ORDER BY COALESCE(e.sent_at,e.received_at,e.created_at) DESC,e.id DESC LIMIT 160
    ) r
  ),'[]'::jsonb));
END $$;

CREATE FUNCTION public.read_compose_recipient_names(p_account uuid,p_addresses text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF cardinality(p_addresses)>160 THEN RAISE SQLSTATE '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.source_accounts a
    WHERE a.user_id=actor AND a.id=p_account AND a.is_active) THEN RAISE SQLSTATE 'PT404'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(address.value,sender.name)
    FROM (SELECT DISTINCT value FROM unnest(p_addresses) AS item(value)
      WHERE length(value) BETWEEN 3 AND 254) address
    CROSS JOIN LATERAL (
      SELECT left(e.from_name,160) AS name
      FROM public.emails e
      WHERE e.user_id=actor AND e.source_account_id=p_account AND lower(btrim(e.from_address))=address.value
        AND e.direction='inbound' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        AND btrim(e.from_name)<>''
      ORDER BY e.received_at DESC NULLS LAST,e.id DESC LIMIT 1
    ) sender
  ),'{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.read_compose_recipient_history(uuid),public.read_compose_recipient_names(uuid,text[])
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_compose_recipient_history(uuid),public.read_compose_recipient_names(uuid,text[])
  TO authenticated;

COMMIT;
