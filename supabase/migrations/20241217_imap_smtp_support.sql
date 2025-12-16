-- ============================================
-- IMAP/SMTP EMAIL SUPPORT
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add IMAP/SMTP fields to source_accounts
ALTER TABLE source_accounts
ADD COLUMN IF NOT EXISTS imap_host TEXT,
ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT 993,
ADD COLUMN IF NOT EXISTS imap_secure BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS smtp_host TEXT,
ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587,
ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_password TEXT,
ADD COLUMN IF NOT EXISTS last_uid TEXT,
ADD COLUMN IF NOT EXISTS folder_mapping JSONB DEFAULT '{"inbox": "INBOX", "sent": "Sent", "drafts": "Drafts", "trash": "Trash"}';

-- 2. Add imap_uid to emails table for tracking synced emails
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS imap_uid TEXT,
ADD COLUMN IF NOT EXISTS message_id TEXT;

-- 3. Create index for IMAP UID lookups
CREATE INDEX IF NOT EXISTS idx_emails_imap_uid
ON emails(source_account_id, imap_uid) WHERE imap_uid IS NOT NULL;

-- 4. Create table for common email provider presets
CREATE TABLE IF NOT EXISTS email_provider_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  imap_host TEXT NOT NULL,
  imap_port INTEGER DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,
  help_url TEXT,
  requires_app_password BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Insert common provider presets
INSERT INTO email_provider_presets (id, name, imap_host, imap_port, smtp_host, smtp_port, requires_app_password, help_url, notes) VALUES
  ('zoho', 'Zoho Mail', 'imap.zoho.com', 993, 'smtp.zoho.com', 587, false, 'https://www.zoho.com/mail/help/imap-access.html', 'Enable IMAP in Zoho Mail settings'),
  ('yahoo', 'Yahoo Mail', 'imap.mail.yahoo.com', 993, 'smtp.mail.yahoo.com', 587, true, 'https://help.yahoo.com/kb/imap-settings-sln4075.html', 'Requires App Password'),
  ('yandex', 'Yandex Mail', 'imap.yandex.com', 993, 'smtp.yandex.com', 587, true, 'https://yandex.com/support/mail/mail-clients.html', 'Create App Password in Yandex settings'),
  ('fastmail', 'FastMail', 'imap.fastmail.com', 993, 'smtp.fastmail.com', 587, true, 'https://www.fastmail.help/hc/en-us/articles/1500000278342', 'Use App Password'),
  ('aol', 'AOL Mail', 'imap.aol.com', 993, 'smtp.aol.com', 587, true, NULL, 'Requires App Password'),
  ('icloud', 'iCloud Mail', 'imap.mail.me.com', 993, 'smtp.mail.me.com', 587, true, 'https://support.apple.com/en-us/102525', 'Generate App-Specific Password in Apple ID'),
  ('hostinger', 'Hostinger', 'imap.hostinger.com', 993, 'smtp.hostinger.com', 587, false, NULL, 'Use your email password'),
  ('namecheap', 'Namecheap Private Email', 'mail.privateemail.com', 993, 'mail.privateemail.com', 587, false, NULL, 'Use your email password'),
  ('cpanel', 'cPanel Webmail', 'mail.yourdomain.com', 993, 'mail.yourdomain.com', 587, false, NULL, 'Replace yourdomain.com with your actual domain'),
  ('protonmail', 'ProtonMail Bridge', '127.0.0.1', 1143, '127.0.0.1', 1025, true, 'https://proton.me/support/protonmail-bridge-install', 'Requires ProtonMail Bridge installed'),
  ('gmx', 'GMX Mail', 'imap.gmx.com', 993, 'mail.gmx.com', 587, false, NULL, 'Enable IMAP in GMX settings'),
  ('mailcom', 'Mail.com', 'imap.mail.com', 993, 'smtp.mail.com', 587, false, NULL, 'Enable IMAP in Mail.com settings'),
  ('custom', 'Custom Server', '', 993, '', 587, false, NULL, 'Enter your server settings manually')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  imap_host = EXCLUDED.imap_host,
  imap_port = EXCLUDED.imap_port,
  smtp_host = EXCLUDED.smtp_host,
  smtp_port = EXCLUDED.smtp_port,
  requires_app_password = EXCLUDED.requires_app_password,
  help_url = EXCLUDED.help_url,
  notes = EXCLUDED.notes;

-- 6. Index for faster provider queries
CREATE INDEX IF NOT EXISTS idx_source_accounts_provider
ON source_accounts(provider);

CREATE INDEX IF NOT EXISTS idx_source_accounts_user_provider
ON source_accounts(user_id, provider);

-- 7. Add error_message column if not exists
ALTER TABLE source_accounts
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 8. Verify migration
SELECT 'email_provider_presets' as table_name, COUNT(*) as count FROM email_provider_presets;

SELECT 'IMAP/SMTP migration completed!' as status;
