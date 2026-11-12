DO $$
BEGIN
  IF private.commitment_due_attention('{"status":"open","dueOn":"2026-12-02"}','2026-12-02 16:59:59+00') IS DISTINCT FROM 'today'
    OR private.commitment_due_attention('{"status":"open","dueOn":"2026-12-02"}','2026-12-02 17:00:00+00') IS DISTINCT FROM 'overdue'
    OR private.commitment_due_attention('{"status":"open","dueAt":"2026-12-03T04:00:00Z"}','2026-12-02 17:00:00+00') IS DISTINCT FROM 'today'
    OR private.commitment_due_attention('{"status":"open","dueAt":"2026-12-03T04:00:00Z"}','2026-12-03 04:01:00+00') IS DISTINCT FROM 'overdue'
    OR private.commitment_due_attention('{"status":"open","dueOn":"2026-12-04"}','2026-12-02 17:00:00+00') IS NOT NULL
    OR private.commitment_due_attention('{"status":"completed","dueOn":"2026-12-03"}','2026-12-02 17:00:00+00') IS NOT NULL
  THEN RAISE EXCEPTION 'daily attention date boundary mismatch'; END IF;

  IF has_function_privilege('anon','public.list_commitment_attention(uuid[],uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.read_commitment_reminder(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.begin_commitment_reminder(uuid,uuid,uuid,integer,text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.begin_commitment_reminder(uuid,uuid,uuid,integer,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','private.commitment_reminder_snapshot(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'reminder grants invalid'; END IF;
END $$;
SELECT 'PASS: attention uses the UTC+7 date boundary and only service role can reserve a reminder' AS result;
