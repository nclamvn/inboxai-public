BEGIN;

CREATE INDEX purchase_due_exceptions_focus_owner ON private.purchase_due_exceptions(owner_id,created_at DESC)
  WHERE stage<>'closed';
CREATE INDEX purchase_due_exceptions_focus_reviewer ON private.purchase_due_exceptions(reviewer_id,created_at DESC)
  WHERE stage='reviewer';

-- Read-only projection of the existing authority. A delegated reviewer has no
-- access to the buyer's mailbox IDs or ordinary Inbox links.
CREATE FUNCTION public.list_purchase_focus(p_accounts uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_accounts IS NULL OR cardinality(p_accounts)>50 THEN
    RAISE EXCEPTION 'Account filter unavailable' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH scoped AS (
      SELECT x.*, h.reference,
        x.owner_id=actor AS buyer,
        CASE WHEN x.reviewer_id=actor OR x.stage='buyer' OR NOT EXISTS (
          SELECT 1 FROM private.purchase_handoffs pending
          JOIN private.purchase_payment_documents current_invoice ON current_invoice.id=pending.invoice_id
            AND current_invoice.user_id=pending.owner_id AND current_invoice.commitment_id=pending.commitment_id
          WHERE pending.id=x.response_handoff AND pending.owner_id=x.owner_id AND pending.commitment_id=x.commitment_id
            AND pending.status='pending' AND NOT EXISTS (
              SELECT 1 FROM private.purchase_payment_documents successor
              WHERE successor.user_id=current_invoice.user_id AND successor.commitment_id=current_invoice.commitment_id
                AND successor.replaces=current_invoice.number
            )
        ) THEN 0 ELSE 1 END AS priority
      FROM private.purchase_due_exceptions x
      JOIN private.purchase_handoffs h ON h.id=x.origin_handoff AND h.owner_id=x.owner_id AND h.commitment_id=x.commitment_id
      JOIN private.purchase_payment_documents d
        ON d.id=h.invoice_id AND d.user_id=x.owner_id AND d.commitment_id=x.commitment_id
      WHERE (x.owner_id=actor AND x.stage<>'closed' AND (
        cardinality(p_accounts)=0 OR EXISTS (
          SELECT 1 FROM public.emails e JOIN public.source_accounts a
            ON a.user_id=actor AND a.id=e.source_account_id AND a.is_active
          WHERE e.user_id=actor AND e.id=d.email_id AND a.id=ANY(p_accounts)
        )))
        OR (x.reviewer_id=actor AND x.stage='reviewer' AND cardinality(p_accounts)=0)
    ), ranked AS (
      SELECT s.*,row_number() OVER per_order AS row_number,count(*) OVER (
        PARTITION BY s.owner_id,s.commitment_id) AS open_count
      FROM scoped s WINDOW per_order AS (
        PARTITION BY s.owner_id,s.commitment_id ORDER BY s.priority,s.created_at,s.origin_handoff
      )
    ), visible AS MATERIALIZED (
      SELECT * FROM ranked WHERE row_number=1 ORDER BY priority,created_at,origin_handoff LIMIT 4
    ), evidence AS MATERIALIZED (
      SELECT v.*, latest.id AS latest_id,latest.number AS latest_invoice,latest.document AS latest_document,
        delegated.snapshot,
        h.invoice_number AS handed_invoice,h.invoice_id AS handed_id,h.status AS handed_status,
        instruction.reason,instruction.actor_label
      FROM visible v
      LEFT JOIN LATERAL (
        SELECT d.id,d.number,private.purchase_payment_document(actor,d.id) AS document
        FROM private.purchase_payment_documents d
        WHERE v.buyer AND d.user_id=actor AND d.commitment_id=v.commitment_id AND d.installment_id=v.installment_id
        ORDER BY d.source_at DESC,d.id DESC LIMIT 1
      ) latest ON true
      LEFT JOIN private.purchase_handoffs h ON h.id=v.response_handoff AND h.owner_id=v.owner_id
        AND h.commitment_id=v.commitment_id AND (v.buyer OR h.reviewer_id=actor)
      LEFT JOIN LATERAL (
        SELECT CASE WHEN NOT v.buyer AND h.id IS NOT NULL
          THEN private.active_purchase_handoff(actor,h.id) END AS snapshot
      ) delegated ON true
      JOIN LATERAL (
        SELECT e.reason,e.actor_label FROM private.purchase_due_exception_events e
        WHERE e.origin_handoff=v.origin_handoff AND e.action IN ('request_evidence','return')
        ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1
      ) instruction ON true
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',e.origin_handoff,'reference',e.reference,
      'invoice',COALESCE(e.latest_invoice,e.handed_invoice),
      'task',CASE WHEN e.buyer THEN CASE WHEN e.stage='buyer' THEN 'supply'
        WHEN e.latest_id IS DISTINCT FROM e.handed_id OR e.handed_status<>'pending' THEN 'resupply' ELSE 'waiting' END
        WHEN e.snapshot IS NULL THEN 'stale' ELSE 'review' END,
      'reason',e.reason,'requestedBy',e.actor_label,'reviewer',e.reviewer_label,
      'openCount',e.open_count,
      'orderId',CASE WHEN e.buyer THEN e.commitment_id END,
      'invoiceId',CASE WHEN e.buyer THEN e.latest_id END,
      'emailId',CASE WHEN e.buyer THEN e.latest_document#>>'{evidence,emailId}' END,
      'handoffId',CASE WHEN NOT e.buyer THEN e.response_handoff END,
      'fileId',CASE WHEN NOT e.buyer THEN e.snapshot#>>'{invoice,evidence,attachmentId}' END,
      'filename',CASE WHEN e.buyer THEN e.latest_document#>>'{evidence,filename}'
        ELSE e.snapshot#>>'{invoice,evidence,filename}' END,
      'deadline',CASE WHEN e.buyer THEN e.latest_document#>>'{lines,0,paymentDue}'
        ELSE e.snapshot#>>'{invoice,lines,0,paymentDue}' END
    ) ORDER BY e.priority,e.created_at,e.origin_handoff),'[]'::jsonb)
    FROM evidence e
  );
END;
$$;
REVOKE ALL ON FUNCTION public.list_purchase_focus(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_purchase_focus(uuid[]) TO authenticated;

COMMIT;
