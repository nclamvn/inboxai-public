BEGIN;

CREATE TABLE private.file_compose_creations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  draft_id uuid REFERENCES private.file_compose_drafts(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id,client_id)
);
ALTER TABLE private.file_compose_creations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.file_compose_creations FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX file_compose_creation_draft ON private.file_compose_creations(draft_id);

CREATE FUNCTION public.create_file_compose_once(p_client_id uuid,p_account uuid,p_source uuid,p_fields jsonb,p_files uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); existing uuid; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF p_client_id IS NULL THEN RAISE SQLSTATE '22023'; END IF;
  INSERT INTO private.file_compose_creations(user_id,client_id) VALUES(actor,p_client_id)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT draft_id INTO existing FROM private.file_compose_creations WHERE user_id=actor AND client_id=p_client_id;
    IF existing IS NULL THEN RAISE SQLSTATE 'PT404'; END IF;
    RETURN public.read_file_compose(existing);
  END IF;
  result := public.save_file_compose(NULL,NULL,p_account,p_source,p_fields,p_files);
  UPDATE private.file_compose_creations SET draft_id=(result->>'id')::uuid WHERE user_id=actor AND client_id=p_client_id;
  RETURN result;
END $$;

-- A second first-save must compare the whole reply, including an empty attachment
-- set. Serialize on the source before examining the active draft.
CREATE OR REPLACE FUNCTION public.save_reply_files(p_source uuid,p_id uuid,p_revision integer,p_fingerprint text,
  p_to text,p_cc text,p_body text,p_files uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); d private.reply_drafts; saved jsonb;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  PERFORM private.mail_file_manifest(actor,p_files);
  PERFORM 1 FROM public.emails WHERE id=p_source AND user_id=actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO d FROM private.reply_drafts WHERE id=p_id AND user_id=actor AND source_id=p_source FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    IF d.revision IS DISTINCT FROM p_revision THEN RAISE SQLSTATE 'PT409'; END IF;
  ELSE
    SELECT * INTO d FROM private.reply_drafts WHERE user_id=actor AND source_id=p_source AND NOT completed FOR UPDATE;
    IF FOUND AND d.file_ids IS DISTINCT FROM p_files THEN RAISE SQLSTATE 'PT409'; END IF;
  END IF;
  saved := public.save_reply_draft(p_source,p_id,p_revision,p_fingerprint,p_to,p_cc,p_body);
  SELECT * INTO STRICT d FROM private.reply_drafts WHERE id=(saved->>'id')::uuid AND user_id=actor FOR UPDATE;
  IF d.file_ids IS DISTINCT FROM p_files THEN
    UPDATE private.reply_drafts SET file_ids=p_files,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=d.id RETURNING * INTO d;
  END IF;
  RETURN private.reply_draft_view(d);
END $$;

CREATE INDEX file_compose_recency ON private.file_compose_drafts(user_id,updated_at DESC,id DESC);
CREATE INDEX reply_draft_recency ON private.reply_drafts(user_id,updated_at DESC,id DESC) WHERE NOT completed;

CREATE FUNCTION public.list_mail_drafts(p_account uuid DEFAULT NULL,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE SQLSTATE '22023'; END IF;
  IF p_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.source_accounts WHERE id=p_account AND user_id=actor)
    THEN RAISE SQLSTATE 'PT404'; END IF;
  RETURN (
    WITH drafts AS (
      (SELECT d.id,d.source_id,d.account_id,d.updated_at,d.request_key,d.fields->>'subject' AS subject,
        d.fields->>'to' AS recipients,cardinality(d.file_ids) AS files,
        CASE WHEN d.source_id IS NULL THEN 'new' ELSE 'forward' END AS kind,a.email_address,
        COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END) AS state
        FROM private.file_compose_drafts d
        JOIN public.source_accounts a ON a.id=d.account_id AND a.user_id=actor
        LEFT JOIN private.mail_send_operations op ON op.user_id=actor AND op.account_id=d.account_id AND op.request_key=d.request_key
        WHERE d.user_id=actor AND (p_account IS NULL OR d.account_id=p_account)
          AND (p_before IS NULL OR (d.updated_at,d.id)<(p_before,p_before_id))
          AND (op.state IS NULL OR op.state NOT IN ('accepted','partial'))
          AND NOT EXISTS (SELECT 1 FROM private.scheduled_mail q WHERE q.user_id=actor AND q.request_key=d.request_key AND NOT q.canceled)
        ORDER BY d.updated_at DESC,d.id DESC LIMIT 41)
      UNION ALL
      (SELECT d.id,d.source_id,d.account_id,d.updated_at,d.request_key,d.subject,d.recipients,
        cardinality(d.file_ids),'reply',a.email_address,
        COALESCE(op.state,CASE WHEN d.request_key IS NULL THEN 'draft' ELSE 'prepared' END)
        FROM private.reply_drafts d
        JOIN public.source_accounts a ON a.id=d.account_id AND a.user_id=actor
        JOIN public.emails e ON e.id=d.source_id AND e.user_id=actor AND e.source_account_id=d.account_id
          AND NOT e.provider_deleted AND e.is_deleted IS NOT TRUE
        LEFT JOIN private.mail_send_operations op ON op.user_id=actor AND op.account_id=d.account_id AND op.request_key=d.request_key
        WHERE d.user_id=actor AND NOT d.completed AND (p_account IS NULL OR d.account_id=p_account)
          AND (p_before IS NULL OR (d.updated_at,d.id)<(p_before,p_before_id))
          AND (op.state IS NULL OR op.state NOT IN ('accepted','partial'))
          AND NOT EXISTS (SELECT 1 FROM private.scheduled_mail q WHERE q.user_id=actor AND q.request_key=d.request_key AND NOT q.canceled)
        ORDER BY d.updated_at DESC,d.id DESC LIMIT 41)
    ), page AS (
      SELECT * FROM drafts ORDER BY updated_at DESC,id DESC LIMIT 41
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'accountId',account_id,
      'account',email_address,'updatedAt',updated_at,'subject',subject,'to',recipients,'files',files,'kind',kind,'state',state)
      ORDER BY updated_at DESC,id DESC),'[]') FROM page
  );
END $$;

REVOKE ALL ON FUNCTION public.create_file_compose_once(uuid,uuid,uuid,jsonb,uuid[]),
  public.list_mail_drafts(uuid,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_file_compose_once(uuid,uuid,uuid,jsonb,uuid[]),
  public.list_mail_drafts(uuid,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
