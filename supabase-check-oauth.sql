-- ============================================
-- CHECK OAUTH COLUMNS IN SOURCE_ACCOUNTS
-- Run this FIRST to see if migration is needed
-- ============================================

-- Check 1: List all columns in source_accounts
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'source_accounts'
ORDER BY ordinal_position;

-- Check 2: Check if OAuth columns exist
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'source_accounts' AND column_name = 'auth_type') as has_auth_type,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'source_accounts' AND column_name = 'oauth_access_token') as has_oauth_access_token,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'source_accounts' AND column_name = 'oauth_refresh_token') as has_oauth_refresh_token,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'source_accounts' AND column_name = 'oauth_expires_at') as has_oauth_expires_at,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'source_accounts' AND column_name = 'is_connected') as has_is_connected;

-- Check 3: Show existing source accounts with OAuth info
SELECT
  id,
  email_address,
  provider,
  auth_type,
  is_active,
  is_connected,
  oauth_access_token IS NOT NULL as has_access_token,
  oauth_refresh_token IS NOT NULL as has_refresh_token,
  oauth_expires_at,
  last_sync_at,
  last_error,
  total_emails_synced,
  created_at
FROM source_accounts
ORDER BY created_at DESC;
