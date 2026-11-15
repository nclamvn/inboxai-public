-- Synthetic legacy data inserted before the M1-A migration, never a real mailbox.
UPDATE public.registration_policy SET enabled=true;
INSERT INTO auth.users(id,email) VALUES('90000000-0000-0000-0000-000000000001','vault-upgrade@example.test');
UPDATE public.registration_policy SET enabled=false;
INSERT INTO public.source_accounts(id,user_id,email_address,auth_type,oauth_access_token,oauth_refresh_token,oauth_expires_at)
VALUES('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','legacy-vault@example.test',
 'oauth_google','synthetic-legacy-access','synthetic-legacy-refresh','2026-11-12T00:00:00Z');
