-- =============================================
-- AI MONITORING & DOMAIN REPUTATION SYSTEM
-- =============================================

-- =============================================
-- 1. BẢNG AI CLASSIFICATION LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS ai_classification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

    -- Classification input
    sender_email TEXT NOT NULL,
    sender_domain TEXT NOT NULL,
    subject TEXT,

    -- Classification output
    assigned_category TEXT NOT NULL,
    ai_confidence FLOAT NOT NULL DEFAULT 0,
    phishing_score INTEGER DEFAULT 0,

    -- Source of classification
    classification_source TEXT NOT NULL, -- 'sender_reputation', 'rule_based', 'keyword', 'gpt', 'hybrid'
    used_sender_reputation BOOLEAN DEFAULT FALSE,
    sender_reputation_score FLOAT,

    -- Performance
    processing_time_ms INTEGER, -- Thời gian xử lý (ms)

    -- User feedback (updated later)
    user_corrected_category TEXT,
    is_correct BOOLEAN, -- NULL = chưa feedback, TRUE/FALSE = user confirm
    feedback_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes cho analytics
CREATE INDEX IF NOT EXISTS idx_ai_logs_user_date
ON ai_classification_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_logs_category
ON ai_classification_logs(assigned_category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_logs_source
ON ai_classification_logs(classification_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_logs_feedback
ON ai_classification_logs(is_correct, created_at DESC)
WHERE is_correct IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_logs_domain
ON ai_classification_logs(sender_domain, created_at DESC);

-- =============================================
-- 2. BẢNG AI METRICS DAILY (Aggregated)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_metrics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = global metrics

    -- Classification metrics
    total_classifications INTEGER DEFAULT 0,
    correct_classifications INTEGER DEFAULT 0,
    incorrect_classifications INTEGER DEFAULT 0,
    pending_feedback INTEGER DEFAULT 0,

    -- Accuracy by category (JSONB)
    category_stats JSONB DEFAULT '{}'::jsonb,
    -- Format: {"work": {"total": 100, "correct": 95}, "spam": {...}}

    -- Source distribution
    source_stats JSONB DEFAULT '{}'::jsonb,
    -- Format: {"sender_reputation": 40, "gpt": 30, "rule_based": 20, "keyword": 10}

    -- Sender reputation metrics
    reputation_hit_count INTEGER DEFAULT 0, -- Số lần dùng sender reputation
    reputation_hit_rate FLOAT DEFAULT 0, -- % dùng reputation thay vì AI

    -- Phishing metrics
    phishing_detected INTEGER DEFAULT 0,
    phishing_false_positives INTEGER DEFAULT 0,
    phishing_confirmed INTEGER DEFAULT 0,

    -- Performance metrics
    avg_processing_time_ms FLOAT DEFAULT 0,
    max_processing_time_ms INTEGER DEFAULT 0,

    -- Confidence distribution
    avg_confidence FLOAT DEFAULT 0,
    low_confidence_count INTEGER DEFAULT 0, -- confidence < 0.6

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(metric_date, user_id)
);

-- Index cho query metrics
CREATE INDEX IF NOT EXISTS idx_ai_metrics_date
ON ai_metrics_daily(metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_user_date
ON ai_metrics_daily(user_id, metric_date DESC);

-- =============================================
-- 3. BẢNG DOMAIN REPUTATION
-- =============================================

CREATE TABLE IF NOT EXISTS domain_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,

    -- Reputation score (0-100)
    reputation_score INTEGER DEFAULT 50,
    trust_level TEXT DEFAULT 'neutral', -- untrusted, low, neutral, trusted, verified

    -- Action counters
    total_emails INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    replied_count INTEGER DEFAULT 0,
    archived_count INTEGER DEFAULT 0,
    deleted_count INTEGER DEFAULT 0,
    spam_reported_count INTEGER DEFAULT 0,
    phishing_reported_count INTEGER DEFAULT 0,

    -- Derived metrics
    open_rate FLOAT DEFAULT 0,
    reply_rate FLOAT DEFAULT 0,
    delete_rate FLOAT DEFAULT 0,

    -- Category tendency
    category_distribution JSONB DEFAULT '{}'::jsonb,
    -- Format: {"work": 0.6, "personal": 0.3, "newsletter": 0.1}
    primary_category TEXT,

    -- Flags
    is_whitelisted BOOLEAN DEFAULT FALSE,
    is_blacklisted BOOLEAN DEFAULT FALSE,
    is_legitimate BOOLEAN DEFAULT FALSE, -- From legitimate_domains table

    -- Timestamps
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(user_id, domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_domain_reputation_user
ON domain_reputation(user_id, reputation_score DESC);

CREATE INDEX IF NOT EXISTS idx_domain_reputation_domain
ON domain_reputation(domain);

CREATE INDEX IF NOT EXISTS idx_domain_reputation_trust
ON domain_reputation(user_id, trust_level);

-- =============================================
-- 4. BẢNG USER ACTION LOGS (cho domain tracking)
-- =============================================

CREATE TABLE IF NOT EXISTS email_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    sender_domain TEXT NOT NULL,

    action_type TEXT NOT NULL, -- 'open', 'reply', 'archive', 'delete', 'spam', 'phishing_report', 'mark_safe'

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index cho aggregation
CREATE INDEX IF NOT EXISTS idx_action_logs_domain
ON email_action_logs(user_id, sender_domain, action_type);

CREATE INDEX IF NOT EXISTS idx_action_logs_date
ON email_action_logs(created_at DESC);

-- =============================================
-- 5. BẢNG AI SETTINGS (Configurable thresholds)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = global default

    -- Sender reputation settings
    sender_reputation_threshold FLOAT DEFAULT 0.85, -- Min confidence để dùng reputation
    sender_reputation_enabled BOOLEAN DEFAULT TRUE,

    -- Phishing settings
    phishing_score_threshold INTEGER DEFAULT 70, -- Score để mark as phishing
    phishing_auto_spam BOOLEAN DEFAULT TRUE, -- Auto move to spam

    -- Classification settings
    low_confidence_threshold FLOAT DEFAULT 0.6, -- Threshold cho "low confidence"

    -- Domain reputation weights
    domain_weight_open INTEGER DEFAULT 2,
    domain_weight_reply INTEGER DEFAULT 5,
    domain_weight_archive INTEGER DEFAULT 1,
    domain_weight_delete INTEGER DEFAULT -2,
    domain_weight_spam INTEGER DEFAULT -10,
    domain_weight_phishing INTEGER DEFAULT -20,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(user_id)
);

-- Insert default global settings
INSERT INTO ai_settings (user_id) VALUES (NULL)
ON CONFLICT (user_id) DO NOTHING;

-- =============================================
-- 6. FUNCTIONS
-- =============================================

-- Function: Calculate trust level from score
CREATE OR REPLACE FUNCTION get_domain_trust_level(score INTEGER)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN score >= 90 THEN 'verified'
        WHEN score >= 70 THEN 'trusted'
        WHEN score >= 40 THEN 'neutral'
        WHEN score >= 20 THEN 'low'
        ELSE 'untrusted'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Update domain reputation from action
CREATE OR REPLACE FUNCTION update_domain_reputation_from_action()
RETURNS TRIGGER AS $$
DECLARE
    v_weight INTEGER;
    v_settings ai_settings%ROWTYPE;
BEGIN
    -- Get user settings or global default
    SELECT * INTO v_settings
    FROM ai_settings
    WHERE user_id = NEW.user_id OR user_id IS NULL
    ORDER BY user_id NULLS LAST
    LIMIT 1;

    -- Get weight based on action type
    v_weight := CASE NEW.action_type
        WHEN 'open' THEN COALESCE(v_settings.domain_weight_open, 2)
        WHEN 'reply' THEN COALESCE(v_settings.domain_weight_reply, 5)
        WHEN 'archive' THEN COALESCE(v_settings.domain_weight_archive, 1)
        WHEN 'delete' THEN COALESCE(v_settings.domain_weight_delete, -2)
        WHEN 'spam' THEN COALESCE(v_settings.domain_weight_spam, -10)
        WHEN 'phishing_report' THEN COALESCE(v_settings.domain_weight_phishing, -20)
        WHEN 'mark_safe' THEN 5
        ELSE 0
    END;

    -- Upsert domain reputation
    INSERT INTO domain_reputation (user_id, domain, reputation_score, total_emails)
    VALUES (NEW.user_id, NEW.sender_domain, 50 + v_weight, 1)
    ON CONFLICT (user_id, domain) DO UPDATE SET
        reputation_score = LEAST(100, GREATEST(0, domain_reputation.reputation_score + v_weight)),
        total_emails = domain_reputation.total_emails +
            CASE WHEN NEW.action_type = 'open' THEN 0 ELSE 0 END,
        opened_count = domain_reputation.opened_count +
            CASE WHEN NEW.action_type = 'open' THEN 1 ELSE 0 END,
        replied_count = domain_reputation.replied_count +
            CASE WHEN NEW.action_type = 'reply' THEN 1 ELSE 0 END,
        archived_count = domain_reputation.archived_count +
            CASE WHEN NEW.action_type = 'archive' THEN 1 ELSE 0 END,
        deleted_count = domain_reputation.deleted_count +
            CASE WHEN NEW.action_type = 'delete' THEN 1 ELSE 0 END,
        spam_reported_count = domain_reputation.spam_reported_count +
            CASE WHEN NEW.action_type = 'spam' THEN 1 ELSE 0 END,
        phishing_reported_count = domain_reputation.phishing_reported_count +
            CASE WHEN NEW.action_type = 'phishing_report' THEN 1 ELSE 0 END,
        last_seen_at = NOW(),
        updated_at = NOW();

    -- Update trust level
    UPDATE domain_reputation
    SET trust_level = get_domain_trust_level(reputation_score)
    WHERE user_id = NEW.user_id AND domain = NEW.sender_domain;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update domain reputation on action
DROP TRIGGER IF EXISTS trigger_update_domain_reputation ON email_action_logs;

CREATE TRIGGER trigger_update_domain_reputation
AFTER INSERT ON email_action_logs
FOR EACH ROW
EXECUTE FUNCTION update_domain_reputation_from_action();

-- Function: Aggregate daily metrics
CREATE OR REPLACE FUNCTION aggregate_daily_ai_metrics(p_date DATE, p_user_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_stats RECORD;
BEGIN
    -- Calculate metrics for the date
    SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_correct = TRUE) as correct,
        COUNT(*) FILTER (WHERE is_correct = FALSE) as incorrect,
        COUNT(*) FILTER (WHERE is_correct IS NULL) as pending,
        COUNT(*) FILTER (WHERE used_sender_reputation = TRUE) as reputation_hits,
        COUNT(*) FILTER (WHERE phishing_score >= 70) as phishing_detected,
        AVG(processing_time_ms) as avg_time,
        MAX(processing_time_ms) as max_time,
        AVG(ai_confidence) as avg_confidence,
        COUNT(*) FILTER (WHERE ai_confidence < 0.6) as low_confidence
    INTO v_stats
    FROM ai_classification_logs
    WHERE DATE(created_at) = p_date
    AND (p_user_id IS NULL OR user_id = p_user_id);

    -- Upsert metrics
    INSERT INTO ai_metrics_daily (
        metric_date, user_id,
        total_classifications, correct_classifications, incorrect_classifications, pending_feedback,
        reputation_hit_count, reputation_hit_rate,
        phishing_detected,
        avg_processing_time_ms, max_processing_time_ms,
        avg_confidence, low_confidence_count
    ) VALUES (
        p_date, p_user_id,
        COALESCE(v_stats.total, 0),
        COALESCE(v_stats.correct, 0),
        COALESCE(v_stats.incorrect, 0),
        COALESCE(v_stats.pending, 0),
        COALESCE(v_stats.reputation_hits, 0),
        CASE WHEN v_stats.total > 0 THEN v_stats.reputation_hits::FLOAT / v_stats.total ELSE 0 END,
        COALESCE(v_stats.phishing_detected, 0),
        COALESCE(v_stats.avg_time, 0),
        COALESCE(v_stats.max_time, 0),
        COALESCE(v_stats.avg_confidence, 0),
        COALESCE(v_stats.low_confidence, 0)
    )
    ON CONFLICT (metric_date, user_id) DO UPDATE SET
        total_classifications = EXCLUDED.total_classifications,
        correct_classifications = EXCLUDED.correct_classifications,
        incorrect_classifications = EXCLUDED.incorrect_classifications,
        pending_feedback = EXCLUDED.pending_feedback,
        reputation_hit_count = EXCLUDED.reputation_hit_count,
        reputation_hit_rate = EXCLUDED.reputation_hit_rate,
        phishing_detected = EXCLUDED.phishing_detected,
        avg_processing_time_ms = EXCLUDED.avg_processing_time_ms,
        max_processing_time_ms = EXCLUDED.max_processing_time_ms,
        avg_confidence = EXCLUDED.avg_confidence,
        low_confidence_count = EXCLUDED.low_confidence_count,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. RLS POLICIES
-- =============================================

-- AI Classification Logs
ALTER TABLE ai_classification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own classification logs"
ON ai_classification_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own classification logs"
ON ai_classification_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own classification logs"
ON ai_classification_logs FOR UPDATE
USING (auth.uid() = user_id);

-- AI Metrics Daily
ALTER TABLE ai_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics or global"
ON ai_metrics_daily FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

-- Domain Reputation
ALTER TABLE domain_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domain reputation"
ON domain_reputation FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own domain reputation"
ON domain_reputation FOR ALL
USING (auth.uid() = user_id);

-- Email Action Logs
ALTER TABLE email_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own action logs"
ON email_action_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own action logs"
ON email_action_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- AI Settings
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings or global"
ON ai_settings FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can manage own settings"
ON ai_settings FOR ALL
USING (auth.uid() = user_id);

-- =============================================
-- 8. CRON JOB HELPER (Call từ API)
-- =============================================

-- Function để chạy daily aggregation cho tất cả users
CREATE OR REPLACE FUNCTION run_daily_metrics_aggregation(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER AS $$
DECLARE
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- Aggregate global metrics
    PERFORM aggregate_daily_ai_metrics(p_date, NULL);
    v_count := v_count + 1;

    -- Aggregate per-user metrics
    FOR v_user_id IN
        SELECT DISTINCT user_id FROM ai_classification_logs
        WHERE DATE(created_at) = p_date
    LOOP
        PERFORM aggregate_daily_ai_metrics(p_date, v_user_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
