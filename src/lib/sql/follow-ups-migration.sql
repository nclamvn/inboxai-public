-- Follow-ups Table Migration
-- Run this SQL in Supabase SQL Editor

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE NOT NULL,

  -- Follow-up details
  type VARCHAR(50) NOT NULL CHECK (type IN ('awaiting_reply', 'needs_reply', 'commitment_due', 'question_asked', 'action_required')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  reason TEXT,
  suggested_action TEXT,
  due_date TIMESTAMPTZ,

  -- Person involved
  person_email VARCHAR(255),
  person_name VARCHAR(255),

  -- AI confidence
  confidence DECIMAL(3,2),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dismissed')),
  snooze_until TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint to prevent duplicates
  UNIQUE(user_id, email_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_status ON follow_ups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_priority ON follow_ups(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_type ON follow_ups(user_id, type);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON follow_ups(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_snooze ON follow_ups(snooze_until) WHERE snooze_until IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own follow-ups"
  ON follow_ups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own follow-ups"
  ON follow_ups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own follow-ups"
  ON follow_ups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follow-ups"
  ON follow_ups FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_follow_ups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_ups_updated_at();

-- Grant permissions
GRANT ALL ON follow_ups TO authenticated;
GRANT SELECT ON follow_ups TO anon;
