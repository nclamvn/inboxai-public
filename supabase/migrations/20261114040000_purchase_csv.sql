BEGIN;

ALTER TABLE private.commitment_revisions DROP CONSTRAINT commitment_revisions_anchors_check;
ALTER TABLE private.commitment_revisions ADD CONSTRAINT commitment_revisions_anchors_check
  CHECK (jsonb_typeof(anchors)='array' AND jsonb_array_length(anchors) BETWEEN 1 AND
    CASE WHEN anchors @> '[{"field":"attachment"}]'::jsonb THEN 6 ELSE 3 END);

CREATE TABLE private.purchase_csv_documents (
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  version integer NOT NULL,
  email_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  filename text NOT NULL,
  binding text NOT NULL,
  digest text NOT NULL,
  number text NOT NULL,
  corrects text,
  source_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,commitment_id,version),
  UNIQUE (user_id,commitment_id,number),
  UNIQUE (user_id,attachment_id)
);
ALTER TABLE private.purchase_csv_documents ADD FOREIGN KEY (user_id,commitment_id,version)
  REFERENCES private.commitment_revisions(user_id,commitment_id,version) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE private.purchase_csv_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  version integer NOT NULL,
  line_code text NOT NULL,
  row_number integer NOT NULL,
  amount integer NOT NULL,
  quote text NOT NULL,
  UNIQUE (user_id,commitment_id,version,line_code),
  FOREIGN KEY (user_id,commitment_id,version)
    REFERENCES private.purchase_csv_documents(user_id,commitment_id,version) ON DELETE CASCADE
);
REVOKE ALL ON TABLE private.purchase_csv_documents,private.purchase_csv_rows FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.purchase_csv_binding(e public.emails,a public.attachments)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(private.commitment_detection_fingerprint(e),
    e.id,e.original_uid,e.sync_namespace,a.id,a.sync_part_key,a.filename,a.content_type,a.size,a.is_inline)::text,'UTF8')),'hex')
$$;

CREATE FUNCTION private.purchase_csv_input(actor uuid,p_email uuid,p_attachment uuid)
RETURNS TABLE(source public.emails, file public.attachments, binding text)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  selected record;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT e AS mail,a AS attachment,private.purchase_csv_binding(e,a) AS fingerprint INTO selected
  FROM public.emails e JOIN public.attachments a ON a.email_id=e.id
  JOIN public.source_accounts account ON account.id=e.source_account_id AND account.user_id=actor
  WHERE e.user_id=actor AND e.id=p_email AND a.id=p_attachment
    AND e.direction='inbound' AND e.sync_namespace='gmail' AND e.received_at IS NOT NULL
    AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE AND a.is_inline IS NOT TRUE AND a.sync_part_key IS NOT NULL
    AND account.is_active AND account.provider='gmail';
  IF NOT FOUND THEN RAISE EXCEPTION 'CSV source unavailable' USING ERRCODE='PT404'; END IF;
  source:=selected.mail;
  file:=selected.attachment;
  binding:=selected.fingerprint;
  IF (file).size>8192 THEN RAISE EXCEPTION 'CSV exceeds maximum size' USING ERRCODE='PT413'; END IF;
  IF (file).filename !~* '\.csv$' OR (file).filename ~ '[[:cntrl:]]' OR length((file).filename)>255
    OR lower(trim(split_part(COALESCE((file).content_type,''),';',1))) NOT IN
      ('text/csv','application/csv','application/octet-stream','application/vnd.ms-excel','text/plain')
  THEN RAISE EXCEPTION 'Tệp nguồn phải là CSV.' USING ERRCODE='PT431'; END IF;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.check_purchase_csv_source(p_email uuid,p_attachment uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT binding FROM private.purchase_csv_input(auth.uid(),p_email,p_attachment)
$$;

-- Each supported record fits on one physical line. Fields use a fixed vocabulary.
-- Quoted fields may wrap these values. Delimiters, embedded line breaks, formulas and free text are rejected.
CREATE FUNCTION private.parse_purchase_csv(p_text text)
RETURNS TABLE(row_number integer,reference text,document text,original text,code text,amount integer,unit text,quote text)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  input text;
  records text[];
  fields text[];
  idx integer;
  col integer;
BEGIN
  IF p_text IS NULL OR octet_length(p_text)>8192 THEN RAISE EXCEPTION 'CSV exceeds maximum size' USING ERRCODE='PT413'; END IF;
  input := regexp_replace(p_text,'^' || chr(65279),'');
  input := replace(input,E'\r\n',E'\n');
  IF right(input,1)=E'\n' THEN input:=left(input,-1); END IF;
  records:=string_to_array(input,E'\n');
  IF COALESCE(cardinality(records),0) NOT BETWEEN 2 AND 7 OR
    records[1] NOT IN ('po,document,corrects,line,quantity,unit','"po","document","corrects","line","quantity","unit"')
  THEN RAISE EXCEPTION 'Cần đúng cột po, document, corrects, line, quantity, unit và từ 1 đến 6 dòng dữ liệu.' USING ERRCODE='PT431'; END IF;

  FOR idx IN 2..cardinality(records) LOOP
    fields:=string_to_array(records[idx],',');
    IF cardinality(fields)<>6 THEN
      RAISE EXCEPTION 'Dòng % của CSV không đủ 6 cột.',idx USING ERRCODE='PT431';
    END IF;
    FOR col IN 1..6 LOOP
      IF fields[col] ~ '^"[^"]*"$' THEN fields[col]:=substring(fields[col] FROM 2 FOR length(fields[col])-2); END IF;
    END LOOP;
    IF fields[4] !~ '^[A-Z0-9]{1,12}$' THEN
      RAISE EXCEPTION 'Dòng % của CSV thiếu mã dòng hoặc mã dòng không hợp lệ.',idx USING ERRCODE='PT431';
    END IF;
    IF fields[1] !~ '^PO-[0-9]{1,12}$'
      OR NOT ((fields[2] ~ '^PN-[0-9]{1,12}$' AND fields[3]='') OR
        (fields[2] ~ '^DC-[0-9]{1,12}$' AND fields[3] ~ '^PN-[0-9]{1,12}$'))
      OR fields[5] !~ '^(0|[1-9][0-9]{0,6})$' OR (fields[3]='' AND fields[5]='0')
      OR fields[6] NOT IN ('bộ','chiếc','kiện','cuộn','hộp','cái')
    THEN RAISE EXCEPTION 'Dòng % của CSV có mã phiếu, số lượng hoặc đơn vị không hợp lệ.',idx USING ERRCODE='PT431'; END IF;
    row_number:=idx;
    reference:=fields[1];
    document:=fields[2];
    original:=NULLIF(fields[3],'');
    code:=fields[4];
    amount:=fields[5]::int;
    unit:=fields[6];
    quote:=records[idx];
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE FUNCTION private.purchase_csv_evidence(actor uuid,p_proof uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'emailId',d.email_id,'field','attachment','subject',e.subject,'receivedAt',e.received_at,
    'href',CASE WHEN e.id IS NOT NULL THEN '/inbox?email=' || e.id END,
    'availability',CASE WHEN e.id IS NULL OR a.id IS NULL THEN 'unavailable'
      WHEN d.binding IS DISTINCT FROM private.purchase_csv_binding(e,a) THEN 'changed' ELSE 'available' END,
    'quote',CASE WHEN a.id IS NOT NULL AND d.binding=private.purchase_csv_binding(e,a) THEN r.quote END,
    'attachment',jsonb_build_object('id',a.id,'proofId',r.id,'filename',d.filename,'row',r.row_number)
  )
  FROM private.purchase_csv_rows r JOIN private.purchase_csv_documents d USING(user_id,commitment_id,version)
  LEFT JOIN public.emails e ON e.user_id=actor AND e.id=d.email_id AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
  LEFT JOIN public.attachments a ON a.email_id=e.id AND a.id=d.attachment_id
  WHERE r.user_id=actor AND r.id=p_proof
    AND (e.id IS NULL OR EXISTS (SELECT 1 FROM public.source_accounts a
      WHERE a.user_id=actor AND a.id=e.source_account_id AND a.is_active AND a.provider='gmail'))
$$;

CREATE FUNCTION public.read_purchase_csv_proof(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  proof jsonb;
  document private.purchase_csv_documents;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  proof:=private.purchase_csv_evidence(actor,p_id);
  IF proof->>'availability' IS DISTINCT FROM 'available'
  THEN RAISE EXCEPTION 'CSV evidence unavailable' USING ERRCODE='PT404'; END IF;
  SELECT d.* INTO STRICT document FROM private.purchase_csv_rows r
    JOIN private.purchase_csv_documents d USING(user_id,commitment_id,version) WHERE r.user_id=actor AND r.id=p_id;
  RETURN jsonb_build_object('emailId',document.email_id,'attachmentId',document.attachment_id,
    'filename',document.filename,'digest',document.digest);
END;
$$;

ALTER FUNCTION private.purchase_order_sources(uuid,uuid) RENAME TO purchase_order_text_sources;
CREATE FUNCTION private.purchase_order_sources(p_actor uuid,p_id uuid)
RETURNS TABLE(operation text,line_code text,evidence jsonb,version int)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT t.operation,t.line_code,t.evidence,t.version FROM private.purchase_order_text_sources(p_actor,p_id) t
  UNION ALL
  SELECT CASE WHEN d.corrects IS NULL THEN 'receive' ELSE 'correct' END,r.line_code,
    private.purchase_csv_evidence(p_actor,r.id),r.version
  FROM private.purchase_csv_rows r JOIN private.purchase_csv_documents d USING(user_id,commitment_id,version)
  WHERE r.user_id=p_actor AND r.commitment_id=p_id
$$;

-- Reuse the ledger source reader. CSV anchors point to immutable row snapshots.
ALTER FUNCTION private.commitment_sources(uuid,jsonb) RENAME TO commitment_text_sources;
CREATE FUNCTION private.commitment_sources(p_user uuid,p_anchors jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_agg(CASE WHEN a.value->>'field'='attachment'
    THEN private.purchase_csv_evidence(p_user,(a.value->>'proofId')::uuid)
    ELSE private.commitment_text_sources(p_user,jsonb_build_array(a.value))->0 END ORDER BY a.ord)
  FROM jsonb_array_elements(p_anchors) WITH ORDINALITY AS a(value,ord)
$$;

CREATE FUNCTION private.prepare_purchase_csv(actor uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  selected record;
  source public.emails;
  file public.attachments;
  binding text;
  head private.commitments;
  before_state jsonb;
  state jsonb;
  ref text;
  document_number text;
  original_number text;
  line record;
  prior record;
  matched jsonb;
  line_index integer;
  total integer;
  originals jsonb:='[]';
  items jsonb:='[]';
  row_codes text[]:='{}';
  digest text:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
BEGIN
  SELECT * INTO STRICT selected FROM private.purchase_csv_input(actor,p_email,p_attachment);
  source:=selected.source;
  file:=selected.file;
  binding:=selected.binding;
  IF binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'Nguồn đã thay đổi. Hãy xem lại phiếu.' USING ERRCODE='PT432'; END IF;
  ref:=private.commitment_subject_reference(source.subject);
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=ref;
  IF NOT FOUND OR ref NOT LIKE 'PO-%' OR
    (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=ref)<>1
  THEN RAISE EXCEPTION 'Chưa xác định được một đơn mua hàng khớp mã trên tiêu đề email.' USING ERRCODE='PT431'; END IF;
  SELECT r.state INTO before_state FROM private.commitment_revisions r
  WHERE r.user_id=actor AND r.commitment_id=head.id AND r.version=head.version;
  IF NOT (before_state ? 'purchaseOrder') OR before_state->>'status'='cancelled'
    OR before_state#>>'{purchaseOrder,warehouse,accountId}' IS DISTINCT FROM source.source_account_id::text
    OR before_state#>>'{purchaseOrder,warehouse,sender}' IS DISTINCT FROM lower(btrim(source.from_address))
    OR (source.received_at >= (SELECT e.source_at FROM private.purchase_order_events e
        WHERE e.user_id=actor AND e.commitment_id=head.id AND e.operation='create')) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Email chưa khớp địa chỉ gửi và hộp thư kho đã thiết lập cho đơn.' USING ERRCODE='PT431'; END IF;
  IF EXISTS (SELECT 1 FROM private.purchase_order_sources(actor,head.id) p WHERE p.evidence->>'availability' IS DISTINCT FROM 'available')
  THEN RAISE EXCEPTION 'Chứng cứ đã duyệt thay đổi hoặc không còn khả dụng.' USING ERRCODE='PT432'; END IF;

  state:=(before_state-'review') || '{"status":"open"}'::jsonb;
  FOR line IN SELECT * FROM private.parse_purchase_csv(p_text) LOOP
    IF line.reference<>ref THEN
      RAISE EXCEPTION 'Dòng % của CSV có mã PO khác email nguồn.',line.row_number USING ERRCODE='PT431';
    END IF;
    IF document_number IS NULL THEN
      document_number:=line.document;
      original_number:=line.original;
      IF EXISTS (SELECT 1 FROM private.purchase_csv_documents d WHERE d.user_id=actor
        AND (d.attachment_id=p_attachment OR (d.commitment_id=head.id AND d.number=document_number)))
        OR EXISTS (SELECT 1 FROM private.purchase_order_events e
          WHERE e.user_id=actor AND e.commitment_id=head.id AND e.number=document_number)
      THEN RAISE EXCEPTION 'Phiếu này đã được ghi vào sổ.' USING ERRCODE='PT432'; END IF;
      IF original_number IS NULL AND before_state->>'status'<>'open'
      THEN RAISE EXCEPTION 'Đơn đã khép. Cần phiếu đính chính để sửa số thực nhận.' USING ERRCODE='PT432'; END IF;
    ELSIF document_number<>line.document OR original_number IS DISTINCT FROM line.original THEN
      RAISE EXCEPTION 'Mỗi tệp CSV phải chứa một phiếu và cùng một mã phiếu gốc.' USING ERRCODE='PT431';
    END IF;
    IF line.code=ANY(row_codes) THEN
      RAISE EXCEPTION 'Dòng % của CSV lặp mã dòng.',line.row_number USING ERRCODE='PT431';
    END IF;
    row_codes:=array_append(row_codes,line.code);
    SELECT l.value,(l.ord-1)::int INTO matched,line_index
    FROM jsonb_array_elements(state#>'{purchaseOrder,lines}') WITH ORDINALITY l(value,ord)
    WHERE l.value->>'code'=line.code;
    IF NOT FOUND OR matched->>'unit'<>line.unit THEN
      RAISE EXCEPTION 'Dòng % của CSV có mã dòng hoặc đơn vị không khớp PO.',line.row_number USING ERRCODE='PT431';
    END IF;
    total:=(matched->>'received')::int + line.amount;
    IF original_number IS NOT NULL THEN
      SELECT r.amount,d.source_at,private.purchase_csv_evidence(actor,r.id) AS evidence INTO prior
      FROM private.purchase_csv_documents d JOIN private.purchase_csv_rows r USING(user_id,commitment_id,version)
      WHERE d.user_id=actor AND d.commitment_id=head.id AND (d.number=original_number OR d.corrects=original_number)
        AND r.line_code=line.code ORDER BY d.version DESC LIMIT 1;
      IF NOT FOUND OR prior.evidence->>'availability' IS DISTINCT FROM 'available' OR prior.source_at>=source.received_at
        OR NOT EXISTS (SELECT 1 FROM private.purchase_csv_documents d JOIN private.purchase_csv_rows r USING(user_id,commitment_id,version)
          WHERE d.user_id=actor AND d.commitment_id=head.id AND d.number=original_number AND r.line_code=line.code)
      THEN RAISE EXCEPTION 'Dòng % chưa có phiếu CSV gốc khả dụng hoặc đính chính đã cũ.',line.row_number USING ERRCODE='PT431'; END IF;
      IF prior.amount=line.amount THEN
        RAISE EXCEPTION 'Dòng % giữ nguyên số lượng. Bỏ dòng đó khỏi bản đính chính.',line.row_number USING ERRCODE='PT431';
      END IF;
      total:=total-prior.amount;
      originals:=originals || jsonb_build_array(prior.evidence);
    END IF;
    IF total NOT BETWEEN 0 AND 9999999 THEN
      RAISE EXCEPTION 'Tổng thực nhận của dòng % vượt phạm vi hỗ trợ.',line.row_number USING ERRCODE='PT431';
    END IF;
    state:=jsonb_set(state,ARRAY['purchaseOrder','lines',line_index::text,'received'],to_jsonb(total));
    items:=items || jsonb_build_array(jsonb_build_object('row',line.row_number,'code',line.code,'quantity',line.amount,'unit',line.unit,'quote',line.quote));
  END LOOP;
  IF (SELECT count(*) FROM private.purchase_order_sources(actor,head.id)) + jsonb_array_length(items)>120 THEN
    RAISE EXCEPTION 'Đơn đã đạt giới hạn số dòng chứng cứ.' USING ERRCODE='PT431';
  END IF;
  RETURN jsonb_build_object('emailId',source.id,'attachmentId',file.id,'filename',file.filename,
    'subject',source.subject,'sender',source.from_address,
    'account',(SELECT a.email_address FROM public.source_accounts a WHERE a.user_id=actor AND a.id=source.source_account_id),
    'reference',ref,'document',document_number,'original',original_number,'originals',originals,
    'state',state,'rows',items,'before',before_state#>'{purchaseOrder,lines}','after',state#>'{purchaseOrder,lines}',
    'approval',jsonb_build_object('id',head.id,'version',head.version,'emailId',source.id,'attachmentId',file.id,'binding',binding,'digest',digest));
END;
$$;

CREATE FUNCTION public.preview_purchase_csv(p_actor uuid,p_email uuid,p_attachment uuid,p_binding text,p_text text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.prepare_purchase_csv(p_actor,p_email,p_attachment,p_binding,p_text)-'state'
$$;

CREATE FUNCTION private.purchase_csv_receipt(actor uuid,p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  stored private.commitment_receiving_commands;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO stored FROM private.commitment_receiving_commands WHERE user_id=actor AND request_key=p_key;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_key) THEN
      RAISE EXCEPTION 'CSV approval key already used' USING ERRCODE='PT409';
    END IF;
    RETURN '{"replayed":false}'::jsonb;
  END IF;
  IF stored.command_hash IS DISTINCT FROM sha256(convert_to(jsonb_build_array('purchase_csv',p_command)::text,'UTF8'))
  THEN RAISE EXCEPTION 'CSV approval key already used' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',stored.commitment_id,'version',stored.version,'replayed',true);
END;
$$;

CREATE FUNCTION public.read_purchase_csv_receipt(p_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.purchase_csv_receipt(auth.uid(),p_key,p_command)
$$;

CREATE FUNCTION public.confirm_purchase_csv(p_actor uuid,p_key uuid,p_command jsonb,p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  source_email_id uuid:=(p_command->>'emailId')::uuid;
  source_attachment_id uuid:=(p_command->>'attachmentId')::uuid;
  target_id uuid:=(p_command->>'id')::uuid;
  expected integer:=(p_command->>'version')::integer;
  head private.commitments;
  mail public.emails;
  result jsonb;
  prepared jsonb;
  item jsonb;
  proof_id uuid;
  csv_anchors jsonb:='[]';
  new_state jsonb;
  next_version integer;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR target_id IS NULL OR expected IS NULL OR expected<1 OR source_email_id IS NULL OR source_attachment_id IS NULL THEN
    RAISE EXCEPTION 'Invalid CSV approval' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-detection:' || p_actor || ':' || source_email_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || p_actor || ':' || p_key,0));
  result:=private.purchase_csv_receipt(p_actor,p_key,p_command);
  IF result->>'replayed'='true' THEN RETURN result; END IF;

  SELECT e.* INTO mail FROM public.emails e WHERE e.user_id=p_actor AND e.id=source_email_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CSV source unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || private.commitment_subject_reference(mail.subject),0));
  SELECT c.* INTO head FROM private.commitments c WHERE c.user_id=p_actor AND c.id=target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  IF head.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Sổ đã đổi. Hãy xem lại phiếu.' USING ERRCODE='PT432'; END IF;
  PERFORM e.id FROM public.emails e WHERE e.user_id=p_actor AND e.id IN (
    SELECT (p.evidence->>'emailId')::uuid FROM private.purchase_order_sources(p_actor,target_id) p)
    ORDER BY e.id FOR SHARE;
  PERFORM a.id FROM public.attachments a JOIN public.emails e ON e.id=a.email_id AND e.user_id=p_actor
  WHERE (a.id=source_attachment_id AND a.email_id=source_email_id) OR a.id IN (
    SELECT d.attachment_id FROM private.purchase_csv_documents d WHERE d.user_id=p_actor AND d.commitment_id=target_id)
  ORDER BY a.id FOR SHARE OF a;
  PERFORM a.id FROM public.source_accounts a WHERE a.user_id=p_actor AND a.id=mail.source_account_id FOR SHARE;
  prepared:=private.prepare_purchase_csv(p_actor,source_email_id,source_attachment_id,p_command->>'binding',p_text);
  IF prepared->'approval' IS DISTINCT FROM p_command THEN
    RAISE EXCEPTION 'Phiếu đã đổi. Hãy xem lại trước khi duyệt.' USING ERRCODE='PT432';
  END IF;

  new_state:=private.commitment_state(prepared->'state');
  next_version:=expected+1;
  INSERT INTO private.purchase_csv_documents(user_id,commitment_id,version,email_id,attachment_id,filename,binding,digest,number,corrects,source_at)
  VALUES(p_actor,target_id,next_version,source_email_id,source_attachment_id,prepared->>'filename',p_command->>'binding',p_command->>'digest',
    prepared->>'document',prepared->>'original',mail.received_at);
  FOR item IN SELECT value FROM jsonb_array_elements(prepared->'rows') LOOP
    INSERT INTO private.purchase_csv_rows(user_id,commitment_id,version,line_code,row_number,amount,quote)
    VALUES(p_actor,target_id,next_version,item->>'code',(item->>'row')::int,(item->>'quantity')::int,item->>'quote') RETURNING id INTO proof_id;
    csv_anchors:=csv_anchors || jsonb_build_array(jsonb_build_object('emailId',source_email_id,'field','attachment','proofId',proof_id));
  END LOOP;
  INSERT INTO private.commitment_revisions (user_id,commitment_id,version,request_key,request_hash,kind,state,changed_fields,anchors)
  SELECT p_actor,target_id,next_version,p_key,sha256(convert_to(jsonb_build_array('purchase_csv',p_command)::text,'UTF8')),
    'revised',new_state,ARRAY(SELECT k.key FROM jsonb_each(new_state) k WHERE r.state->k.key IS DISTINCT FROM k.value),csv_anchors
  FROM private.commitment_revisions r WHERE r.user_id=p_actor AND r.commitment_id=target_id AND r.version=expected;
  UPDATE private.commitments SET version=next_version WHERE user_id=p_actor AND id=target_id;
  INSERT INTO private.commitment_receiving_commands VALUES(p_actor,target_id,next_version,p_key,
    sha256(convert_to(jsonb_build_array('purchase_csv',p_command)::text,'UTF8')));
  RETURN jsonb_build_object('id',target_id,'version',next_version,'replayed',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ask_purchase_order(p_reference text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  target uuid;
  state jsonb;
  sources jsonb;
  source_count integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_reference,'') !~ '^PO-[0-9]{1,12}$' THEN RETURN '{}'::jsonb; END IF;
  PERFORM private.ask_validate_scope(actor,p_filters);
  SELECT c.id,r.state INTO target,state FROM private.commitments c JOIN private.commitment_revisions r
    ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
  WHERE c.user_id=actor AND c.detection_reference=p_reference AND r.state ? 'purchaseOrder';
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  IF (SELECT count(*) FROM private.commitments c WHERE c.user_id=actor AND c.detection_reference=p_reference)<>1
  THEN RETURN '{"unavailable":true}'::jsonb; END IF;
  SELECT count(*),jsonb_agg(w.evidence || jsonb_build_object('line',w.line_code,'operation',w.operation,
    'version',private.ask_answer_version(e),'sender',e.from_address,'account',a.email_address,'at',e.received_at)
    ORDER BY w.version,w.line_code) INTO source_count,sources
  FROM private.purchase_order_sources(actor,target) w
  JOIN public.emails e ON e.user_id=actor AND e.id=(w.evidence->>'emailId')::uuid
  LEFT JOIN public.source_accounts a ON a.user_id=actor AND a.id=e.source_account_id
  WHERE w.evidence->>'availability'='available' AND private.ask_scope(e,actor,p_filters);
  IF source_count>16 OR source_count<>(SELECT count(*) FROM private.purchase_order_sources(actor,target))
  THEN RETURN '{"unavailable":true}'::jsonb; END IF;
  RETURN jsonb_build_object('commitmentId',target,'status',state->>'status','lines',state#>'{purchaseOrder,lines}','sources',sources);
END;
$$;

CREATE OR REPLACE FUNCTION private.commitment_reminder_snapshot(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH purchase AS (
    SELECT c.version,r.state,r.state->'purchaseOrder' AS po
    FROM private.commitments c JOIN private.commitment_revisions r
      ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
    WHERE c.user_id=p_actor AND c.id=p_id AND r.state ? 'purchaseOrder'
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM purchase) THEN (
    SELECT jsonb_build_object(
      'version',p.version,'accountId',a.id,'fromAddress',a.email_address,
      'fromName',COALESCE(NULLIF(a.display_name,''),split_part(a.email_address,'@',1)),
      'to',lower(btrim(p.state->>'ownerEmail')),
      'subject',CASE WHEN e.subject ~* '^re:' THEN btrim(left(e.subject,500))
        ELSE 'Re: ' || btrim(left(e.subject,496)) END,
      'text',format(E'Chào anh/chị,\n\nKho còn thiếu hàng cho %s:\n%s\n\nAnh/chị vui lòng xác nhận lịch giao phần còn thiếu.\n\nCảm ơn anh/chị.',
        p.po->>'reference',shortage.contents),
      'source',origin.evidence,
      'sourceFingerprint',private.commitment_detection_fingerprint(e),
      'messageId',CASE WHEN length(e.message_id)<=998 AND e.message_id ~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$' THEN e.message_id END,
      'mailIdentity',jsonb_build_array(e.sync_namespace,e.original_uid,a.auth_type),
      'purchaseEvidence',(SELECT jsonb_agg(w.evidence ORDER BY w.version,w.line_code) FROM private.purchase_order_sources(p_actor,p_id) w)
    )
    FROM purchase p
    CROSS JOIN LATERAL (
      SELECT w.evidence FROM private.purchase_order_sources(p_actor,p_id) w WHERE w.operation IN ('create','ship')
      ORDER BY (w.evidence->>'receivedAt')::timestamptz DESC,w.version DESC LIMIT 1
    ) origin
    JOIN public.emails e ON e.user_id=p_actor AND e.id=(origin.evidence->>'emailId')::uuid
    JOIN public.source_accounts a ON a.user_id=p_actor AND a.id=e.source_account_id AND a.is_active
    CROSS JOIN LATERAL (
      SELECT string_agg(format('Dòng %s thiếu %s %s.', l->>'code',
        (l->>'ordered')::int-(l->>'received')::int,l->>'unit'), E'\n' ORDER BY l->>'code') AS contents
      FROM jsonb_array_elements(p.po->'lines') l
      WHERE (l->>'received')::int<(l->>'ordered')::int AND (l->>'reported')::int>(l->>'received')::int
    ) shortage
    WHERE p.state->>'status'='open' AND shortage.contents IS NOT NULL
      AND private.commitment_responsibility(p.state->>'ownerEmail',private.commitment_owned_addresses(p_actor))='waiting'
      AND e.subject IS NOT NULL AND e.subject !~ '[[:cntrl:]]'
      AND EXISTS (SELECT 1 FROM private.purchase_order_sources(p_actor,p_id) w
        WHERE w.operation IN ('receive','correct'))
      AND NOT EXISTS (SELECT 1 FROM private.purchase_order_sources(p_actor,p_id) w
        WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
      AND NOT EXISTS (
        SELECT 1 FROM public.emails newer WHERE newer.user_id=p_actor AND newer.direction='inbound'
          AND NOT newer.provider_deleted AND newer.is_deleted IS NOT TRUE
          AND newer.received_at>e.received_at AND lower(btrim(newer.from_address))=p.state->>'ownerEmail'
          AND private.commitment_subject_reference(newer.subject)=p.po->>'reference'
      )
      AND NOT EXISTS (
        SELECT 1 FROM private.commitment_revisions r JOIN private.mail_send_operations s ON s.user_id=r.user_id
          AND s.request_key=private.commitment_reminder_key(p_actor,p_id,r.version)
        WHERE r.user_id=p_actor AND r.commitment_id=p_id AND r.version<>p.version AND s.state IN ('dispatching','unknown'))
  ) ELSE private.single_line_reminder_snapshot(p_actor,p_id) END
$$;

CREATE OR REPLACE FUNCTION public.list_commitment_attention(p_accounts uuid[],p_reply_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  addresses text[];
  now_at timestamptz := statement_timestamp();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR p_reply_ids IS NULL OR cardinality(p_accounts)>50 OR cardinality(p_reply_ids)>24
  THEN RAISE EXCEPTION 'Invalid commitment attention scope' USING ERRCODE='22023'; END IF;
  addresses := private.commitment_owned_addresses(actor);
  RETURN (
    WITH current AS MATERIALIZED (
      SELECT c.id,c.version,c.detection_reference,r.state,r.anchors,r.recorded_at,
        private.commitment_responsibility(r.state->>'ownerEmail',addresses) AS responsibility
      FROM private.commitments c JOIN private.commitment_revisions r
        ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
      WHERE c.user_id=actor AND (r.state->>'status'='open' OR (r.state->>'status'='completed' AND r.state ?| ARRAY['receiving','purchaseOrder']))
    ), ordered AS (
      SELECT c.*, CASE WHEN c.id=ANY(p_reply_ids) THEN 'reply'
        WHEN c.state->>'status'<>'open' THEN NULL
        WHEN c.state ? 'purchaseOrder' AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.state#>'{purchaseOrder,lines}') l
          WHERE (l->>'received')::int>(l->>'ordered')::int OR ((l->>'reported')::int>(l->>'received')::int
            AND EXISTS (SELECT 1 FROM private.purchase_order_sources(actor,c.id) w
              WHERE w.operation IN ('receive','correct')))) THEN 'purchase_discrepancy'
        WHEN c.state ? 'purchaseOrder' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.state#>'{purchaseOrder,lines}') l
          WHERE l->>'ordered' IS DISTINCT FROM l->>'reported' OR l->>'ordered' IS DISTINCT FROM l->>'received')
          THEN 'receiving_ready'
        WHEN c.state#>>'{receiving,received}'=c.state#>>'{delivery,ordered}'
          AND c.state#>>'{delivery,delivered}'=c.state#>>'{delivery,ordered}'
          AND c.state->>'review' IS NULL THEN 'receiving_ready'
        WHEN ((c.state#>>'{receiving,received}')::int < (c.state#>>'{delivery,delivered}')::int AND (
          (c.state#>>'{receiving,received}')::int > 0 OR EXISTS (
            SELECT 1 FROM private.commitment_warehouse_corrections w WHERE w.user_id=actor AND w.commitment_id=c.id)
        )) THEN 'receiving'
        WHEN c.state->>'review' IS NOT NULL THEN 'review'
        ELSE private.commitment_due_attention(c.state,now_at) END AS reason
      FROM current c
    ), candidates AS (
      SELECT *, CASE reason WHEN 'reply' THEN 1 WHEN 'receiving' THEN 2 WHEN 'purchase_discrepancy' THEN 2 WHEN 'receiving_ready' THEN 3 WHEN 'review' THEN 4 WHEN 'overdue' THEN 5 ELSE 6 END AS bucket,
        COALESCE((state->>'dueAt')::timestamptz,
          ((state->>'dueOn')::date + time '23:59:59') AT TIME ZONE INTERVAL '+07:00') AS due
      FROM ordered WHERE reason IS NOT NULL
    ), visible AS (
      SELECT c.*, source.evidence,
        operation.state AS reminder_state
      FROM candidates c
      CROSS JOIN LATERAL (
        SELECT anchor.value AS evidence
        FROM jsonb_array_elements(private.commitment_sources(actor,c.anchors)) WITH ORDINALITY AS anchor(value,position)
        JOIN public.emails e ON e.user_id=actor AND e.id=(anchor.value->>'emailId')::uuid
        WHERE anchor.value->>'availability'='available'
          AND (cardinality(p_accounts)=0 OR e.source_account_id=ANY(p_accounts))
        ORDER BY anchor.position LIMIT 1
      ) source
      LEFT JOIN private.mail_send_operations operation
        ON operation.user_id=actor AND operation.request_key=private.commitment_reminder_key(actor,c.id,c.version)
      ORDER BY c.bucket,c.due NULLS LAST,c.recorded_at DESC,c.id LIMIT 4
    )
    SELECT jsonb_build_object(
      'tracking', EXISTS (SELECT 1 FROM current WHERE detection_reference IS NOT NULL),
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'version',v.version,'state',v.state,'reason',v.reason,'responsibility',v.responsibility,
        'group',private.commitment_board_group(v.state,v.responsibility,now_at),
        'source',v.evidence,'reminderState',v.reminder_state
      ) ORDER BY v.bucket,v.due NULLS LAST,v.recorded_at DESC,v.id) FROM visible v),'[]'::jsonb))
  );
END
$$;



-- A text approval must not post a second copy of a document already approved from CSV.
CREATE FUNCTION private.reject_text_duplicate_csv()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM private.purchase_csv_documents d WHERE d.user_id=NEW.user_id
    AND d.commitment_id=NEW.commitment_id AND d.number=NEW.number)
  THEN RAISE EXCEPTION 'Phiếu này đã được ghi vào sổ.' USING ERRCODE='PT432'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_duplicate_text_purchase_document BEFORE INSERT ON private.purchase_order_events
FOR EACH ROW EXECUTE FUNCTION private.reject_text_duplicate_csv();

-- Reuse the existing close transaction and its replay hash. It already verifies all sources.
-- The close revision points to original PO text, while the detail shows the complete CSV history.
ALTER FUNCTION public.confirm_purchase_order(uuid,jsonb) RENAME TO confirm_purchase_order_without_csv_close;
ALTER FUNCTION public.confirm_purchase_order_without_csv_close(uuid,jsonb) SET SCHEMA private;
CREATE FUNCTION public.confirm_purchase_order(p_request_key uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  actor uuid:=auth.uid();
  target uuid;
  expected integer;
  ref text;
  state jsonb;
  result jsonb;
  replay private.commitment_receiving_commands;
  hash bytea;
  order_source jsonb;
BEGIN
  IF p_command->>'operation' IS DISTINCT FROM 'close' THEN
    RETURN private.confirm_purchase_order_without_csv_close(p_request_key,p_command);
  END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  target:=(p_command->>'id')::uuid;
  expected:=(p_command->>'version')::int;
  IF p_request_key IS NULL OR target IS NULL OR expected IS NULL OR p_command - ARRAY['operation','id','version']<>'{}'::jsonb
  THEN RAISE EXCEPTION 'Invalid purchase close' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment:' || actor || ':' || p_request_key,0));
  hash:=sha256(convert_to(jsonb_build_array('purchase',p_command)::text,'UTF8'));
  SELECT * INTO replay FROM private.commitment_receiving_commands WHERE user_id=actor AND request_key=p_request_key;
  IF FOUND THEN
    IF replay.command_hash<>hash THEN RAISE EXCEPTION 'Purchase request reused' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('id',replay.commitment_id,'version',replay.version,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM private.commitment_revisions WHERE user_id=actor AND request_key=p_request_key)
  THEN RAISE EXCEPTION 'Purchase request reused' USING ERRCODE='PT409'; END IF;
  SELECT detection_reference INTO ref FROM private.commitments WHERE user_id=actor AND id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || ref,0));
  IF NOT EXISTS (SELECT 1 FROM private.purchase_csv_documents WHERE user_id=actor AND commitment_id=target) THEN
    RETURN private.confirm_purchase_order_without_csv_close(p_request_key,p_command);
  END IF;
  SELECT r.state INTO state FROM private.commitments c JOIN private.commitment_revisions r
    ON (r.user_id,r.commitment_id,r.version)=(c.user_id,c.id,c.version)
    WHERE c.user_id=actor AND c.id=target AND c.version=expected FOR UPDATE OF c;
  IF NOT FOUND OR state->>'status'<>'open' OR (SELECT count(*) FROM private.commitments WHERE user_id=actor AND detection_reference=ref)<>1
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(state#>'{purchaseOrder,lines}') l
      WHERE l->>'ordered' IS DISTINCT FROM l->>'received' OR l->>'ordered' IS DISTINCT FROM l->>'reported')
  THEN RAISE EXCEPTION 'Every purchase line must reconcile' USING ERRCODE='PT409'; END IF;
  PERFORM e.id FROM public.emails e WHERE e.user_id=actor AND e.id IN (
    SELECT (w.evidence->>'emailId')::uuid FROM private.purchase_order_sources(actor,target) w) ORDER BY e.id FOR SHARE;
  PERFORM a.id FROM public.attachments a JOIN private.purchase_csv_documents d ON d.attachment_id=a.id AND d.email_id=a.email_id
    WHERE d.user_id=actor AND d.commitment_id=target ORDER BY a.id FOR SHARE OF a;
  IF EXISTS (SELECT 1 FROM private.purchase_order_sources(actor,target) w WHERE w.evidence->>'availability' IS DISTINCT FROM 'available')
  THEN RAISE EXCEPTION 'Purchase evidence changed' USING ERRCODE='PT409'; END IF;
  SELECT w.evidence INTO order_source FROM private.purchase_order_text_sources(actor,target) w WHERE w.operation='create';
  result:=private.save_commitment(p_request_key,target,expected,NULL,(state-'review') || '{"status":"completed"}',NULL,
    jsonb_build_array(jsonb_build_object('emailId',order_source->>'emailId','field','body_text','quote',order_source->>'quote')));
  INSERT INTO private.commitment_receiving_commands VALUES(actor,target,(result->>'version')::int,p_request_key,hash);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_csv_binding(public.emails,public.attachments),private.purchase_csv_input(uuid,uuid,uuid),
  private.parse_purchase_csv(text),private.purchase_csv_evidence(uuid,uuid),
  private.purchase_order_sources(uuid,uuid),private.commitment_sources(uuid,jsonb),private.reject_text_duplicate_csv(),
  private.prepare_purchase_csv(uuid,uuid,uuid,text,text),private.purchase_csv_receipt(uuid,uuid,jsonb),
  private.confirm_purchase_order_without_csv_close(uuid,jsonb),
  public.confirm_purchase_order(uuid,jsonb),public.check_purchase_csv_source(uuid,uuid),
  public.preview_purchase_csv(uuid,uuid,uuid,text,text),public.confirm_purchase_csv(uuid,uuid,jsonb,text),
  public.read_purchase_csv_proof(uuid),public.read_purchase_csv_receipt(uuid,jsonb)
FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.confirm_purchase_order(uuid,jsonb),public.check_purchase_csv_source(uuid,uuid),
  public.read_purchase_csv_proof(uuid),public.read_purchase_csv_receipt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_purchase_csv(uuid,uuid,uuid,text,text),
  public.confirm_purchase_csv(uuid,uuid,jsonb,text) TO service_role;

COMMIT;
