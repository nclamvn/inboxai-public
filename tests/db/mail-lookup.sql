BEGIN;
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000191','lookup-owner@example.test'),
 ('00000000-0000-0000-0000-000000000192','lookup-other@example.test');
INSERT INTO public.source_accounts(id,user_id,email_address,provider) VALUES
 ('10000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000191','lookup-mailbox@example.test','gmail'),
 ('10000000-0000-0000-0000-000000000192','00000000-0000-0000-0000-000000000192','lookup-foreign@example.test','gmail');
INSERT INTO public.emails(id,user_id,source_account_id,from_address,subject,direction,body_text,category,is_deleted,provider_deleted) VALUES
 ('20000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000191','10000000-0000-0000-0000-000000000191',
  'sent@example.test','Hồ sơ thiết bị','outbound','Nội dung biên nhận thiết bị.','work',false,false),
 ('20000000-0000-0000-0000-000000000192','00000000-0000-0000-0000-000000000192','10000000-0000-0000-0000-000000000192',
  'foreign@example.test','Hồ sơ thiết bị','inbound','Nguồn ngoài phạm vi.','work',false,false),
 ('20000000-0000-0000-0000-000000000193','00000000-0000-0000-0000-000000000191','10000000-0000-0000-0000-000000000191',
  'archived@example.test','Hồ sơ thiết bị','inbound','Nguồn đã xóa.','work',true,false),
 ('20000000-0000-0000-0000-000000000194','00000000-0000-0000-0000-000000000191','10000000-0000-0000-0000-000000000191',
  'deleted@example.test','Hồ sơ thiết bị','inbound','Nguồn không còn ở Gmail.','work',false,true),
 ('20000000-0000-0000-0000-000000000195','00000000-0000-0000-0000-000000000191','10000000-0000-0000-0000-000000000191',
  'inline@example.test','Hồ sơ khác','inbound','Đoạn văn khác.','work',false,false);

INSERT INTO private.mail_files(id,user_id,filename,content_type,content)
VALUES ('30000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000191','Báo%cao.csv','text/csv','x'::bytea);
INSERT INTO private.sent_mail_files(id,email_id,file_id,position) VALUES
 ('40000000-0000-0000-0000-000000000191','20000000-0000-0000-0000-000000000191','30000000-0000-0000-0000-000000000191',1);
INSERT INTO public.attachments(email_id,filename,size,is_inline) VALUES
 ('20000000-0000-0000-0000-000000000191','Báo%cao.csv',1,false),
 ('20000000-0000-0000-0000-000000000192','Báo%cao.csv',2,false),
 ('20000000-0000-0000-0000-000000000193','Báo%cao.csv',3,false),
 ('20000000-0000-0000-0000-000000000194','Báo%cao.csv',4,false),
 ('20000000-0000-0000-0000-000000000195','Báo%cao.csv',5,true),
 ('20000000-0000-0000-0000-000000000195','Baoxcao.csv',6,false);

SET LOCAL ROLE anon;
DO $$ BEGIN
 IF has_function_privilege(current_user,'public.search_synced_mail(text,uuid[],text,boolean,integer,timestamptz,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous mail search';
 END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE owner_account constant uuid := '10000000-0000-0000-0000-000000000191';
  foreign_account constant uuid := '10000000-0000-0000-0000-000000000192';
  sent_email constant uuid := '20000000-0000-0000-0000-000000000191';
  stored_file constant uuid := '40000000-0000-0000-0000-000000000191';
  output jsonb;
BEGIN
  PERFORM public.set_personal_mail_category(ARRAY[sent_email],'transaction');
  UPDATE public.emails SET category='work' WHERE id=sent_email;
  output := public.search_synced_mail('bao%cao.csv',ARRAY[owner_account],'transaction',true,NULL,NULL,NULL);
  IF jsonb_array_length(output->'hits')<>1 OR output#>>'{hits,0,id}'<>sent_email::text
     OR output#>>'{hits,0,category}'<>'transaction' OR jsonb_array_length(output#>'{hits,0,files}')<>1
     OR output#>>'{hits,0,files,0,id}'<>stored_file::text THEN
    RAISE EXCEPTION 'Stored-file precedence, manual label or exact lookup failed: %',output;
  END IF;
  output := public.search_synced_mail('bao%cao.csv','{}',NULL,false,NULL,NULL,NULL);
  IF jsonb_array_length(output->'hits')<>1 THEN
    RAISE EXCEPTION 'Wildcard, foreign, inline or deleted match leaked: %',output;
  END IF;
  output := public.search_synced_mail('noi dung bien nhan','{}',NULL,false,NULL,NULL,NULL);
  IF output#>>'{hits,0,id}' IS DISTINCT FROM sent_email::text THEN
    RAISE EXCEPTION 'Existing body full-text index did not match';
  END IF;
  BEGIN
    PERFORM public.search_synced_mail('bao',ARRAY[foreign_account],NULL,false,NULL,NULL,NULL);
    RAISE EXCEPTION 'Foreign account accepted';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: full-mail lookup finds stored sent files, respects manual categories and hides foreign, inline and deleted attachments' AS result;
