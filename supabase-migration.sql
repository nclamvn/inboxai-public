-- InboxAI Database Migration
-- Run this in Supabase SQL Editor

-- Source email accounts table
CREATE TABLE IF NOT EXISTS source_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  display_name TEXT,
  provider TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_uid TEXT,
  sync_error TEXT,
  total_emails_synced INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, email_address)
);

-- Indexes for source_accounts
CREATE INDEX IF NOT EXISTS idx_source_accounts_user ON source_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_source_accounts_active ON source_accounts(is_active) WHERE is_active = true;

-- Add columns to emails table
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS source_account_id UUID REFERENCES source_accounts(id),
ADD COLUMN IF NOT EXISTS original_uid TEXT,
ADD COLUMN IF NOT EXISTS delivery_status TEXT;

-- Indexes for emails
CREATE INDEX IF NOT EXISTS idx_emails_source ON emails(source_account_id);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

-- Add email column to profiles if not exists
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update profiles email from auth.users
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- RLS policies for source_accounts
ALTER TABLE source_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own source accounts" ON source_accounts;
DROP POLICY IF EXISTS "Users can insert own source accounts" ON source_accounts;
DROP POLICY IF EXISTS "Users can update own source accounts" ON source_accounts;
DROP POLICY IF EXISTS "Users can delete own source accounts" ON source_accounts;

-- Create new policies
CREATE POLICY "Users can view own source accounts"
ON source_accounts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own source accounts"
ON source_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own source accounts"
ON source_accounts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own source accounts"
ON source_accounts FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for source_accounts
DROP TRIGGER IF EXISTS update_source_accounts_updated_at ON source_accounts;
CREATE TRIGGER update_source_accounts_updated_at
    BEFORE UPDATE ON source_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Migration completed successfully!' as status;
