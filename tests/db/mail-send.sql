BEGIN;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.begin_mail_send(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('a',64));
    RAISE EXCEPTION 'anonymous send claim allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  owner_id uuid := '90000000-0000-0000-0000-000000000001';
  account_id uuid := '91000000-0000-0000-0000-000000000001';
  request_key uuid := gen_random_uuid();
  receipt jsonb;
  operation_id uuid;
  mirrored_email uuid := gen_random_uuid();
  draft jsonb := '{"from":{"name":"Fixture","address":"legacy-vault@example.test"},"to":["recipient@example.test"],"cc":[],"bcc":[],"subject":"Fixture","text":"Synthetic"}';
BEGIN
  IF has_table_privilege('authenticated','private.mail_send_operations','SELECT')
     OR has_table_privilege('service_role','private.mail_send_operations','INSERT') THEN
    RAISE EXCEPTION 'send ledger grants too broad';
  END IF;

  receipt := public.begin_mail_send(owner_id,account_id,request_key,repeat('a',64),draft);
  operation_id := (receipt->>'id')::uuid;
  IF NOT (receipt->>'claimed')::boolean THEN RAISE EXCEPTION 'initial claim failed'; END IF;
  IF (public.begin_mail_send(owner_id,account_id,request_key,repeat('a',64),draft)->>'claimed')::boolean THEN
    RAISE EXCEPTION 'replay won dispatch';
  END IF;
  BEGIN
    PERFORM public.begin_mail_send(owner_id,account_id,request_key,repeat('b',64),draft);
    RAISE EXCEPTION 'changed digest was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  -- A provider response with no usable ID cannot publish or finalize a Gmail receipt.
  BEGIN
    PERFORM public.finish_mail_send(owner_id,account_id,operation_id,'accepted','invalid provider id');
    RAISE EXCEPTION 'invalid provider ID accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (public.begin_mail_send(owner_id,account_id,request_key,repeat('a',64))->>'state') <> 'dispatching' THEN
    RAISE EXCEPTION 'invalid finish changed durable state';
  END IF;

  -- Simulate Gmail sync seeing Sent first. Send finalization merges by provider identity.
  INSERT INTO public.emails(id,user_id,source_account_id,sync_namespace,original_uid,from_address,subject,direction,user_notes)
    VALUES(mirrored_email,owner_id,account_id,'gmail','fixture-message','legacy-vault@example.test','Fixture','outbound','Keep annotation');
  receipt := public.finish_mail_send(owner_id,account_id,operation_id,'accepted','fixture-message');
  IF receipt->>'state'<>'accepted' OR NOT EXISTS(
    SELECT 1 FROM public.emails WHERE id=mirrored_email AND send_status='sent' AND user_notes='Keep annotation'
  ) THEN RAISE EXCEPTION 'receipt did not merge into existing Gmail mirror'; END IF;

  -- A late failure response cannot downgrade an already confirmed send.
  receipt := public.finish_mail_send(owner_id,account_id,operation_id,'unknown');
  IF receipt->>'state'<>'accepted' THEN RAISE EXCEPTION 'confirmed receipt regressed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: send grants, replay conflict, invalid receipt rollback and Gmail mirror merge' AS result;
