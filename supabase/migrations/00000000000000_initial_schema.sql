-- ============================================
-- InboxAI - Initial Database Schema
-- ============================================
-- Run this FIRST before other migrations
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  mailbox_address TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- EMAILS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id TEXT,
  thread_id TEXT,

  -- Sender/Recipients
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses JSONB DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  reply_to TEXT,

  -- Content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,

  -- Timestamps
  received_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Source
  source_account_id UUID,
  original_uid TEXT,
  direction TEXT DEFAULT 'inbound',

  -- AI Classification
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  category TEXT DEFAULT 'uncategorized',
  summary TEXT,
  detected_deadline TIMESTAMP WITH TIME ZONE,
  needs_reply BOOLEAN DEFAULT false,
  ai_confidence NUMERIC(3,2),
  ai_suggestions JSONB DEFAULT '{}',

  -- Status flags
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  snoozed_until TIMESTAMP WITH TIME ZONE,
  user_notes TEXT,

  -- Attachments
  attachment_count INTEGER DEFAULT 0,

  -- Send status (for outbound)
  send_status TEXT,
  delivery_status TEXT,

  -- Phishing detection
  phishing_score NUMERIC(3,2),
  phishing_risk TEXT,
  phishing_reasons JSONB,
  is_phishing_reviewed BOOLEAN DEFAULT false,

  -- Constraints
  UNIQUE(user_id, message_id)
);

-- Indexes for emails
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_priority ON emails(priority);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_is_archived ON emails(is_archived);
CREATE INDEX IF NOT EXISTS idx_emails_is_deleted ON emails(is_deleted);
CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_from_address ON emails(from_address);

-- RLS for emails
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emails"
  ON emails FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emails"
  ON emails FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emails"
  ON emails FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own emails"
  ON emails FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SOURCE ACCOUNTS TABLE (Email accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS source_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  display_name TEXT,
  provider TEXT,
  auth_type TEXT DEFAULT 'imap',

  -- IMAP Settings
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,

  -- SMTP Settings
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,

  -- Credentials
  username TEXT,
  password_encrypted TEXT,

  -- OAuth tokens (for Gmail)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMP WITH TIME ZONE,
  oauth_scope TEXT,

  -- Sync status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_uid TEXT,
  sync_error TEXT,
  total_emails_synced INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, email_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_source_accounts_user ON source_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_source_accounts_active ON source_accounts(is_active) WHERE is_active = true;

-- RLS for source_accounts
ALTER TABLE source_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own source accounts"
  ON source_accounts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own source accounts"
  ON source_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own source accounts"
  ON source_accounts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own source accounts"
  ON source_accounts FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attachments"
  ON attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid()));

-- ============================================
-- ACTION ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_user ON action_items(user_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own action items"
  ON action_items FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- FOLLOW UPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  reason TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own follow ups"
  ON follow_ups FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- AUTOMATION RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rules"
  ON automation_rules FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- EMAIL FEEDBACK TABLE (for AI improvement)
-- ============================================
CREATE TABLE IF NOT EXISTS email_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own feedback"
  ON email_feedback FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- WHITELIST TABLE (Access control)
-- ============================================
CREATE TABLE IF NOT EXISTS whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  added_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ACCESS REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notifications"
  ON notifications FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- ============================================
-- Success message
-- ============================================
SELECT 'Initial schema created successfully!' as status;
