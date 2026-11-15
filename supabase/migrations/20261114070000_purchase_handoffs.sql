BEGIN;

CREATE TABLE private.purchase_handoff_orders (
  owner_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  PRIMARY KEY(owner_id,commitment_id),
  FOREIGN KEY(owner_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE
);
CREATE TABLE private.purchase_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES private.purchase_payment_documents(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_label text NOT NULL,
  proof text NOT NULL,
  reference text NOT NULL,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','returned','superseded','approved')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (owner_id<>reviewer_id),
  FOREIGN KEY(owner_id,commitment_id) REFERENCES private.purchase_handoff_orders(owner_id,commitment_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX purchase_handoff_pending ON private.purchase_handoffs(owner_id,invoice_id) WHERE status='pending';
CREATE INDEX purchase_handoff_queue ON private.purchase_handoffs(reviewer_id,created_at DESC);
CREATE TABLE private.purchase_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id uuid NOT NULL REFERENCES private.purchase_handoffs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL,
  action text NOT NULL CHECK (action IN ('submit','return','supersede','approve')),
  reason text,
  decision_id uuid REFERENCES private.purchase_payment_decisions(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX purchase_handoff_history ON private.purchase_handoff_events(handoff_id,recorded_at);
CREATE TABLE private.purchase_handoff_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  hash bytea NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(actor_id,request_key)
);
ALTER TABLE private.purchase_payment_decisions ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
REVOKE ALL ON TABLE private.purchase_handoff_orders,private.purchase_handoffs,private.purchase_handoff_events,
  private.purchase_handoff_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.purchase_handoff_history(p_actor uuid,p_owner uuid,p_id uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'handoffId',h.id,'action',e.action,
    'actor',e.actor_label,'reviewer',h.reviewer_label,'at',e.recorded_at,'reason',e.reason,'invoice',h.invoice_number,'decisionId',e.decision_id)
    ORDER BY e.recorded_at DESC,e.id DESC),'[]'::jsonb)
  FROM (
    SELECT e.* FROM private.purchase_handoff_events e JOIN private.purchase_handoffs h ON h.id=e.handoff_id
    WHERE h.owner_id=p_owner AND h.commitment_id=p_id
      AND (p_actor=h.owner_id OR (p_actor=h.reviewer_id AND h.invoice_id=p_invoice))
    ORDER BY e.recorded_at DESC,e.id DESC LIMIT 80
  ) e JOIN private.purchase_handoffs h ON h.id=e.handoff_id
$$;

CREATE FUNCTION private.purchase_handoff_files(p_owner uuid,p_snapshot jsonb)
RETURNS TABLE(attachment_id uuid,email_id uuid,digest text,filename text)
LANGUAGE sql STABLE SET search_path='' AS $$
  WITH documents AS (
    SELECT p_snapshot#>'{price,evidence}' AS e
    UNION ALL SELECT p_snapshot#>'{invoice,evidence}'
    UNION ALL SELECT item->'evidence' FROM jsonb_array_elements(COALESCE(p_snapshot->'allocations','[]')) item
  )
  SELECT (e->>'attachmentId')::uuid,(e->>'emailId')::uuid,e->>'digest',e->>'filename'
  FROM documents WHERE e->>'attachmentId' IS NOT NULL
  UNION
  SELECT d.attachment_id,d.email_id,d.digest,d.filename
  FROM jsonb_array_elements(COALESCE(p_snapshot->'sources','[]')) item
  JOIN private.purchase_csv_rows r ON r.user_id=p_owner AND r.id=(item#>>'{attachment,proofId}')::uuid
  JOIN private.purchase_csv_documents d USING(user_id,commitment_id,version)
$$;

-- Keep owner mail identifiers and ordinary Inbox links out of the delegated response.
CREATE FUNCTION private.purchase_handoff_evidence(p_snapshot jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_snapshot-ARRAY['id','command','invoices','sources','price','invoice','allocations']) ||
    jsonb_build_object(
      'price',(p_snapshot->'price') || jsonb_build_object('evidence',(p_snapshot#>'{price,evidence}')-ARRAY['emailId','digest','account']),
      'invoice',(p_snapshot->'invoice') || jsonb_build_object('evidence',(p_snapshot#>'{invoice,evidence}')-ARRAY['emailId','digest','account']),
      'allocations',COALESCE((SELECT jsonb_agg(item || jsonb_build_object('evidence',(item->'evidence')-ARRAY['emailId','digest','account']))
        FROM jsonb_array_elements(COALESCE(p_snapshot->'allocations','[]')) item),'[]'::jsonb),
      'sources',COALESCE((SELECT jsonb_agg(item-ARRAY['emailId','href','attachment'] ||
        CASE WHEN item->'attachment' IS NOT NULL THEN jsonb_build_object('attachment',(item->'attachment')-'proofId') ELSE '{}'::jsonb END)
        FROM jsonb_array_elements(COALESCE(p_snapshot->'sources','[]')) item),'[]'::jsonb)
    )
$$;

CREATE FUNCTION private.active_purchase_handoff(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  handoff private.purchase_handoffs;
  snapshot jsonb;
BEGIN
  SELECT h.* INTO handoff FROM private.purchase_handoffs h
  WHERE h.id=p_handoff AND h.reviewer_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;
  IF handoff.status<>'pending' THEN RETURN NULL; END IF;
  snapshot:=private.purchase_installment_snapshot(handoff.owner_id,handoff.commitment_id,handoff.invoice_id,'{}');
  IF snapshot#>>'{command,proof}' IS DISTINCT FROM handoff.proof THEN RETURN NULL; END IF;
  RETURN snapshot;
END;
$$;

CREATE FUNCTION public.read_purchase_handoff(p_handoff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  item private.purchase_handoffs;
  snapshot jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT h.* INTO item FROM private.purchase_handoffs h WHERE h.id=p_handoff AND h.reviewer_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;
  snapshot:=private.active_purchase_handoff(actor,p_handoff);
  RETURN jsonb_build_object('id',item.id,'reference',item.reference,'invoice',item.invoice_number,
    'status',CASE WHEN item.status='pending' AND snapshot IS NULL THEN 'stale' ELSE item.status END,
    'snapshot',CASE WHEN snapshot IS NOT NULL THEN private.purchase_handoff_evidence(snapshot) END,
    'history',private.purchase_handoff_history(actor,item.owner_id,item.commitment_id,item.invoice_id));
END;
$$;

CREATE FUNCTION public.list_purchase_handoffs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'reference',h.reference,'invoice',h.invoice_number,
    'status',CASE WHEN h.status='pending' AND private.active_purchase_handoff(actor,h.id) IS NULL
      THEN 'stale' ELSE h.status END,'at',h.created_at) ORDER BY h.created_at DESC)
    FROM (SELECT * FROM private.purchase_handoffs WHERE reviewer_id=actor ORDER BY created_at DESC LIMIT 50) h),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.read_purchase_handoff_owner(p_id uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.commitments c WHERE c.user_id=actor AND c.id=p_id)
  THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  RETURN jsonb_build_object('managed',EXISTS(SELECT 1 FROM private.purchase_handoff_orders m WHERE m.owner_id=actor AND m.commitment_id=p_id),
    'pending', (SELECT jsonb_build_object('id',h.id,'reviewer',h.reviewer_label,'at',h.created_at)
      FROM private.purchase_handoffs h
      WHERE h.owner_id=actor AND h.commitment_id=p_id AND h.invoice_id=p_invoice AND h.status='pending'),
    'history',private.purchase_handoff_history(actor,actor,p_id,NULL));
END;
$$;

CREATE FUNCTION public.resolve_purchase_handoff_files(p_actor uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  snapshot jsonb:=private.active_purchase_handoff(p_actor,p_handoff);
  owner uuid;
BEGIN
  IF snapshot IS NULL THEN
    RAISE EXCEPTION 'Hồ sơ đã đổi hoặc đã kết thúc. Hãy mở lại danh sách.' USING ERRCODE='PT432';
  END IF;
  SELECT owner_id INTO owner FROM private.purchase_handoffs WHERE id=p_handoff AND reviewer_id=p_actor;
  RETURN jsonb_build_object('ownerId',owner,'files',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'attachmentId',f.attachment_id,'emailId',f.email_id,'digest',f.digest,'filename',f.filename) ORDER BY f.attachment_id)
    FROM private.purchase_handoff_files(owner,snapshot) f),'[]'::jsonb));
END;
$$;

-- Legacy personal POs can still use the prior approval. The first handoff opts the PO into separate roles.
ALTER FUNCTION public.confirm_purchase_payment(uuid,uuid,jsonb,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.confirm_purchase_payment(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.confirm_purchase_payment(p_actor uuid,p_key uuid,p_command jsonb,p_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  ref text;
  target uuid:=(p_command->>'id')::uuid;
  receipt jsonb;
BEGIN
  IF p_command->>'action'='approve' THEN
    receipt:=private.purchase_payment_receipt(p_actor,p_key,p_command);
    IF receipt->>'replayed'='true' THEN RETURN receipt; END IF;
    SELECT c.detection_reference INTO ref FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;
    -- Take the same key lock as the upstream function before taking the case lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('purchase-payment:' || p_actor || ':' || p_key,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || ref,0));
    IF EXISTS (SELECT 1 FROM private.purchase_handoff_orders m WHERE m.owner_id=p_actor AND m.commitment_id=target) THEN
      RAISE EXCEPTION 'PO đã tách quyền duyệt. Kế toán được giao mới có thể duyệt.' USING ERRCODE='PT403';
    END IF;
  END IF;
  RETURN private.confirm_purchase_payment(p_actor,p_key,p_command,p_text);
END;
$$;

CREATE FUNCTION private.purchase_handoff_receipt(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE stored private.purchase_handoff_requests;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT r.* INTO stored FROM private.purchase_handoff_requests r WHERE r.actor_id=p_actor AND r.request_key=p_key;
  IF NOT FOUND THEN RETURN '{"replayed":false}'; END IF;
  IF stored.hash IS DISTINCT FROM sha256(convert_to(p_command::text,'UTF8')) THEN
    RAISE EXCEPTION 'Mã yêu cầu đã dùng cho thao tác khác.' USING ERRCODE='PT432';
  END IF;
  RETURN stored.result || '{"replayed":true}';
END;
$$;

CREATE FUNCTION public.read_purchase_handoff_receipt(p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.purchase_handoff_receipt(auth.uid(),p_key,p_command)
$$;

CREATE FUNCTION public.confirm_purchase_handoff(p_actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  operation text:=p_command->>'action';
  target uuid:=(p_command->>'commitmentId')::uuid;
  selected_invoice uuid:=(p_command->>'invoiceId')::uuid;
  item_id uuid:=(p_command->>'handoffId')::uuid;
  owner uuid;
  reviewer uuid;
  reviewer_label text;
  actor_label text;
  ref text;
  snapshot jsonb;
  item private.purchase_handoffs;
  prior private.purchase_handoffs;
  decision uuid;
  result jsonb;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR COALESCE(operation,'') NOT IN ('submit','return','approve')
    OR octet_length(p_command::text)>4096
  THEN RAISE EXCEPTION 'Invalid handoff command' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-handoff:' || p_actor || ':' || p_key,0));
  result:=private.purchase_handoff_receipt(p_actor,p_key,p_command);
  IF result->>'replayed'='true' THEN RETURN result; END IF;
  SELECT u.email INTO actor_label FROM auth.users u WHERE u.id=p_actor;
  IF actor_label IS NULL THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;

  IF operation='submit' THEN
    owner:=p_actor;
    SELECT (array_agg(u.id))[1],min(u.email) INTO reviewer,reviewer_label FROM auth.users u
    WHERE lower(u.email)=p_command->>'reviewer' AND u.email_confirmed_at IS NOT NULL
    HAVING count(*)=1;
    IF reviewer IS NULL OR reviewer=owner THEN
      RAISE EXCEPTION 'Chọn một tài khoản Kế toán đã xác minh và khác người bàn giao.' USING ERRCODE='PT431';
    END IF;
  ELSE
    SELECT h.* INTO item FROM private.purchase_handoffs h WHERE h.id=item_id AND h.reviewer_id=p_actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Handoff unavailable' USING ERRCODE='PT404'; END IF;
    owner:=item.owner_id;
    target:=item.commitment_id;
    selected_invoice:=item.invoice_id;
  END IF;

  SELECT c.detection_reference INTO ref FROM private.commitments c WHERE c.user_id=owner AND c.id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || owner || ':' || ref,0));
  PERFORM c.id FROM private.commitments c WHERE c.user_id=owner AND c.id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;
  IF operation<>'submit' THEN
    SELECT h.* INTO item FROM private.purchase_handoffs h WHERE h.id=item_id AND h.reviewer_id=p_actor FOR UPDATE;
    IF NOT FOUND OR item.status<>'pending' THEN
      RAISE EXCEPTION 'Hồ sơ đã kết thúc hoặc đã có phiên bản mới.' USING ERRCODE='PT432';
    END IF;
  END IF;

  IF operation='return' THEN
    IF length(btrim(COALESCE(p_command->>'reason',''))) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Cần lý do trả hồ sơ.' USING ERRCODE='PT431';
    END IF;
    UPDATE private.purchase_handoffs SET status='returned' WHERE id=item_id;
    INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action,reason)
    VALUES(item_id,p_actor,actor_label,'return',btrim(p_command->>'reason'));
  ELSE
    -- Keep evidence rows and attachment metadata stable through the snapshot check and decision insert.
    PERFORM e.id FROM public.emails e WHERE e.user_id=owner AND e.id IN (
      SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=owner AND d.commitment_id=target
      UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(owner,target) s
    ) ORDER BY e.id FOR SHARE;
    PERFORM f.id FROM public.attachments f JOIN public.emails e ON e.id=f.email_id AND e.user_id=owner
    WHERE f.id IN (
      SELECT d.attachment_id FROM private.purchase_payment_documents d WHERE d.user_id=owner AND d.commitment_id=target
      UNION SELECT d.attachment_id FROM private.purchase_csv_documents d WHERE d.user_id=owner AND d.commitment_id=target
    ) ORDER BY f.id FOR SHARE OF f;
    PERFORM a.id FROM public.source_accounts a WHERE a.user_id=owner AND a.id IN (
      SELECT e.source_account_id FROM public.emails e WHERE e.user_id=owner AND e.id IN (
        SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=owner AND d.commitment_id=target
        UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(owner,target) s
      )
    ) ORDER BY a.id FOR SHARE;
    snapshot:=private.purchase_installment_snapshot(owner,target,selected_invoice,'{}');
    IF snapshot#>>'{command,proof}' IS NULL OR snapshot#>>'{command,proof}' IS DISTINCT FROM
      (CASE WHEN operation='submit' THEN p_command->>'proof' ELSE item.proof END)
    THEN RAISE EXCEPTION 'Chứng từ hoặc số đã duyệt đã đổi. Mua hàng cần đối soát và bàn giao lại.' USING ERRCODE='PT432'; END IF;

    IF operation='submit' THEN
      INSERT INTO private.purchase_handoff_orders(owner_id,commitment_id) VALUES(owner,target) ON CONFLICT DO NOTHING;
      FOR prior IN
        SELECT h.* FROM private.purchase_handoffs h
        JOIN private.purchase_payment_documents d ON d.user_id=owner AND d.commitment_id=target AND d.id=h.invoice_id
        JOIN private.purchase_payment_documents chosen ON chosen.user_id=owner AND chosen.commitment_id=target AND chosen.id=selected_invoice
        WHERE h.owner_id=owner AND h.commitment_id=target AND h.status='pending' AND d.installment_id=chosen.installment_id
        FOR UPDATE OF h
      LOOP
        UPDATE private.purchase_handoffs SET status='superseded' WHERE id=prior.id;
        INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action)
        VALUES(prior.id,p_actor,actor_label,'supersede');
      END LOOP;
      INSERT INTO private.purchase_handoffs(owner_id,commitment_id,invoice_id,reviewer_id,reviewer_label,proof,reference,invoice_number)
      VALUES(owner,target,selected_invoice,reviewer,reviewer_label,p_command->>'proof',ref,snapshot#>>'{invoice,number}') RETURNING id INTO item_id;
      INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action)
      VALUES(item_id,p_actor,actor_label,'submit');
    ELSE
      INSERT INTO private.purchase_payment_decisions(user_id,commitment_id,invoice_id,proof,approved_by)
      VALUES(owner,target,selected_invoice,item.proof,p_actor) RETURNING id INTO decision;
      UPDATE private.purchase_handoffs SET status='approved' WHERE id=item_id;
      INSERT INTO private.purchase_handoff_events(handoff_id,actor_id,actor_label,action,decision_id)
      VALUES(item_id,p_actor,actor_label,'approve',decision);
    END IF;
  END IF;

  result:=jsonb_build_object('id',item_id,'action',operation,'decisionId',decision,'replayed',false);
  INSERT INTO private.purchase_handoff_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_handoff_history(uuid,uuid,uuid,uuid),private.purchase_handoff_files(uuid,jsonb),
  private.purchase_handoff_evidence(jsonb),private.active_purchase_handoff(uuid,uuid),private.purchase_handoff_receipt(uuid,uuid,jsonb),
  public.read_purchase_handoff(uuid),public.list_purchase_handoffs(),public.read_purchase_handoff_owner(uuid,uuid),
  public.read_purchase_handoff_receipt(uuid,jsonb),public.resolve_purchase_handoff_files(uuid,uuid),
  public.confirm_purchase_handoff(uuid,uuid,jsonb),public.confirm_purchase_payment(uuid,uuid,jsonb,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_handoff(uuid),public.list_purchase_handoffs(),
  public.read_purchase_handoff_owner(uuid,uuid),public.read_purchase_handoff_receipt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_handoff_files(uuid,uuid),public.confirm_purchase_handoff(uuid,uuid,jsonb),
  public.confirm_purchase_payment(uuid,uuid,jsonb,text) TO service_role;

COMMIT;
