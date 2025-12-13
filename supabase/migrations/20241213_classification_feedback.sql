-- Migration: Create classification_feedback table for AI learning
-- Created: 2024-12-13

-- Table for storing user classification corrections
CREATE TABLE IF NOT EXISTS classification_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  from_domain TEXT,
  subject_keywords TEXT[],
  original_category TEXT NOT NULL,
  corrected_category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate feedback for same email
  CONSTRAINT unique_email_feedback UNIQUE(user_id, email_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_classification_feedback_user
  ON classification_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_domain
  ON classification_feedback(from_domain);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_sender
  ON classification_feedback(from_address);

-- Enable RLS
ALTER TABLE classification_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own feedback"
  ON classification_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON classification_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE classification_feedback IS 'Stores user corrections to AI classification for learning';
