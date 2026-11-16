BEGIN;

CREATE TABLE private.purchase_evidence_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES private.purchase_due_exceptions(origin_handoff) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES private.purchase_payment_documents(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL UNIQUE REFERENCES private.reply_drafts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX purchase_evidence_requests_case ON private.purchase_evidence_requests(case_id,id DESC);
ALTER TABLE private.purchase_evidence_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_evidence_requests FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.purchase_evidence_requests_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_purchase_evidence_case(p_actor uuid,p_draft uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ref text;
BEGIN
  SELECT h.reference INTO ref FROM private.purchase_evidence_requests r
    JOIN private.purchase_handoffs h ON h.id=r.case_id AND h.owner_id=r.owner_id
    WHERE r.draft_id=p_draft AND r.owner_id=p_actor;
  IF FOUND THEN PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || p_actor || ':' || ref,0)); END IF;
END;
$$;

CREATE FUNCTION private.purchase_evidence_request_allowed(p_actor uuid,p_draft uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM private.purchase_evidence_requests WHERE draft_id=p_draft AND owner_id=p_actor)
    OR EXISTS (
      SELECT 1 FROM private.purchase_evidence_requests r
      JOIN private.purchase_due_exceptions x ON x.origin_handoff=r.case_id AND x.owner_id=r.owner_id AND x.stage='buyer'
      WHERE r.draft_id=p_draft AND r.owner_id=p_actor AND private.purchase_supplement_owned_invoice(p_actor,r.case_id)=r.invoice_id
        AND NOT EXISTS (SELECT 1 FROM private.purchase_evidence_requests newer WHERE newer.case_id=r.case_id AND newer.owner_id=p_actor AND newer.id>r.id)
    )
$$;

CREATE FUNCTION public.read_purchase_evidence_request(p_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); item private.purchase_due_exceptions; latest private.purchase_evidence_requests;
  result jsonb;
BEGIN
  SELECT * INTO item FROM private.purchase_due_exceptions WHERE origin_handoff=p_case AND owner_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request unavailable' USING ERRCODE='PT404'; END IF;
  SELECT * INTO latest FROM private.purchase_evidence_requests WHERE case_id=p_case AND owner_id=actor ORDER BY id DESC LIMIT 1;
  SELECT jsonb_build_object('draftId',d.id,'sourceId',d.source_id,'state',view->>'state','sentId',view->'sentId',
    'replyId',r.id,'followupOn',d.followup_on,'tracking',d.tracking_at IS NOT NULL,
    'active',private.purchase_evidence_request_allowed(actor,d.id),
    'canContinue',r.id IS NOT NULL AND private.purchase_evidence_request_allowed(actor,d.id),
    'work',jsonb_build_object('id',d.id,'sourceId',d.source_id,'subject',d.subject,'account',a.email_address,
      'status',CASE WHEN d.tracking_at IS NOT NULL AND r.id IS NOT NULL THEN 'reply'
        WHEN d.tracking_at IS NOT NULL AND d.followup_on<=private.reply_followup_today() AND reminder.id IS NULL THEN 'due'
        WHEN d.tracking_at IS NOT NULL THEN 'waiting'
        WHEN view->>'state'='accepted' THEN 'sent'
        WHEN d.request_key IS NULL THEN 'draft' ELSE 'sending' END,
      'replyId',r.id,'quote',r.body_text,'followupOn',d.followup_on,'followupKey',d.followup_key,'reminderState',reminder.state))
  INTO result
  FROM private.reply_drafts d JOIN public.source_accounts a ON a.id=d.account_id AND a.user_id=actor
  CROSS JOIN LATERAL private.reply_draft_view(d) view
  LEFT JOIN private.mail_send_operations op ON op.user_id=actor AND op.account_id=d.account_id AND op.request_key=d.request_key
  LEFT JOIN private.mail_send_operations reminder ON reminder.user_id=actor AND reminder.account_id=d.account_id AND reminder.request_key=d.followup_key
  LEFT JOIN LATERAL private.reply_followup_match(d,op.id) r ON op.state='accepted'
  WHERE d.id=latest.draft_id AND d.user_id=actor;
  RETURN jsonb_build_object('caseId',p_case,'stage',item.stage,'canRequest',item.stage='buyer','request',result);
END;
$$;

CREATE FUNCTION public.prepare_purchase_evidence_request(p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  actor uuid:=auth.uid(); item private.purchase_due_exceptions; original_doc private.purchase_payment_documents;
  h private.purchase_handoffs; mail public.emails; prior private.reply_drafts; draft jsonb; linked private.purchase_evidence_requests;
  current_invoice uuid; response uuid; reason text; text_body text;
BEGIN
  SELECT * INTO item FROM private.purchase_due_exceptions WHERE origin_handoff=p_case AND owner_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request unavailable' USING ERRCODE='PT404'; END IF;
  SELECT * INTO STRICT h FROM private.purchase_handoffs WHERE id=p_case AND owner_id=actor;
  SELECT * INTO STRICT original_doc FROM private.purchase_payment_documents WHERE id=h.invoice_id AND user_id=actor;

  -- Lock the source account before source, case and draft, as the send/sync boundary does.
  PERFORM a.id FROM public.emails e JOIN public.source_accounts a ON a.id=e.source_account_id AND a.user_id=actor
    WHERE e.id=original_doc.email_id AND e.user_id=actor AND a.is_active FOR SHARE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nguồn yêu cầu không còn khả dụng.' USING ERRCODE='PT432'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commitment-case:' || actor || ':' || h.reference,0));
  SELECT * INTO STRICT item FROM private.purchase_due_exceptions WHERE origin_handoff=p_case AND owner_id=actor FOR UPDATE;
  IF item.stage<>'buyer' THEN RAISE EXCEPTION 'Hồ sơ hiện không chờ Mua hàng bổ sung.' USING ERRCODE='PT432'; END IF;
  current_invoice:=private.purchase_supplement_owned_invoice(actor,p_case);
  SELECT * INTO linked FROM private.purchase_evidence_requests WHERE case_id=p_case AND owner_id=actor ORDER BY id DESC LIMIT 1;
  IF linked.draft_id IS NOT NULL THEN
    SELECT * INTO STRICT prior FROM private.reply_drafts WHERE id=linked.draft_id AND user_id=actor;
    IF EXISTS (SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=actor AND op.account_id=prior.account_id
      AND op.request_key=prior.followup_key AND op.state IN ('dispatching','unknown')) THEN
      RAISE EXCEPTION 'Cần kiểm tra lượt gửi thư nhắc trước khi tạo yêu cầu tiếp.' USING ERRCODE='PT432';
    END IF;
    IF linked.invoice_id=current_invoice AND (prior.request_key IS NULL OR private.reply_draft_view(prior)->>'state'<>'accepted') THEN
      RETURN public.read_purchase_evidence_request(p_case);
    END IF;
    SELECT r.id INTO response FROM private.mail_send_operations op
      CROSS JOIN LATERAL private.reply_followup_match(prior,op.id) r
      WHERE op.user_id=actor AND op.account_id=prior.account_id AND op.request_key=prior.request_key AND op.state='accepted';
    IF response IS NULL AND linked.invoice_id=current_invoice THEN RETURN public.read_purchase_evidence_request(p_case); END IF;
  END IF;
  SELECT * INTO mail FROM public.emails WHERE id=COALESCE(response,
    (SELECT email_id FROM private.purchase_payment_documents WHERE id=current_invoice AND user_id=actor)) AND user_id=actor
    AND direction='inbound' AND NOT provider_deleted AND is_deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND OR mail.message_id IS NULL THEN
    RAISE EXCEPTION 'Cần đồng bộ email nguồn có định danh hội thoại.' USING ERRCODE='PT432';
  END IF;
  IF EXISTS (SELECT 1 FROM private.reply_drafts WHERE user_id=actor AND source_id=mail.id AND NOT completed) THEN
    RAISE EXCEPTION 'Email nguồn đã có bản nháp. Hãy xử lý bản nháp đó trước.' USING ERRCODE='PT432';
  END IF;
  SELECT e.reason INTO STRICT reason FROM private.purchase_due_exception_events e
    WHERE e.origin_handoff=p_case AND e.action IN ('request_evidence','return') ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1;
  text_body:=E'Chào anh/chị,\n\nNhờ anh/chị bổ sung chứng từ cho ' || h.reference || ', hóa đơn ' ||
    (SELECT number FROM private.purchase_payment_documents WHERE id=current_invoice AND user_id=actor) || E'.\n\n' || reason ||
    E'\n\nVui lòng gửi bản đính chính và nêu rõ hóa đơn được thay thế để bên tôi đối chiếu.\n\nCảm ơn anh/chị.';
  draft:=public.save_reply_draft(mail.id,NULL,NULL,private.reply_source_fingerprint(mail),
    COALESCE(NULLIF(mail.reply_to,''),mail.from_address),'',text_body);
  IF linked.draft_id IS NOT NULL THEN
    UPDATE private.reply_drafts SET tracking_at=NULL,followup_on=NULL,followup_key=NULL
      WHERE id=linked.draft_id AND user_id=actor AND NOT EXISTS (
        SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=actor AND op.account_id=prior.account_id
          AND op.request_key=prior.followup_key AND op.state IN ('dispatching','unknown'));
  END IF;
  INSERT INTO private.purchase_evidence_requests(case_id,owner_id,invoice_id,draft_id)
    VALUES(p_case,actor,current_invoice,(draft->>'id')::uuid);
  RETURN public.read_purchase_evidence_request(p_case);
END;
$$;

-- Prevent a prepared request or reminder from being sent after the invoice is handed on or closed.
ALTER FUNCTION public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb) RENAME TO begin_unlinked_reply_send;
ALTER FUNCTION public.begin_unlinked_reply_send(uuid,uuid,uuid,uuid,text,jsonb) SET SCHEMA private;
CREATE FUNCTION public.begin_reply_send(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR SHARE;
  PERFORM private.lock_purchase_evidence_case(p_user_id,p_draft);
  IF NOT private.purchase_evidence_request_allowed(p_user_id,p_draft) THEN RAISE SQLSTATE 'PT409'; END IF;
  RETURN private.begin_unlinked_reply_send(p_user_id,p_account_id,p_draft,p_key,p_hash,p_payload);
END;
$$;

ALTER FUNCTION public.begin_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) RENAME TO begin_unlinked_reply_followup;
ALTER FUNCTION public.begin_unlinked_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) SET SCHEMA private;
CREATE FUNCTION public.begin_reply_followup(p_user_id uuid,p_account_id uuid,p_draft uuid,p_key uuid,p_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
  PERFORM 1 FROM public.source_accounts WHERE user_id=p_user_id AND id=p_account_id AND is_active FOR UPDATE;
  PERFORM private.lock_purchase_evidence_case(p_user_id,p_draft);
  RETURN private.begin_unlinked_reply_followup(p_user_id,p_account_id,p_draft,p_key,p_hash,p_payload);
END;
$$;

ALTER FUNCTION private.reply_followup_preview(uuid,uuid) RENAME TO ordinary_reply_followup_preview;
CREATE FUNCTION private.reply_followup_preview(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE preview jsonb; request_body text;
BEGIN
  IF NOT private.purchase_evidence_request_allowed(p_actor,p_id) THEN RETURN NULL; END IF;
  preview:=private.ordinary_reply_followup_preview(p_actor,p_id);
  SELECT d.body INTO request_body FROM private.purchase_evidence_requests r
    JOIN private.reply_drafts d ON d.id=r.draft_id AND d.user_id=p_actor WHERE r.draft_id=p_id AND r.owner_id=p_actor;
  IF request_body IS NOT NULL AND preview IS NOT NULL THEN
    preview:=preview || jsonb_build_object('text',E'Nhắc lại yêu cầu bổ sung chứng từ:\n\n' || request_body);
  END IF;
  RETURN preview;
END;
$$;

CREATE FUNCTION private.stop_closed_purchase_requests()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.stage='closed' AND OLD.stage<>'closed' THEN
    UPDATE private.reply_drafts d SET tracking_at=NULL,
      completed=NOT EXISTS (SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=d.user_id
        AND op.account_id=d.account_id AND op.request_key IN (d.request_key,d.followup_key) AND op.state IN ('dispatching','unknown')),
      followup_on=CASE WHEN EXISTS (SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=d.user_id
        AND op.account_id=d.account_id AND op.request_key=d.followup_key AND op.state IN ('dispatching','unknown')) THEN d.followup_on END,
      followup_key=CASE WHEN EXISTS (SELECT 1 FROM private.mail_send_operations op WHERE op.user_id=d.user_id
        AND op.account_id=d.account_id AND op.request_key=d.followup_key AND op.state IN ('dispatching','unknown')) THEN d.followup_key END
    FROM private.purchase_evidence_requests r WHERE r.case_id=NEW.origin_handoff AND r.draft_id=d.id
      AND r.owner_id=NEW.owner_id AND d.user_id=NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stop_closed_purchase_requests AFTER UPDATE OF stage ON private.purchase_due_exceptions
FOR EACH ROW EXECUTE FUNCTION private.stop_closed_purchase_requests();

REVOKE ALL ON FUNCTION private.purchase_evidence_request_allowed(uuid,uuid),private.begin_unlinked_reply_send(uuid,uuid,uuid,uuid,text,jsonb),
  private.lock_purchase_evidence_case(uuid,uuid),private.begin_unlinked_reply_followup(uuid,uuid,uuid,uuid,text,jsonb),
  private.ordinary_reply_followup_preview(uuid,uuid),private.reply_followup_preview(uuid,uuid),
  private.stop_closed_purchase_requests(),public.read_purchase_evidence_request(uuid),public.prepare_purchase_evidence_request(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_reply_send(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.begin_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_reply_followup(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_purchase_evidence_request(uuid),public.prepare_purchase_evidence_request(uuid) TO authenticated;
COMMIT;
