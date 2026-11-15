BEGIN;

CREATE TABLE private.purchase_payment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('price','invoice')),
  number text NOT NULL,
  replaces text,
  email_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  filename text NOT NULL,
  binding text NOT NULL,
  digest text NOT NULL,
  source_at timestamptz NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 6),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id,commitment_id,number),
  UNIQUE (user_id,attachment_id),
  FOREIGN KEY (user_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX purchase_payment_one_price ON private.purchase_payment_documents(user_id,commitment_id) WHERE kind='price';
CREATE UNIQUE INDEX purchase_payment_one_original ON private.purchase_payment_documents(user_id,commitment_id)
  WHERE kind='invoice' AND replaces IS NULL;
CREATE UNIQUE INDEX purchase_payment_invoice_successor ON private.purchase_payment_documents(user_id,commitment_id,replaces)
  WHERE replaces IS NOT NULL;

CREATE TABLE private.purchase_payment_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES private.purchase_payment_documents(id) ON DELETE CASCADE,
  proof text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id,commitment_id,proof),
  FOREIGN KEY (user_id,commitment_id) REFERENCES private.commitments(user_id,id) ON DELETE CASCADE
);
CREATE TABLE private.purchase_payment_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  command_hash bytea NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (user_id,request_key)
);
REVOKE ALL ON TABLE private.purchase_payment_documents,private.purchase_payment_decisions,private.purchase_payment_requests
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.parse_purchase_payment(p_text text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  input text;
  records text[];
  fields text[];
  header text;
  row_count int;
  i int;
  j int;
  kind text;
  ident text[];
  lines jsonb:='[]';
  codes text[]:='{}';
BEGIN
  IF p_text IS NULL OR octet_length(p_text)>8192 THEN
    RAISE EXCEPTION 'CSV vượt giới hạn dung lượng.' USING ERRCODE='PT413';
  END IF;
  input:=replace(regexp_replace(p_text,'^' || chr(65279),''),E'\r\n',E'\n');
  IF right(input,1)=E'\n' THEN input:=left(input,-1); END IF;
  records:=string_to_array(input,E'\n');
  row_count:=COALESCE(cardinality(records),0);
  header:=replace(records[1],'"','');
  kind:=CASE header
    WHEN 'po,price_sheet,line,quantity,unit,unit_price,currency' THEN 'price'
    WHEN 'po,invoice,replaces,line,quantity,unit,unit_price,currency' THEN 'invoice'
  END;
  IF row_count NOT BETWEEN 2 AND 7 OR kind IS NULL THEN
    RAISE EXCEPTION 'Cần bảng giá PO hoặc hóa đơn CSV theo mẫu và từ 1 đến 6 dòng dữ liệu.' USING ERRCODE='PT431';
  END IF;
  FOR i IN 2..row_count LOOP
    fields:=string_to_array(records[i],',');
    IF cardinality(fields)<>(CASE WHEN kind='price' THEN 7 ELSE 8 END) THEN
      RAISE EXCEPTION 'Dòng % của CSV sai số cột.',i USING ERRCODE='PT431';
    END IF;
    FOR j IN 1..cardinality(fields) LOOP
      IF fields[j] ~ '^"[^"]*"$' THEN fields[j]:=substring(fields[j] FROM 2 FOR length(fields[j])-2); END IF;
    END LOOP;
    IF kind='price' THEN fields:=fields[1:2] || ARRAY[''] || fields[3:7]; END IF;
    IF fields[1] !~ '^PO-[0-9]{1,12}$'
      OR fields[2] !~ (CASE WHEN kind='price' THEN '^BG-[0-9]{1,12}$' ELSE '^INV-[0-9]{1,12}$' END)
      OR (fields[3]<>'' AND (fields[3] !~ '^INV-[0-9]{1,12}$' OR fields[3]=fields[2]))
      OR fields[4] !~ '^[A-Z0-9]{1,12}$' OR fields[4]=ANY(codes)
      OR fields[5] !~ '^[1-9][0-9]{0,6}$'
      OR fields[6] NOT IN ('bộ','chiếc','kiện','cuộn','hộp','cái')
      OR fields[7] !~ '^(0|[1-9][0-9]{0,7})$' OR fields[8]<>'VND'
    THEN RAISE EXCEPTION 'Dòng % có mã, đơn vị, số lượng hoặc đơn giá VND không hợp lệ.',i USING ERRCODE='PT431'; END IF;
    IF ident IS NULL THEN ident:=fields[1:3]; END IF;
    IF ident IS DISTINCT FROM fields[1:3] THEN
      RAISE EXCEPTION 'Mỗi tệp CSV chỉ chứa một chứng từ của một PO.' USING ERRCODE='PT431';
    END IF;
    codes:=array_append(codes,fields[4]);
    lines:=lines || jsonb_build_array(jsonb_build_object('row',i,'code',fields[4],'quantity',fields[5]::int,
      'unit',fields[6],'price',fields[7]::int,'quote',records[i]));
  END LOOP;
  RETURN jsonb_build_object('kind',kind,'reference',ident[1],'number',ident[2],'replaces',NULLIF(ident[3],''),'lines',lines);
END;
$$;

CREATE FUNCTION private.purchase_payment_document(actor uuid,p_document uuid,p_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',d.id,'kind',d.kind,'number',d.number,'replaces',d.replaces,'lines',d.lines,
    'evidence',jsonb_build_object('emailId',d.email_id,'attachmentId',d.attachment_id,'filename',d.filename,
      'digest',d.digest,'subject',e.subject,'sender',e.from_address,'account',a.email_address))
  FROM private.purchase_payment_documents d
  JOIN public.emails e ON e.user_id=actor AND e.id=d.email_id AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  JOIN public.source_accounts a ON a.user_id=actor AND a.id=e.source_account_id AND a.is_active
  JOIN public.attachments f ON f.email_id=e.id AND f.id=d.attachment_id
  WHERE d.user_id=actor AND d.id=p_document
    AND d.binding=private.purchase_csv_binding(e,f) AND private.ask_scope(e,actor,p_filters)
$$;

CREATE FUNCTION private.prepare_purchase_payment(actor uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  picked record;
  source public.emails;
  file public.attachments;
  parsed jsonb;
  head private.commitments;
  state jsonb;
  original_mail public.emails;
  active_invoice private.purchase_payment_documents;
  row_data jsonb;
  po_line jsonb;
  registration_hash text;
BEGIN
  SELECT * INTO STRICT picked FROM private.purchase_csv_input(actor,p_email,p_attachment);
  source:=picked.source;
  file:=picked.file;
  IF picked.binding IS DISTINCT FROM p_binding THEN
    RAISE EXCEPTION 'Email hoặc tệp đã thay đổi. Hãy mở lại chứng từ.' USING ERRCODE='PT432';
  END IF;
  parsed:=private.parse_purchase_payment(p_text);
  IF private.commitment_subject_reference(source.subject) IS DISTINCT FROM parsed->>'reference' THEN
    RAISE EXCEPTION 'Mã PO trên email và trong CSV phải trùng nhau.' USING ERRCODE='PT431';
  END IF;
  SELECT * INTO head FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=parsed->>'reference';
  IF NOT FOUND OR (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=parsed->>'reference')<>1
  THEN RAISE EXCEPTION 'Chưa xác định được đơn mua hàng.' USING ERRCODE='PT431'; END IF;
  SELECT r.state INTO state FROM private.commitment_revisions r
    WHERE r.user_id=actor AND r.commitment_id=head.id AND r.version=head.version;
  SELECT e.* INTO original_mail FROM private.purchase_order_sources(actor,head.id) s
    JOIN public.emails e ON e.user_id=actor AND e.id=(s.evidence->>'emailId')::uuid
    WHERE s.operation='create' AND s.evidence->>'availability'='available';
  IF NOT FOUND OR NOT (state ? 'purchaseOrder') OR state->>'status'='cancelled'
    OR source.source_account_id IS DISTINCT FROM original_mail.source_account_id
    OR lower(btrim(source.from_address)) IS DISTINCT FROM state->>'ownerEmail'
    OR source.received_at<original_mail.received_at
  THEN RAISE EXCEPTION 'Chứng từ phải từ nhà cung cấp qua hộp thư Mua hàng của PO.' USING ERRCODE='PT431'; END IF;

  IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=actor
    AND (d.attachment_id=p_attachment OR (d.commitment_id=head.id AND d.number=parsed->>'number')))
  THEN RAISE EXCEPTION 'Chứng từ này đã được ghi nhận.' USING ERRCODE='PT432'; END IF;

  IF parsed->>'kind'='price' THEN
    IF EXISTS (SELECT 1 FROM private.purchase_payment_documents d WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='price')
    THEN RAISE EXCEPTION 'Đơn đã có bảng giá được duyệt.' USING ERRCODE='PT432'; END IF;
    IF jsonb_array_length(parsed->'lines')<>jsonb_array_length(state#>'{purchaseOrder,lines}') THEN
      RAISE EXCEPTION 'Bảng giá phải bao phủ đủ dòng trên PO.' USING ERRCODE='PT431';
    END IF;
  ELSE
    SELECT d.* INTO active_invoice FROM private.purchase_payment_documents d
    WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='invoice'
      AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents n WHERE n.user_id=actor
        AND n.commitment_id=head.id AND n.replaces=d.number);
    IF active_invoice.number IS DISTINCT FROM parsed->>'replaces'
      OR (active_invoice.id IS NOT NULL AND source.received_at<=active_invoice.source_at)
    THEN RAISE EXCEPTION 'Hóa đơn đính chính phải mới hơn và thay đúng hóa đơn đang hiệu lực.' USING ERRCODE='PT432'; END IF;
    IF active_invoice.id IS NOT NULL AND private.purchase_payment_document(actor,active_invoice.id) IS NULL THEN
      RAISE EXCEPTION 'Hóa đơn bị thay thế không còn nguồn kiểm chứng.' USING ERRCODE='PT432';
    END IF;
    IF (SELECT count(*) FROM private.purchase_payment_documents d WHERE d.user_id=actor AND d.commitment_id=head.id)>=32 THEN
      RAISE EXCEPTION 'Đơn đã đạt giới hạn chứng từ.' USING ERRCODE='PT431';
    END IF;
  END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(parsed->'lines') LOOP
    SELECT l.value INTO po_line FROM jsonb_array_elements(state#>'{purchaseOrder,lines}') l(value)
      WHERE l.value->>'code'=row_data->>'code';
    IF NOT FOUND OR po_line->>'unit'<>row_data->>'unit'
      OR (parsed->>'kind'='price' AND po_line->>'ordered'<>row_data->>'quantity')
    THEN RAISE EXCEPTION 'Dòng % không khớp mã, đơn vị hoặc số đặt trên PO.',row_data->>'row' USING ERRCODE='PT431'; END IF;
  END LOOP;
  registration_hash:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
  RETURN parsed || jsonb_build_object('source',jsonb_build_object('emailId',source.id,'attachmentId',file.id,'filename',file.filename,
    'digest',registration_hash,'subject',source.subject,'sender',source.from_address,
    'account',(SELECT a.email_address FROM public.source_accounts a WHERE a.user_id=actor AND a.id=source.source_account_id)),
    'command',jsonb_build_object('action','register','id',head.id,'version',head.version,'emailId',source.id,
      'attachmentId',file.id,'binding',picked.binding,'digest',registration_hash));
END;
$$;

CREATE FUNCTION private.purchase_payment_snapshot(actor uuid,p_id uuid,p_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  head private.commitments;
  state jsonb;
  price_id uuid;
  invoice_id uuid;
  price_doc jsonb;
  invoice_doc jsonb;
  sources jsonb;
  source_count integer;
  lines jsonb;
  subtotal bigint;
  blocked boolean;
  insufficient boolean;
  snapshot_hash text;
  decided private.purchase_payment_decisions;
BEGIN
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=actor AND c.id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  SELECT r.state INTO state FROM private.commitment_revisions r
    WHERE r.user_id=actor AND r.commitment_id=head.id AND r.version=head.version;
  IF NOT (state ? 'purchaseOrder') THEN RETURN '{"status":"unavailable"}'; END IF;
  SELECT d.id INTO price_id FROM private.purchase_payment_documents d
    WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='price';
  SELECT d.id INTO invoice_id FROM private.purchase_payment_documents d
    WHERE d.user_id=actor AND d.commitment_id=head.id AND d.kind='invoice'
      AND NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents n
        WHERE n.user_id=actor AND n.commitment_id=head.id AND n.replaces=d.number);
  price_doc:=private.purchase_payment_document(actor,price_id,p_filters);
  invoice_doc:=private.purchase_payment_document(actor,invoice_id,p_filters);
  IF (price_id IS NOT NULL AND price_doc IS NULL) OR (invoice_id IS NOT NULL AND invoice_doc IS NULL)
  THEN RETURN '{"status":"unavailable"}'; END IF;

  SELECT count(*),jsonb_agg(p.evidence || jsonb_build_object('line',p.line_code,'operation',p.operation,
    'sourceVersion',p.version) ORDER BY p.version,p.line_code)
  INTO source_count,sources
  FROM private.purchase_order_sources(actor,p_id) p
  JOIN public.emails e ON e.user_id=actor AND e.id=(p.evidence->>'emailId')::uuid
  WHERE p.operation IN ('create','receive','correct') AND p.evidence->>'availability'='available'
    AND private.ask_scope(e,actor,p_filters);
  IF source_count=0 OR source_count>16 OR source_count<>(SELECT count(*) FROM private.purchase_order_sources(actor,p_id) p
    WHERE p.operation IN ('create','receive','correct'))
    OR state->>'status'='cancelled' OR
    (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=head.detection_reference)<>1
  THEN RETURN '{"status":"unavailable"}'; END IF;

  IF price_doc IS NULL OR invoice_doc IS NULL THEN
    RETURN jsonb_build_object('id',p_id,'reference',head.detection_reference,
      'status',CASE WHEN price_doc IS NULL THEN 'missing_price' ELSE 'missing_invoice' END,
      'price',price_doc,'invoice',invoice_doc,'sources',sources);
  END IF;
  SELECT jsonb_agg(jsonb_build_object('code',i.value->>'code','unit',i.value->>'unit','invoiceRow',(i.value->>'row')::int,
      'priceRow',(p.value->>'row')::int,'ordered',(l.value->>'ordered')::int,'received',(l.value->>'received')::int,
      'quantity',(i.value->>'quantity')::int,'expectedPrice',(p.value->>'price')::int,'invoicePrice',(i.value->>'price')::int)
      ORDER BY i.ord),
    sum((i.value->>'quantity')::bigint*(i.value->>'price')::bigint),
    bool_or((i.value->>'quantity')::int > LEAST((l.value->>'ordered')::int,(l.value->>'received')::int)
      OR i.value->>'price' IS DISTINCT FROM p.value->>'price')
  INTO lines,subtotal,blocked
  FROM jsonb_array_elements(invoice_doc->'lines') WITH ORDINALITY i(value,ord)
  JOIN jsonb_array_elements(price_doc->'lines') p(value) ON p.value->>'code'=i.value->>'code'
  JOIN jsonb_array_elements(state#>'{purchaseOrder,lines}') l(value) ON l.value->>'code'=i.value->>'code';
  insufficient:=lines IS NULL OR jsonb_array_length(lines)<>jsonb_array_length(invoice_doc->'lines');
  IF insufficient THEN RETURN '{"status":"unavailable"}'; END IF;

  -- A payment decision remains current only while the exact source set and terms still match.
  snapshot_hash:=encode(sha256(convert_to(jsonb_build_array(price_doc,invoice_doc,sources,lines)::text,'UTF8')),'hex');
  SELECT * INTO decided FROM private.purchase_payment_decisions d
    WHERE d.user_id=actor AND d.commitment_id=p_id AND d.proof=snapshot_hash;
  RETURN jsonb_build_object('id',p_id,'reference',head.detection_reference,
    'status',CASE WHEN blocked THEN 'blocked' WHEN decided.id IS NOT NULL THEN 'approved' ELSE 'ready' END,
    'price',price_doc,'invoice',invoice_doc,'sources',sources,'lines',lines,'subtotal',subtotal,
    'decisionId',decided.id,'decisionAt',decided.recorded_at,
    'command',CASE WHEN NOT blocked AND decided.id IS NULL
      THEN jsonb_build_object('action','approve','id',p_id,'proof',snapshot_hash) END);
END;
$$;

CREATE FUNCTION public.read_purchase_payment(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  RETURN private.purchase_payment_snapshot(auth.uid(),p_id);
END;
$$;

CREATE FUNCTION public.ask_purchase_payment(p_reference text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  target uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  SELECT c.id INTO target FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=p_reference;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM private.purchase_payment_documents d
    WHERE d.user_id=actor AND d.commitment_id=target)
  THEN RETURN '{"status":"no_dossier"}'; END IF;
  RETURN private.purchase_payment_snapshot(actor,target,p_filters)-'command';
END;
$$;

CREATE FUNCTION public.list_purchase_payment_attention(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR cardinality(p_accounts)>50 THEN
    RAISE EXCEPTION 'Invalid account scope' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH recent AS MATERIALIZED (
      SELECT d.commitment_id,max(d.recorded_at) AS received
      FROM private.purchase_payment_documents d
      JOIN public.emails e ON e.user_id=actor AND e.id=d.email_id
      WHERE d.user_id=actor AND d.kind='invoice'
        AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
      GROUP BY d.commitment_id ORDER BY max(d.recorded_at) DESC LIMIT 12
    ), visible AS MATERIALIZED (
      SELECT r.received,private.purchase_payment_snapshot(actor,r.commitment_id,
        CASE WHEN cardinality(p_accounts)=0 THEN '{}'::jsonb ELSE jsonb_build_object('accounts',p_accounts) END) AS item
      FROM recent r
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',item->>'id','reference',item->>'reference','status',item->>'status',
      'invoice',item#>>'{invoice,number}') ORDER BY received DESC),'[]'::jsonb)
    FROM (SELECT * FROM visible WHERE item->>'status' IN ('blocked','ready','missing_price') ORDER BY received DESC LIMIT 4) selected
  );
END;
$$;

CREATE FUNCTION private.purchase_payment_receipt(actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  stored private.purchase_payment_requests;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO stored FROM private.purchase_payment_requests r WHERE r.user_id=actor AND r.request_key=p_key;
  IF NOT FOUND THEN RETURN '{"replayed":false}'; END IF;
  IF stored.command_hash IS DISTINCT FROM sha256(convert_to(p_command::text,'UTF8')) THEN
    RAISE EXCEPTION 'Mã yêu cầu đã dùng cho thao tác khác.' USING ERRCODE='PT432';
  END IF;
  RETURN stored.result || '{"replayed":true}';
END;
$$;

CREATE FUNCTION public.read_purchase_payment_receipt(p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.purchase_payment_receipt(auth.uid(),p_key,p_command)
$$;

CREATE FUNCTION public.preview_purchase_payment(p_actor uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.prepare_purchase_payment(p_actor,p_email,p_attachment,p_binding,p_text)
$$;

CREATE FUNCTION public.confirm_purchase_payment(p_actor uuid,p_key uuid,p_command jsonb,p_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  target uuid:=(p_command->>'id')::uuid;
  source_email uuid:=(p_command->>'emailId')::uuid;
  source_attachment uuid:=(p_command->>'attachmentId')::uuid;
  action text:=p_command->>'action';
  head private.commitments;
  ref text;
  result jsonb;
  prepared jsonb;
  document_id uuid;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR target IS NULL OR COALESCE(action,'') NOT IN ('register','approve')
    OR octet_length(p_command::text)>4096 OR (action='register' AND (source_email IS NULL OR source_attachment IS NULL))
  THEN RAISE EXCEPTION 'Invalid approval' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase-payment:' || p_actor || ':' || p_key,0));
  result:=private.purchase_payment_receipt(p_actor,p_key,p_command);
  IF result->>'replayed'='true' THEN RETURN result; END IF;
  SELECT c.detection_reference INTO ref FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;
  -- Match the source-before-case ordering of warehouse approvals.
  IF source_email IS NOT NULL THEN
    PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email FOR SHARE;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || ref,0));
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE='PT404'; END IF;

  PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id IN (
    SELECT d.email_id FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
    UNION SELECT (s.evidence->>'emailId')::uuid FROM private.purchase_order_sources(p_actor,target) s
  ) ORDER BY e.id FOR SHARE;
  PERFORM f.id FROM public.attachments f JOIN public.emails e ON e.id=f.email_id AND e.user_id=p_actor
  WHERE (f.id=source_attachment AND e.id=source_email) OR f.id IN (
    SELECT d.attachment_id FROM private.purchase_payment_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
    UNION SELECT d.attachment_id FROM private.purchase_csv_documents d WHERE d.user_id=p_actor AND d.commitment_id=target
  ) ORDER BY f.id FOR SHARE OF f;
  IF action='register' THEN
    prepared:=private.prepare_purchase_payment(p_actor,source_email,source_attachment,p_command->>'binding',p_text);
    IF prepared->'command' IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'Sổ hoặc nội dung chứng từ đã thay đổi. Hãy mở lại bản xem trước.' USING ERRCODE='PT432';
    END IF;
    INSERT INTO private.purchase_payment_documents(user_id,commitment_id,kind,number,replaces,email_id,attachment_id,filename,binding,digest,source_at,lines)
    SELECT p_actor,target,prepared->>'kind',prepared->>'number',prepared->>'replaces',source_email,source_attachment,
      prepared#>>'{source,filename}',p_command->>'binding',p_command->>'digest',e.received_at,prepared->'lines'
    FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email RETURNING id INTO document_id;
    result:=jsonb_build_object('id',target,'documentId',document_id,'replayed',false);
  ELSE
    prepared:=private.purchase_payment_snapshot(p_actor,target);
    IF prepared->>'status' IS DISTINCT FROM 'ready' OR prepared->'command' IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'Bộ chứng từ chưa khớp hoặc đã thay đổi. Hãy xem lại trước khi duyệt.' USING ERRCODE='PT432';
    END IF;
    INSERT INTO private.purchase_payment_decisions(user_id,commitment_id,invoice_id,proof)
    VALUES(p_actor,target,(prepared#>>'{invoice,id}')::uuid,p_command->>'proof') RETURNING id INTO document_id;
    result:=jsonb_build_object('id',target,'decisionId',document_id,'replayed',false);
  END IF;
  INSERT INTO private.purchase_payment_requests VALUES(p_actor,p_key,sha256(convert_to(p_command::text,'UTF8')),result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.parse_purchase_payment(text),private.purchase_payment_document(uuid,uuid,jsonb),
  private.prepare_purchase_payment(uuid,uuid,uuid,text,text),private.purchase_payment_snapshot(uuid,uuid,jsonb),
  private.purchase_payment_receipt(uuid,uuid,jsonb),public.read_purchase_payment(uuid),
  public.ask_purchase_payment(text,jsonb),public.list_purchase_payment_attention(uuid[]),public.read_purchase_payment_receipt(uuid,jsonb),
  public.preview_purchase_payment(uuid,uuid,uuid,text,text),public.confirm_purchase_payment(uuid,uuid,jsonb,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_payment(uuid),public.ask_purchase_payment(text,jsonb),
  public.list_purchase_payment_attention(uuid[]),public.read_purchase_payment_receipt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_purchase_payment(uuid,uuid,uuid,text,text),public.confirm_purchase_payment(uuid,uuid,jsonb,text)
TO service_role;

COMMIT;
