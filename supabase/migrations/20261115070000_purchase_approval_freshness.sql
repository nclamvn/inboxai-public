BEGIN;

-- Share the supplier-mail filter between the buyer's Inbox and the approval guard.
CREATE FUNCTION private.purchase_supplement_candidates(
  p_owner uuid,p_account uuid,p_sender text,p_reference text,p_after timestamptz)
RETURNS TABLE(truncated boolean,files jsonb) LANGUAGE sql STABLE SET search_path='' AS $$
  WITH newest AS MATERIALIZED (
    SELECT e.id AS email_id,e.received_at,e.subject,f.id AS file_id,f.filename,private.purchase_csv_binding(e,f) AS binding
    FROM public.emails e JOIN public.attachments f ON f.email_id=e.id
    WHERE e.user_id=p_owner AND e.source_account_id=p_account
      AND lower(btrim(e.from_address))=lower(btrim(p_sender))
      AND private.commitment_subject_reference(e.subject)=p_reference
      AND e.direction='inbound' AND e.sync_namespace='gmail' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
      AND e.received_at>p_after AND f.is_inline IS NOT TRUE AND f.sync_part_key IS NOT NULL
      AND f.size BETWEEN 1 AND 8192 AND f.filename ~* '\.csv$' AND f.filename !~ '[[:cntrl:]]' AND length(f.filename)<=255
      AND lower(trim(split_part(COALESCE(f.content_type,''),';',1))) IN
        ('text/csv','application/csv','application/octet-stream','application/vnd.ms-excel','text/plain')
      AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents registered
        WHERE registered.user_id=p_owner AND registered.attachment_id=f.id)
    ORDER BY e.received_at DESC,e.id DESC,f.id LIMIT 7
  )
  SELECT (SELECT count(*)>6 FROM newest) AS truncated,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('emailId',n.email_id,'fileId',n.file_id,
      'filename',n.filename,'subject',n.subject,'binding',n.binding)
      ORDER BY n.received_at DESC,n.email_id DESC,n.file_id)
      FROM (SELECT * FROM newest ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) n),'[]'::jsonb) AS files
$$;

CREATE OR REPLACE FUNCTION public.list_purchase_supplement_sources(p_cases uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(cardinality(p_cases),0) NOT BETWEEN 1 AND 4
    OR (SELECT count(DISTINCT id) FROM unnest(p_cases) id)<>cardinality(p_cases)
  THEN RAISE EXCEPTION 'Chọn từ 1 đến 4 hồ sơ.' USING ERRCODE='22023'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('caseId',x.origin_handoff,'truncated',candidates.truncated,
      'sources',candidates.files) ORDER BY x.origin_handoff),'[]'::jsonb)
    FROM private.purchase_due_exceptions x
    JOIN private.purchase_handoffs h ON h.id=x.origin_handoff AND h.owner_id=actor AND h.commitment_id=x.commitment_id
    JOIN private.purchase_payment_documents d ON d.id=h.invoice_id AND d.user_id=actor AND d.commitment_id=x.commitment_id
    JOIN public.emails original ON original.user_id=actor AND original.id=d.email_id
    JOIN public.source_accounts a ON a.id=original.source_account_id AND a.user_id=actor AND a.is_active AND a.provider='gmail'
    CROSS JOIN LATERAL private.purchase_supplement_candidates(actor,a.id,original.from_address,h.reference,d.source_at) candidates
    WHERE x.owner_id=actor AND x.origin_handoff=ANY(p_cases) AND x.stage<>'closed'
  );
END;
$$;

CREATE INDEX purchase_due_exception_responses
  ON private.purchase_due_exceptions(response_handoff) WHERE response_handoff IS NOT NULL;

-- Only inspect mail in the original buyer mailbox for the assigned supplemental handoff.
-- The same scope remains available after its approval, while the transaction is still open.
CREATE FUNCTION private.purchase_approval_review_scope(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('handoffId',h.id,'caseId',x.origin_handoff,'ownerId',h.owner_id,
    'invoice',current_doc.number,'accountId',a.id,
    'truncated',candidates.truncated OR a.id IS NULL OR original.from_address IS NULL,
    'sources',candidates.files)
  FROM private.purchase_handoffs h
  JOIN private.purchase_due_exceptions x ON x.response_handoff=h.id AND x.owner_id=h.owner_id
    AND x.commitment_id=h.commitment_id AND x.reviewer_id=p_actor AND x.stage IN ('reviewer','closed')
  JOIN private.purchase_handoffs origin ON origin.id=x.origin_handoff AND origin.owner_id=h.owner_id
    AND origin.commitment_id=h.commitment_id
  JOIN private.purchase_payment_documents original_doc
    ON original_doc.id=origin.invoice_id AND original_doc.user_id=h.owner_id AND original_doc.commitment_id=h.commitment_id
  JOIN private.purchase_payment_documents current_doc ON current_doc.id=h.invoice_id AND current_doc.user_id=h.owner_id
    AND current_doc.commitment_id=h.commitment_id AND current_doc.installment_id=x.installment_id
  LEFT JOIN public.emails original ON original.id=original_doc.email_id AND original.user_id=h.owner_id
  LEFT JOIN public.source_accounts a ON a.id=original.source_account_id AND a.user_id=h.owner_id
    AND a.provider='gmail' AND a.is_active
  CROSS JOIN LATERAL private.purchase_supplement_candidates(
    h.owner_id,a.id,original.from_address,h.reference,current_doc.source_at) candidates
  WHERE h.id=p_handoff AND h.reviewer_id=p_actor
$$;

CREATE FUNCTION private.purchase_approval_review_token(p_scope jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT encode(sha256(convert_to(p_scope::text,'UTF8')),'hex')
$$;

CREATE FUNCTION public.read_purchase_approval_scan(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE scope jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.purchase_handoffs WHERE id=p_handoff AND reviewer_id=p_actor)
    THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;
  scope:=private.purchase_approval_review_scope(p_actor,p_handoff);
  RETURN jsonb_build_object('scope',scope,'token',private.purchase_approval_review_token(scope));
END;
$$;

ALTER FUNCTION public.confirm_purchase_handoff(uuid,uuid,jsonb) RENAME TO apply_purchase_due_handoff;
ALTER FUNCTION public.apply_purchase_due_handoff(uuid,uuid,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.apply_purchase_due_handoff(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb,p_review_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  saved jsonb;
  current_scope jsonb;
BEGIN
  saved:=private.apply_purchase_due_handoff(p_actor,p_key,p_command);
  IF p_command->>'action'<>'approve' OR saved->>'replayed'='true' THEN RETURN saved; END IF;

  -- The existing handoff write holds its evidence accounts FOR SHARE until commit.
  -- Gmail sync takes FOR UPDATE on the same account before changing message/part metadata.
  -- Re-read after those locks. A changed shortlist aborts the decision and its receipt together.
  current_scope:=private.purchase_approval_review_scope(p_actor,(saved->>'id')::uuid);
  IF current_scope->>'truncated'='true'
    OR p_review_token IS DISTINCT FROM private.purchase_approval_review_token(current_scope)
  THEN RAISE EXCEPTION 'Nguồn chứng từ vừa thay đổi. Hãy kiểm tra lại hồ sơ trước khi duyệt.' USING ERRCODE='PT433'; END IF;
  RETURN saved;
END;
$$;

-- Earlier route versions can still write other actions and replay prior receipts.
-- A new supplemental approval through the old signature fails without a checked shortlist.
CREATE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.confirm_purchase_handoff(p_actor,p_key,p_command,NULL::text)
$$;

REVOKE ALL ON FUNCTION private.purchase_supplement_candidates(uuid,uuid,text,text,timestamptz),
  private.purchase_approval_review_scope(uuid,uuid),private.purchase_approval_review_token(jsonb),
  public.read_purchase_approval_scan(uuid,uuid),public.confirm_purchase_handoff(uuid,uuid,jsonb,text),
  public.confirm_purchase_handoff(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_approval_scan(uuid,uuid),
  public.confirm_purchase_handoff(uuid,uuid,jsonb,text),public.confirm_purchase_handoff(uuid,uuid,jsonb) TO service_role;

COMMIT;
