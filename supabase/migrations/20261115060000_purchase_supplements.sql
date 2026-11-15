BEGIN;

CREATE INDEX emails_purchase_supplements ON public.emails
  (user_id,source_account_id,lower(btrim(from_address)),received_at DESC,id)
  WHERE direction='inbound' AND sync_namespace='gmail' AND NOT provider_deleted AND is_deleted IS NOT TRUE;

-- The inbox may only shortlist mail owned by the buyer assigned the open exception.
-- Metadata is a filter. Reading and comparing an exact attachment is a separate step.
CREATE FUNCTION public.list_purchase_supplement_sources(p_cases uuid[])
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
    CROSS JOIN LATERAL (
      WITH newest AS MATERIALIZED (
        SELECT e.id AS email_id,e.received_at,e.subject,f.id AS file_id,f.filename,private.purchase_csv_binding(e,f) AS binding
        FROM public.emails e JOIN public.attachments f ON f.email_id=e.id
        WHERE e.user_id=actor AND e.source_account_id=a.id
          AND lower(btrim(e.from_address))=lower(btrim(original.from_address))
          AND private.commitment_subject_reference(e.subject)=h.reference
          AND e.direction='inbound' AND e.sync_namespace='gmail' AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
          AND e.received_at>d.source_at AND f.is_inline IS NOT TRUE AND f.sync_part_key IS NOT NULL
          AND f.size BETWEEN 1 AND 8192 AND f.filename ~* '\.csv$' AND f.filename !~ '[[:cntrl:]]' AND length(f.filename)<=255
          AND lower(trim(split_part(COALESCE(f.content_type,''),';',1))) IN
            ('text/csv','application/csv','application/octet-stream','application/vnd.ms-excel','text/plain')
          AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents registered
            WHERE registered.user_id=actor AND registered.attachment_id=f.id)
        ORDER BY e.received_at DESC,e.id DESC,f.id LIMIT 7
      )
      SELECT (SELECT count(*)>6 FROM newest) AS truncated,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('emailId',n.email_id,'fileId',n.file_id,
          'filename',n.filename,'subject',n.subject,'binding',n.binding)
          ORDER BY n.received_at DESC,n.email_id DESC,n.file_id)
          FROM (SELECT * FROM newest ORDER BY received_at DESC,email_id DESC,file_id LIMIT 6) n),'[]'::jsonb) AS files
    ) candidates
    WHERE x.owner_id=actor AND x.origin_handoff=ANY(p_cases) AND x.stage<>'closed'
  );
END;
$$;

CREATE FUNCTION public.inspect_purchase_supplement(p_actor uuid,p_case uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  item private.purchase_due_exceptions;
  original_doc private.purchase_payment_documents;
  ancestor private.purchase_payment_documents;
  picked record;
  parsed jsonb;
  ref text;
  header text;
  file_digest text;
  prepared jsonb;
BEGIN
  SELECT x.* INTO item FROM private.purchase_due_exceptions x
  WHERE x.origin_handoff=p_case AND x.owner_id=p_actor AND x.stage<>'closed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Hồ sơ bổ sung không còn khả dụng.' USING ERRCODE='PT404'; END IF;
  SELECT d.* INTO STRICT original_doc FROM private.purchase_handoffs h JOIN private.purchase_payment_documents d
    ON d.id=h.invoice_id AND d.user_id=h.owner_id AND d.commitment_id=h.commitment_id
  WHERE h.id=p_case AND h.owner_id=p_actor AND h.commitment_id=item.commitment_id;
  SELECT h.reference INTO STRICT ref FROM private.purchase_handoffs h WHERE h.id=p_case AND h.owner_id=p_actor;
  SELECT * INTO STRICT picked FROM private.purchase_csv_input(p_actor,p_email,p_attachment);
  IF picked.binding IS DISTINCT FROM p_binding THEN
    RAISE EXCEPTION 'Email hoặc tệp nguồn đã thay đổi.' USING ERRCODE='PT432';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.emails origin WHERE origin.id=original_doc.email_id AND origin.user_id=p_actor
      AND origin.source_account_id=(picked.source).source_account_id
      AND lower(btrim(origin.from_address))=lower(btrim((picked.source).from_address))
      AND private.commitment_subject_reference((picked.source).subject)=ref
  ) THEN RAISE EXCEPTION 'Email không thuộc nguồn bổ sung của hồ sơ.' USING ERRCODE='PT404'; END IF;

  IF p_text IS NULL OR octet_length(p_text)>8192 THEN RAISE EXCEPTION 'Tệp vượt giới hạn dung lượng.' USING ERRCODE='PT413'; END IF;
  header:=replace(rtrim(split_part(regexp_replace(p_text,'^' || chr(65279),''),E'\n',1),E'\r'),'"','');
  IF header NOT IN ('po,invoice,replaces,line,quantity,unit,unit_price,currency',
    'po,invoice,replaces,line,quantity,unit,unit_price,currency,payment_due') THEN RETURN '{"status":"ignore"}'; END IF;
  BEGIN
    parsed:=private.parse_purchase_payment(p_text);
  EXCEPTION WHEN SQLSTATE 'PT431' THEN
    RETURN '{"status":"invalid"}';
  END;
  IF parsed->>'reference' IS DISTINCT FROM ref THEN RETURN '{"status":"wrong_po"}'; END IF;
  IF parsed->>'replaces' IS NULL THEN RETURN '{"status":"unlinked"}'; END IF;
  SELECT d.* INTO ancestor FROM private.purchase_payment_documents d
    WHERE d.user_id=p_actor AND d.commitment_id=item.commitment_id AND d.kind='invoice' AND d.number=parsed->>'replaces';
  IF NOT FOUND THEN RETURN '{"status":"unlinked"}'; END IF;
  IF ancestor.installment_id<>item.installment_id THEN RETURN '{"status":"ignore"}'; END IF;

  file_digest:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
  IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=item.commitment_id
    AND d.installment_id=item.installment_id AND d.digest=file_digest) THEN RETURN '{"status":"duplicate"}'; END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=item.commitment_id
    AND d.number=parsed->>'number') THEN RETURN '{"status":"number_conflict"}'; END IF;

  IF (picked.source).received_at<=ancestor.source_at OR EXISTS (
    SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=item.commitment_id
      AND d.kind='invoice' AND d.replaces=ancestor.number
  ) THEN RETURN '{"status":"old"}'; END IF;
  IF item.requires_due AND parsed#>>'{lines,0,paymentDue}' IS NULL THEN RETURN '{"status":"missing_due"}'; END IF;
  BEGIN
    prepared:=private.prepare_purchase_payment(p_actor,p_email,p_attachment,p_binding,p_text);
  EXCEPTION WHEN SQLSTATE 'PT431' OR SQLSTATE 'PT432' THEN
    RETURN '{"status":"invalid"}';
  END;
  IF prepared#>>'{command,id}' IS DISTINCT FROM item.commitment_id::text THEN
    RETURN '{"status":"invalid"}';
  END IF;
  RETURN jsonb_build_object('status','match','preview',prepared);
END;
$$;

CREATE FUNCTION public.confirm_purchase_supplement(p_actor uuid,p_key uuid,p_case uuid,p_command jsonb,p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  prior jsonb;
  checked jsonb;
  ref text;
  target uuid:=(p_command->>'id')::uuid;
  source_email uuid:=(p_command->>'emailId')::uuid;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_case IS NULL OR target IS NULL OR source_email IS NULL
    OR p_command->>'action' IS DISTINCT FROM 'register' OR octet_length(p_command::text)>4096
  THEN RAISE EXCEPTION 'Invalid supplement command' USING ERRCODE='22023'; END IF;
  -- Use the existing document idempotency and its source-before-case lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-payment:' || p_actor || ':' || p_key,0));
  prior:=private.purchase_payment_receipt(p_actor,p_key,p_command);
  IF prior->>'replayed'='true' THEN RETURN prior; END IF;
  SELECT c.detection_reference INTO ref FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hồ sơ bổ sung không còn khả dụng.' USING ERRCODE='PT404'; END IF;
  PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || ref,0));
  checked:=public.inspect_purchase_supplement(p_actor,p_case,source_email,(p_command->>'attachmentId')::uuid,p_command->>'binding',p_text);
  IF checked->>'status' IS DISTINCT FROM 'match' OR checked#>'{preview,command}' IS DISTINCT FROM p_command THEN
    RAISE EXCEPTION 'Hồ sơ hoặc chứng từ đã đổi. Hãy xem lại từ Inbox.' USING ERRCODE='PT432';
  END IF;
  RETURN public.confirm_purchase_payment(p_actor,p_key,p_command,p_text);
END;
$$;

REVOKE ALL ON FUNCTION public.list_purchase_supplement_sources(uuid[]),
  public.inspect_purchase_supplement(uuid,uuid,uuid,uuid,text,text),
  public.confirm_purchase_supplement(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_purchase_supplement_sources(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_purchase_supplement(uuid,uuid,uuid,uuid,text,text),
  public.confirm_purchase_supplement(uuid,uuid,uuid,jsonb,text) TO service_role;

COMMIT;
