-- ============================================
-- OAUTH MIGRATION FOR GMAIL SYNC
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Add OAuth columns to source_accounts
ALTER TABLE source_accounts
ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'imap',
ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS oauth_scope TEXT,
ADD COLUMN IF NOT EXISTS is_connected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Step 2: Make IMAP fields nullable (they're required for IMAP but not for OAuth)
ALTER TABLE source_accounts
ALTER COLUMN imap_host DROP NOT NULL,
ALTER COLUMN smtp_host DROP NOT NULL,
ALTER COLUMN username DROP NOT NULL,
ALTER COLUMN password_encrypted DROP NOT NULL;

-- Step 3: Add index for auth_type queries
CREATE INDEX IF NOT EXISTS idx_source_accounts_auth_type
ON source_accounts(auth_type);

-- Step 4: Add index for OAuth accounts that need sync
CREATE INDEX IF NOT EXISTS idx_source_accounts_oauth_active
ON source_accounts(user_id, is_active, auth_type)
WHERE auth_type = 'oauth_google' AND is_active = true;

-- Step 5: Update constraint to allow duplicate emails for different auth types
-- (Optional - only if you want to allow both IMAP and OAuth for same email)
-- DROP CONSTRAINT source_accounts_user_id_email_address_key;
-- ALTER TABLE source_accounts ADD CONSTRAINT source_accounts_user_email_auth_unique
--   UNIQUE(user_id, email_address, auth_type);

-- Step 6: Create function for incrementing email count (if not exists)
CREATE OR REPLACE FUNCTION increment_total_emails_synced(account_id UUID, count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE source_accounts
  SET total_emails_synced = COALESCE(total_emails_synced, 0) + count
  WHERE id = account_id;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Verify columns were added
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'source_accounts'
  AND column_name IN (
    'auth_type',
    'oauth_access_token',
    'oauth_refresh_token',
    'oauth_expires_at',
    'oauth_scope',
    'is_connected',
    'last_error'
  )
ORDER BY column_name;

-- Success message
SELECT 'OAuth migration completed successfully!' as status;
