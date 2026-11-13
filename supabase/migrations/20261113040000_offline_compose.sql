BEGIN;

-- An uncertain upload may be replayed only with the same owner and exact bytes.
CREATE FUNCTION public.store_device_compose_file(p_actor uuid,p_id uuid,p_filename text,p_content_type text,p_data text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f private.mail_files; bytes bytea;
BEGIN
  IF p_actor IS NULL OR p_id IS NULL THEN RAISE SQLSTATE '22023'; END IF;
  IF p_data IS NULL OR length(p_data)>11184812 THEN RAISE SQLSTATE 'PT413'; END IF;
  bytes := decode(p_data,'base64');
  INSERT INTO private.mail_files(id,user_id,filename,content_type,content)
    VALUES(p_id,p_actor,p_filename,p_content_type,bytes) ON CONFLICT (id) DO NOTHING RETURNING * INTO f;
  IF NOT FOUND THEN
    SELECT * INTO f FROM private.mail_files WHERE id=p_id AND user_id=p_actor;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404'; END IF;
    IF (f.filename,f.content_type,f.content) IS DISTINCT FROM (p_filename,p_content_type,bytes)
      OR f.source_attachment_id IS NOT NULL THEN RAISE SQLSTATE 'PT409'; END IF;
  END IF;
  RETURN private.mail_file_metadata(f);
END $$;
REVOKE ALL ON FUNCTION public.store_device_compose_file(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_device_compose_file(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.read_file_compose_creation(p_client_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); existing uuid;
BEGIN
  IF actor IS NULL THEN RAISE SQLSTATE '42501'; END IF;
  SELECT draft_id INTO existing FROM private.file_compose_creations WHERE user_id=actor AND client_id=p_client_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF existing IS NULL THEN RAISE SQLSTATE 'PT404'; END IF;
  RETURN public.read_file_compose(existing);
END $$;
REVOKE ALL ON FUNCTION public.read_file_compose_creation(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_file_compose_creation(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
