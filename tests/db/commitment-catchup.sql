BEGIN;
UPDATE public.registration_policy SET enabled = true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000091','catchup-owner@example.test'),
 ('00000000-0000-0000-0000-000000000092','catchup-foreign@example.test');

DO $$
DECLARE
  actor constant uuid := '00000000-0000-0000-0000-000000000091';
  outsider constant uuid := '00000000-0000-0000-0000-000000000092';
  source_id uuid := gen_random_uuid();
  old_token uuid;
  new_token uuid;
  evidence_hash constant text := repeat('1',64);
  result jsonb;
BEGIN
  IF has_table_privilege('authenticated','private.commitment_catchup','SELECT')
    OR has_function_privilege('anon','public.read_commitment_catchup(uuid[],uuid,uuid,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.pending_commitment_catchup(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.finish_commitment_catchup(uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.finish_commitment_catchup(uuid,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'queue privileges invalid'; END IF;

  BEGIN
    INSERT INTO public.emails(id,user_id,from_address,body_text) VALUES(source_id,actor,'catchup@example.test','rollback');
    RAISE SQLSTATE 'PT499';
  EXCEPTION WHEN SQLSTATE 'PT499' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM private.commitment_catchup WHERE email_id = source_id)
  THEN RAISE EXCEPTION 'queue row survived source rollback'; END IF;

  INSERT INTO public.emails(id,user_id,from_address,subject,body_text)
  VALUES(source_id,actor,'catchup@example.test','[PO-25] fixture','I will send the file.');
  SELECT token INTO STRICT old_token FROM private.commitment_catchup WHERE email_id = source_id;
  UPDATE public.emails SET body_text = 'I will send the signed file.' WHERE id = source_id;
  SELECT token INTO STRICT new_token FROM private.commitment_catchup WHERE email_id = source_id;
  IF old_token = new_token OR public.finish_commitment_catchup(actor, jsonb_build_array(
    jsonb_build_object('id',source_id,'token',old_token,'hashes',ARRAY[evidence_hash]))) <> 0
  THEN RAISE EXCEPTION 'stale analysis overwrote changed evidence'; END IF;
  result := jsonb_build_array(jsonb_build_object('id',source_id,'token',new_token,'hashes',ARRAY[evidence_hash]));
  IF public.finish_commitment_catchup(outsider,result) <> 0 OR public.finish_commitment_catchup(actor,result) <> 1
  THEN RAISE EXCEPTION 'analysis CAS or owner boundary invalid'; END IF;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF public.read_commitment_catchup('{}',NULL,source_id,false)#>>'{messages,0,catchupToken}' <> new_token::text
  THEN RAISE EXCEPTION 'could not load exact evidence'; END IF;
  PERFORM public.dismiss_commitment_catchup(source_id,new_token,evidence_hash);
  PERFORM public.dismiss_commitment_catchup(source_id,new_token,evidence_hash);
  UPDATE public.emails SET is_read = true, body_text = body_text WHERE id = source_id;
  IF EXISTS (SELECT 1 FROM private.commitment_catchup WHERE email_id = source_id
    AND (token <> new_token OR cardinality(dismissed) <> 1))
    OR jsonb_array_length(public.read_commitment_catchup('{}',NULL,source_id,false)->'messages') <> 0
  THEN RAISE EXCEPTION 'read flags or unchanged replay reset acknowledgment'; END IF;
  UPDATE public.emails SET provider_deleted = true WHERE id = source_id;
  IF EXISTS (SELECT 1 FROM private.commitment_catchup WHERE email_id = source_id)
  THEN RAISE EXCEPTION 'tombstone left an active review'; END IF;

  INSERT INTO public.emails(user_id,from_address,subject,body_text,received_at)
  SELECT actor,'catchup@example.test','Pending fixture','I will send a document.','2026-11-05'::timestamptz
  FROM generate_series(1,26);
  UPDATE private.commitment_catchup SET hashes = ARRAY[evidence_hash] WHERE user_id = actor;
  result := public.read_commitment_catchup('{}',NULL,NULL,false);
  IF jsonb_array_length(result->'messages') <> 24 OR
    jsonb_array_length(public.read_commitment_catchup('{}',(result->>'nextBeforeId')::uuid,NULL,false)->'messages') <> 2
  THEN RAISE EXCEPTION 'review pagination lost or duplicated messages with identical timestamps'; END IF;
END $$;
SELECT 'PASS: catch-up transaction, stale work, tenant grants, durable dismissal, tombstone and pagination';
ROLLBACK;
