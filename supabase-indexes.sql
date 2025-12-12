-- InboxAI Performance Indexes
-- Run this in Supabase SQL Editor

-- ====================================
-- CRITICAL INDEXES FOR EMAILS TABLE
-- ====================================

-- Primary query pattern: Get user's emails filtered by status
CREATE INDEX IF NOT EXISTS idx_emails_user_archived_deleted
ON emails(user_id, is_archived, is_deleted);

-- For inbox view: unarchived, not deleted emails
CREATE INDEX IF NOT EXISTS idx_emails_inbox
ON emails(user_id, received_at DESC)
WHERE is_archived = false AND is_deleted = false;

-- For starred emails
CREATE INDEX IF NOT EXISTS idx_emails_starred
ON emails(user_id, received_at DESC)
WHERE is_starred = true AND is_deleted = false;

-- For sent emails
CREATE INDEX IF NOT EXISTS idx_emails_sent
ON emails(user_id, received_at DESC)
WHERE direction = 'outbound' AND is_deleted = false;

-- For archived emails
CREATE INDEX IF NOT EXISTS idx_emails_archived
ON emails(user_id, received_at DESC)
WHERE is_archived = true AND is_deleted = false;

-- For trash
CREATE INDEX IF NOT EXISTS idx_emails_trash
ON emails(user_id, received_at DESC)
WHERE is_deleted = true;

-- For AI classification queries
CREATE INDEX IF NOT EXISTS idx_emails_unclassified
ON emails(user_id, created_at DESC)
WHERE category IS NULL AND is_deleted = false;

-- For search by from_address
CREATE INDEX IF NOT EXISTS idx_emails_from
ON emails(user_id, from_address);

-- For deduplication during sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_source_uid
ON emails(source_account_id, original_uid)
WHERE source_account_id IS NOT NULL AND original_uid IS NOT NULL;

-- ====================================
-- SOURCE ACCOUNTS INDEXES
-- ====================================

-- For listing user's accounts
CREATE INDEX IF NOT EXISTS idx_source_accounts_user_active
ON source_accounts(user_id, is_active DESC, created_at DESC);

-- ====================================
-- ANALYZE TABLES
-- ====================================
ANALYZE emails;
ANALYZE source_accounts;

-- Success message
SELECT 'Performance indexes created successfully!' as status;
