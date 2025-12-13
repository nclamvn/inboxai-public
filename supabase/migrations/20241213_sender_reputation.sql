-- =============================================
-- SENDER REPUTATION SYSTEM
-- Migration: 2024-12-13
-- Purpose: Add sender reputation tracking for consistent AI classification
-- =============================================

-- Bảng lưu reputation của từng sender theo user
CREATE TABLE IF NOT EXISTS sender_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    sender_domain TEXT NOT NULL,
    primary_category TEXT NOT NULL DEFAULT 'uncategorized',
    category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_emails INTEGER NOT NULL DEFAULT 0,
    user_overrides INTEGER NOT NULL DEFAULT 0,
    confidence FLOAT NOT NULL DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: mỗi user chỉ có 1 record per sender
    CONSTRAINT unique_user_sender UNIQUE(user_id, sender_email)
);

-- =============================================
-- INDEXES
-- =============================================

-- Index cho lookup sender reputation (primary query)
CREATE INDEX IF NOT EXISTS idx_sender_reputation_user_sender
ON sender_reputation(user_id, sender_email);

-- Index cho lookup theo domain (group by domain)
CREATE INDEX IF NOT EXISTS idx_sender_reputation_user_domain
ON sender_reputation(user_id, sender_domain);

-- Index cho query high-confidence senders (fast path)
CREATE INDEX IF NOT EXISTS idx_sender_reputation_confidence
ON sender_reputation(user_id, confidence DESC)
WHERE confidence >= 0.85;

-- Index cho recalculation job
CREATE INDEX IF NOT EXISTS idx_sender_reputation_updated
ON sender_reputation(updated_at);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE sender_reputation ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-run safety)
DROP POLICY IF EXISTS "Users can view own sender_reputation" ON sender_reputation;
DROP POLICY IF EXISTS "Users can insert own sender_reputation" ON sender_reputation;
DROP POLICY IF EXISTS "Users can update own sender_reputation" ON sender_reputation;
DROP POLICY IF EXISTS "Users can delete own sender_reputation" ON sender_reputation;

-- Policy: User chỉ thấy reputation của mình
CREATE POLICY "Users can view own sender_reputation"
ON sender_reputation FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sender_reputation"
ON sender_reputation FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sender_reputation"
ON sender_reputation FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sender_reputation"
ON sender_reputation FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- TRIGGER: Auto-update updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_sender_reputation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sender_reputation_updated_at ON sender_reputation;
CREATE TRIGGER trigger_sender_reputation_updated_at
BEFORE UPDATE ON sender_reputation
FOR EACH ROW
EXECUTE FUNCTION update_sender_reputation_updated_at();

-- =============================================
-- FUNCTION: Calculate confidence score
-- =============================================

CREATE OR REPLACE FUNCTION calculate_sender_confidence(
    p_total_emails INTEGER,
    p_user_overrides INTEGER,
    p_category_scores JSONB
) RETURNS FLOAT AS $$
DECLARE
    base_confidence FLOAT;
    override_boost FLOAT;
    consistency_score FLOAT;
    max_score FLOAT := 0;
    total_score FLOAT := 0;
    score_record RECORD;
BEGIN
    -- Base confidence từ số lượng emails (max 0.5)
    -- 20 emails = 0.5 confidence
    base_confidence := LEAST(p_total_emails::FLOAT / 20.0, 0.5);

    -- Boost từ user overrides (mỗi override +0.15, max 0.3)
    -- User feedback có trọng số cao hơn
    override_boost := LEAST(p_user_overrides::FLOAT * 0.15, 0.3);

    -- Consistency score: category chính chiếm bao nhiêu % (max 0.2)
    FOR score_record IN SELECT value::FLOAT as score FROM jsonb_each_text(p_category_scores)
    LOOP
        total_score := total_score + score_record.score;
        IF score_record.score > max_score THEN
            max_score := score_record.score;
        END IF;
    END LOOP;

    IF total_score > 0 THEN
        consistency_score := (max_score / total_score) * 0.2;
    ELSE
        consistency_score := 0;
    END IF;

    RETURN LEAST(base_confidence + override_boost + consistency_score, 1.0);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE sender_reputation IS 'Tracks sender classification history for consistent AI categorization';
COMMENT ON COLUMN sender_reputation.primary_category IS 'Most frequent category for this sender';
COMMENT ON COLUMN sender_reputation.category_scores IS 'JSON object with category counts: {"work": 5, "newsletter": 2}';
COMMENT ON COLUMN sender_reputation.confidence IS 'Confidence score 0-1, use threshold 0.85 for auto-classification';
COMMENT ON COLUMN sender_reputation.user_overrides IS 'Number of times user manually corrected classification';

-- =============================================
-- VERIFY
-- =============================================

SELECT 'sender_reputation migration completed successfully!' as status;
