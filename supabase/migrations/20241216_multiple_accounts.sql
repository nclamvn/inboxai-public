-- ============================================
-- MULTIPLE EMAIL ACCOUNTS SUPPORT
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add new columns to source_accounts for multiple account support
ALTER TABLE source_accounts
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#2563EB',
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'idle';

-- 2. Rename oauth columns to standard names (if they exist with old names)
-- Access token
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'source_accounts' AND column_name = 'oauth_access_token')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'source_accounts' AND column_name = 'access_token') THEN
    ALTER TABLE source_accounts RENAME COLUMN oauth_access_token TO access_token;
  END IF;
END $$;

-- Refresh token
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'source_accounts' AND column_name = 'oauth_refresh_token')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'source_accounts' AND column_name = 'refresh_token') THEN
    ALTER TABLE source_accounts RENAME COLUMN oauth_refresh_token TO refresh_token;
  END IF;
END $$;

-- Token expires at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'source_accounts' AND column_name = 'oauth_expires_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'source_accounts' AND column_name = 'token_expires_at') THEN
    ALTER TABLE source_accounts RENAME COLUMN oauth_expires_at TO token_expires_at;
  END IF;
END $$;

-- 3. Add access_token/refresh_token columns if they don't exist (fresh install)
ALTER TABLE source_accounts
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- 4. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_source_accounts_user_primary
ON source_accounts(user_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_emails_source_account
ON emails(source_account_id) WHERE source_account_id IS NOT NULL;

-- 5. Function to set primary account
CREATE OR REPLACE FUNCTION set_primary_account(p_user_id UUID, p_account_id UUID)
RETURNS void AS $$
BEGIN
  -- Remove primary from all accounts
  UPDATE source_accounts
  SET is_primary = false
  WHERE user_id = p_user_id;

  -- Set new primary
  UPDATE source_accounts
  SET is_primary = true
  WHERE id = p_account_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger to auto-set first account as primary
CREATE OR REPLACE FUNCTION auto_set_primary_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM source_accounts
    WHERE user_id = NEW.user_id AND is_primary = true AND id != NEW.id
  ) THEN
    NEW.is_primary := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_primary ON source_accounts;
CREATE TRIGGER trigger_auto_primary
  BEFORE INSERT ON source_accounts
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_primary_account();

-- 7. Set existing accounts as primary if they're the only one
UPDATE source_accounts sa
SET is_primary = true
WHERE NOT EXISTS (
  SELECT 1 FROM source_accounts other
  WHERE other.user_id = sa.user_id AND other.id != sa.id
);

-- 8. Assign colors to existing accounts that don't have one
WITH ranked_accounts AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
  FROM source_accounts
  WHERE color IS NULL OR color = '#2563EB'
)
UPDATE source_accounts sa
SET color = CASE
  WHEN ra.rn = 1 THEN '#2563EB'  -- Blue
  WHEN ra.rn = 2 THEN '#10B981'  -- Green
  WHEN ra.rn = 3 THEN '#F59E0B'  -- Amber
  WHEN ra.rn = 4 THEN '#EF4444'  -- Red
  WHEN ra.rn = 5 THEN '#8B5CF6'  -- Purple
  WHEN ra.rn = 6 THEN '#EC4899'  -- Pink
  WHEN ra.rn = 7 THEN '#06B6D4'  -- Cyan
  ELSE '#F97316'  -- Orange
END
FROM ranked_accounts ra
WHERE sa.id = ra.id;

-- 9. Link existing emails to their source accounts (if not already linked)
-- This matches emails to accounts by from_address
UPDATE emails e
SET source_account_id = sa.id
FROM source_accounts sa
WHERE e.source_account_id IS NULL
  AND e.user_id = sa.user_id
  AND (
    e.from_address ILIKE '%' || sa.email_address || '%'
    OR e.to_addresses::text ILIKE '%' || sa.email_address || '%'
  );

-- 10. Verify migration
SELECT
  'source_accounts columns' as check_type,
  COUNT(*) as total_accounts,
  COUNT(*) FILTER (WHERE is_primary = true) as primary_accounts,
  COUNT(*) FILTER (WHERE color IS NOT NULL) as accounts_with_color
FROM source_accounts;

SELECT 'Multiple accounts migration completed!' as status;
