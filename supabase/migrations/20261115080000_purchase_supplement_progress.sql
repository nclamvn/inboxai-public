BEGIN;

CREATE TABLE private.purchase_supplement_checks (
  case_id uuid NOT NULL REFERENCES private.purchase_due_exceptions(origin_handoff) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES private.purchase_payment_documents(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL,
  binding text NOT NULL CHECK (binding ~ '^[a-f0-9]{64}$'),
  outcome jsonb NOT NULL,
  PRIMARY KEY (case_id,invoice_id,attachment_id)
);
ALTER TABLE private.purchase_supplement_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_supplement_checks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.purchase_supplement_source_rows(
  p_owner uuid,p_account uuid,p_sender text,p_reference text,p_after timestamptz)
RETURNS TABLE(email_id uuid,file_id uuid,received_at timestamptz,filename text,subject text,binding text)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT e.id,f.id,e.received_at,f.filename,e.subject,private.purchase_csv_binding(e,f)
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
$$;

CREATE OR REPLACE FUNCTION private.purchase_supplement_candidates(
  p_owner uuid,p_account uuid,p_sender text,p_reference text,p_after timestamptz)
RETURNS TABLE(truncated boolean,files jsonb) LANGUAGE sql STABLE SET search_path='' AS $$
  WITH newest AS MATERIALIZED (
    SELECT * FROM private.purchase_supplement_source_rows(p_owner,p_account,p_sender,p_reference,p_after)
    ORDER BY received_at DESC,email_id DESC,file_id LIMIT 7
  )
  SELECT (SELECT count(*)>6 FROM newest),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('emailId',n.email_id,'fileId',n.file_id,
      'filename',n.filename,'subject',n.subject,'binding',n.binding) ORDER BY n.received_at DESC,n.email_id DESC,n.file_id)
      FROM (SELECT * FROM newest ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) n),'[]'::jsonb)
$$;

-- Both buyers and reviewers use the original mailbox and the exact current invoice.
CREATE FUNCTION private.purchase_supplement_context(p_case uuid,p_invoice uuid)
RETURNS TABLE(owner_id uuid,account_id uuid,sender text,reference text,source_at timestamptz,invoice text)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT x.owner_id,a.id,original.from_address,h.reference,current_doc.source_at,current_doc.number
  FROM private.purchase_due_exceptions x
  JOIN private.purchase_handoffs h ON h.id=x.origin_handoff AND h.owner_id=x.owner_id AND h.commitment_id=x.commitment_id
  JOIN private.purchase_payment_documents d ON d.id=h.invoice_id AND d.user_id=x.owner_id AND d.commitment_id=x.commitment_id
  JOIN private.purchase_payment_documents current_doc ON current_doc.id=p_invoice AND current_doc.user_id=x.owner_id
    AND current_doc.commitment_id=x.commitment_id AND current_doc.installment_id=x.installment_id
  LEFT JOIN public.emails original ON original.id=d.email_id AND original.user_id=x.owner_id
  LEFT JOIN public.source_accounts a ON a.id=original.source_account_id AND a.user_id=x.owner_id AND a.provider='gmail' AND a.is_active
  WHERE x.origin_handoff=p_case
$$;

CREATE FUNCTION private.purchase_supplement_owned_invoice(p_actor uuid,p_case uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT d.id FROM private.purchase_due_exceptions x
  JOIN private.purchase_payment_documents d ON d.user_id=x.owner_id AND d.commitment_id=x.commitment_id AND d.installment_id=x.installment_id
  WHERE x.origin_handoff=p_case AND x.owner_id=p_actor AND x.stage<>'closed'
  ORDER BY d.source_at DESC,d.id DESC LIMIT 1
$$;

CREATE FUNCTION private.purchase_supplement_review_state(p_case uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('caseId',p_case,'invoiceId',p_invoice,'invoice',c.invoice,'ownerId',c.owner_id,
    'accountId',c.account_id,'unavailable',c.account_id IS NULL OR c.sender IS NULL,
    'total',review.total,'checked',review.checked,'manifest',review.manifest,
    'sources',review.pending,'hasReplacement',review.has_replacement,'matches',review.matches,'checks',review.checks)
  FROM private.purchase_supplement_context(p_case,p_invoice) c
  CROSS JOIN LATERAL (
    WITH candidates AS MATERIALIZED (
      SELECT s.*,saved.outcome,
        jsonb_build_object('emailId',s.email_id,'fileId',s.file_id,'filename',s.filename,'subject',s.subject) AS source
      FROM private.purchase_supplement_source_rows(c.owner_id,c.account_id,c.sender,c.reference,c.source_at) s
      LEFT JOIN private.purchase_supplement_checks saved ON saved.case_id=p_case AND saved.invoice_id=p_invoice
        AND saved.attachment_id=s.file_id AND saved.binding=s.binding
    ), distinct_reviews AS (
      SELECT DISTINCT ON (outcome->>'digest') * FROM candidates
      WHERE outcome->>'status' NOT IN ('ignore','duplicate')
      ORDER BY outcome->>'digest',received_at DESC,email_id DESC,file_id
    )
    SELECT count(*) AS total,count(outcome) AS checked,
      encode(sha256(convert_to(COALESCE(jsonb_agg(jsonb_build_array(file_id,binding,outcome)
        ORDER BY file_id),'[]'::jsonb)::text,'UTF8')),'hex') AS manifest,
      COALESCE(bool_or(outcome->>'status'='match' AND outcome->>'replaces'=c.invoice),false) AS has_replacement,
      COALESCE((SELECT jsonb_agg(p.source || jsonb_build_object('binding',p.binding)
        ORDER BY p.received_at DESC,p.email_id DESC,p.file_id)
        FROM (SELECT * FROM candidates WHERE outcome IS NULL ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) p),'[]'::jsonb) AS pending,
      COALESCE((SELECT jsonb_agg(r.source || (r.outcome-'status') ORDER BY r.received_at DESC,r.email_id DESC,r.file_id)
        FROM (SELECT * FROM distinct_reviews WHERE outcome->>'status'='match'
          ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) r),'[]'::jsonb) AS matches,
      COALESCE((SELECT jsonb_agg(r.source || jsonb_build_object('code',r.outcome->>'status')
        ORDER BY r.received_at DESC,r.email_id DESC,r.file_id)
        FROM (SELECT * FROM distinct_reviews WHERE outcome->>'status'<>'match'
          ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) r),'[]'::jsonb) AS checks
    FROM candidates
  ) review
$$;

CREATE FUNCTION public.read_purchase_supplement_progress(p_actor uuid,p_cases uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR COALESCE(cardinality(p_cases),0) NOT BETWEEN 1 AND 4
    OR (SELECT count(DISTINCT id) FROM unnest(p_cases) id)<>cardinality(p_cases)
  THEN RAISE EXCEPTION 'Invalid purchase review request' USING ERRCODE='22023'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(state ORDER BY id),'[]'::jsonb)
    FROM unnest(p_cases) id
    CROSS JOIN LATERAL private.purchase_supplement_review_state(id,private.purchase_supplement_owned_invoice(p_actor,id)) state
    WHERE state IS NOT NULL
  );
END;
$$;

CREATE FUNCTION public.save_purchase_supplement_progress(
  p_actor uuid,p_case uuid,p_invoice uuid,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE c record;
BEGIN
  IF jsonb_typeof(p_results) IS DISTINCT FROM 'array' OR jsonb_array_length(p_results) NOT BETWEEN 1 AND 6
    OR octet_length(p_results::text)>8192 THEN
    RAISE EXCEPTION 'Invalid purchase review results' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM private.purchase_supplement_context(p_case,p_invoice) WHERE owner_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase review unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || c.reference,0));
  IF private.purchase_supplement_owned_invoice(p_actor,p_case) IS DISTINCT FROM p_invoice THEN
    RAISE EXCEPTION 'Phiên bản hồ sơ đã đổi. Hãy tải lại để tiếp tục.' USING ERRCODE='PT432';
  END IF;
  -- Re-read the source context after taking the same lock as the ledger writes.
  SELECT * INTO STRICT c FROM private.purchase_supplement_context(p_case,p_invoice);
  INSERT INTO private.purchase_supplement_checks(case_id,invoice_id,attachment_id,binding,outcome)
  SELECT p_case,p_invoice,s.file_id,s.binding,r->'outcome'
  FROM jsonb_array_elements(p_results) r
  JOIN private.purchase_supplement_source_rows(p_actor,c.account_id,c.sender,c.reference,c.source_at) s
    ON s.file_id=(r->>'fileId')::uuid AND s.binding=r->>'binding'
  WHERE r#>>'{outcome,status}' IN ('match','ignore','duplicate','old','wrong_po','invalid','unlinked','missing_due','number_conflict')
    AND r#>>'{outcome,digest}' ~ '^[a-f0-9]{64}$'
  ON CONFLICT (case_id,invoice_id,attachment_id) DO UPDATE
    SET binding=EXCLUDED.binding,outcome=EXCLUDED.outcome;
  RETURN private.purchase_supplement_review_state(p_case,p_invoice);
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_approval_review_scope(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT state-ARRAY['total','checked','unavailable','matches','checks'] ||
    jsonb_build_object('handoffId',h.id,
      'truncated',(state->>'unavailable')::boolean OR (state->>'total')::int-(state->>'checked')::int>6)
  FROM private.purchase_handoffs h
  JOIN private.purchase_due_exceptions x ON x.response_handoff=h.id AND x.owner_id=h.owner_id AND x.commitment_id=h.commitment_id
    AND x.reviewer_id=p_actor AND x.stage IN ('reviewer','closed')
  CROSS JOIN LATERAL private.purchase_supplement_review_state(x.origin_handoff,h.invoice_id) state
  WHERE h.id=p_handoff AND h.reviewer_id=p_actor
$$;

CREATE OR REPLACE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb,p_review_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE saved jsonb; current_scope jsonb;
BEGIN
  saved:=private.apply_purchase_due_handoff(p_actor,p_key,p_command);
  IF p_command->>'action'<>'approve' OR saved->>'replayed'='true' THEN RETURN saved; END IF;

  -- The handoff write holds the source account lock used by Gmail sync.
  current_scope:=private.purchase_approval_review_scope(p_actor,(saved->>'id')::uuid);
  IF current_scope->>'hasReplacement'='true' THEN
    RAISE EXCEPTION 'Có chứng từ đính chính mới. Mua hàng cần kiểm tra và bàn giao lại trước khi duyệt.' USING ERRCODE='PT432';
  END IF;
  IF current_scope->>'truncated'='true'
    OR p_review_token IS DISTINCT FROM private.purchase_approval_review_token(current_scope)
  THEN RAISE EXCEPTION 'Nguồn chứng từ vừa thay đổi. Hãy kiểm tra lại hồ sơ trước khi duyệt.' USING ERRCODE='PT433'; END IF;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_supplement_source_rows(uuid,uuid,text,text,timestamptz),
  private.purchase_supplement_context(uuid,uuid),private.purchase_supplement_owned_invoice(uuid,uuid),
  private.purchase_supplement_review_state(uuid,uuid),public.read_purchase_supplement_progress(uuid,uuid[]),
  public.save_purchase_supplement_progress(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_supplement_progress(uuid,uuid[]),
  public.save_purchase_supplement_progress(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
