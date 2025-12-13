-- =============================================
-- SMART AI FEATURES ALLOCATION SYSTEM
-- =============================================

-- =============================================
-- 1. BANG AI FEATURE DEFINITIONS
-- =============================================

CREATE TABLE IF NOT EXISTS ai_feature_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key TEXT NOT NULL UNIQUE,
    feature_name TEXT NOT NULL,
    feature_name_vi TEXT NOT NULL,
    description TEXT,
    description_vi TEXT,
    api_cost_estimate DECIMAL(10, 6) DEFAULT 0.001,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default features
INSERT INTO ai_feature_definitions (feature_key, feature_name, feature_name_vi, description, description_vi, api_cost_estimate) VALUES
('classification', 'Classification', 'Phan loai', 'Classify email into categories', 'Phan loai email vao cac nhom', 0.001),
('summary', 'AI Summary', 'Tom tat AI', 'Summarize email content', 'Tom tat noi dung email', 0.002),
('smart_reply', 'Smart Reply', 'Goi y tra loi', 'Generate reply suggestions', 'Tao goi y cau tra loi', 0.005),
('action_items', 'Action Items', 'Cong viec can lam', 'Extract tasks and deadlines', 'Trich xuat cong viec va deadline', 0.002),
('follow_up', 'Follow-up Detection', 'Phat hien Follow-up', 'Detect emails needing follow-up', 'Phat hien email can theo doi', 0.001),
('sentiment', 'Sentiment Analysis', 'Phan tich cam xuc', 'Analyze email tone and sentiment', 'Phan tich tone va cam xuc', 0.001),
('translate', 'Translation', 'Dich thuat', 'Translate email content', 'Dich noi dung email', 0.003)
ON CONFLICT (feature_key) DO NOTHING;

-- =============================================
-- 2. BANG AI FEATURE CONFIG (Default by category)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_feature_defaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    feature_key TEXT NOT NULL REFERENCES ai_feature_definitions(feature_key),

    -- Behavior settings
    auto_enabled BOOLEAN DEFAULT FALSE,
    auto_condition TEXT, -- 'always', 'long_email', 'has_attachment', 'high_priority', NULL
    button_visible BOOLEAN DEFAULT TRUE,
    button_label TEXT,
    button_label_vi TEXT,

    -- Priority override
    min_priority_for_auto INTEGER DEFAULT 1, -- Auto enable if priority >= this

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(category, feature_key)
);

-- Insert default configurations
-- WORK category - Full AI power
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('work', 'summary', TRUE, 'always', TRUE, 1),
('work', 'smart_reply', TRUE, 'always', TRUE, 1),
('work', 'action_items', TRUE, 'always', TRUE, 1),
('work', 'follow_up', TRUE, 'always', TRUE, 1),
('work', 'sentiment', FALSE, NULL, TRUE, 4),
('work', 'translate', FALSE, NULL, TRUE, 1)
ON CONFLICT (category, feature_key) DO NOTHING;

-- PERSONAL category - Selective AI
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('personal', 'summary', FALSE, 'long_email', TRUE, 3),
('personal', 'smart_reply', FALSE, NULL, TRUE, 4),
('personal', 'action_items', FALSE, NULL, FALSE, 5),
('personal', 'follow_up', FALSE, NULL, TRUE, 4),
('personal', 'sentiment', FALSE, NULL, TRUE, 5),
('personal', 'translate', FALSE, NULL, TRUE, 1)
ON CONFLICT (category, feature_key) DO NOTHING;

-- TRANSACTION category - Essential AI
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('transaction', 'summary', TRUE, 'always', TRUE, 1),
('transaction', 'smart_reply', FALSE, NULL, FALSE, 5),
('transaction', 'action_items', TRUE, 'always', TRUE, 1),
('transaction', 'follow_up', FALSE, NULL, FALSE, 5),
('transaction', 'sentiment', FALSE, NULL, FALSE, 5),
('transaction', 'translate', FALSE, NULL, TRUE, 1)
ON CONFLICT (category, feature_key) DO NOTHING;

-- NEWSLETTER category - Summary only
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('newsletter', 'summary', TRUE, 'always', TRUE, 1),
('newsletter', 'smart_reply', FALSE, NULL, FALSE, 5),
('newsletter', 'action_items', FALSE, NULL, FALSE, 5),
('newsletter', 'follow_up', FALSE, NULL, FALSE, 5),
('newsletter', 'sentiment', FALSE, NULL, FALSE, 5),
('newsletter', 'translate', FALSE, NULL, TRUE, 1)
ON CONFLICT (category, feature_key) DO NOTHING;

-- PROMOTION category - Minimal AI
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('promotion', 'summary', FALSE, NULL, TRUE, 5),
('promotion', 'smart_reply', FALSE, NULL, FALSE, 5),
('promotion', 'action_items', FALSE, NULL, FALSE, 5),
('promotion', 'follow_up', FALSE, NULL, FALSE, 5),
('promotion', 'sentiment', FALSE, NULL, FALSE, 5),
('promotion', 'translate', FALSE, NULL, TRUE, 5)
ON CONFLICT (category, feature_key) DO NOTHING;

-- SOCIAL category - Minimal AI
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('social', 'summary', FALSE, 'long_email', TRUE, 4),
('social', 'smart_reply', FALSE, NULL, FALSE, 5),
('social', 'action_items', FALSE, NULL, FALSE, 5),
('social', 'follow_up', FALSE, NULL, FALSE, 5),
('social', 'sentiment', FALSE, NULL, FALSE, 5),
('social', 'translate', FALSE, NULL, TRUE, 5)
ON CONFLICT (category, feature_key) DO NOTHING;

-- SPAM category - No AI
INSERT INTO ai_feature_defaults (category, feature_key, auto_enabled, auto_condition, button_visible, min_priority_for_auto) VALUES
('spam', 'summary', FALSE, NULL, FALSE, 5),
('spam', 'smart_reply', FALSE, NULL, FALSE, 5),
('spam', 'action_items', FALSE, NULL, FALSE, 5),
('spam', 'follow_up', FALSE, NULL, FALSE, 5),
('spam', 'sentiment', FALSE, NULL, FALSE, 5),
('spam', 'translate', FALSE, NULL, FALSE, 5)
ON CONFLICT (category, feature_key) DO NOTHING;

-- =============================================
-- 3. BANG USER AI FEATURE OVERRIDES
-- =============================================

CREATE TABLE IF NOT EXISTS ai_feature_user_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Can override per category
    category TEXT,
    feature_key TEXT NOT NULL REFERENCES ai_feature_definitions(feature_key),

    -- Override settings
    auto_enabled BOOLEAN,
    button_visible BOOLEAN,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique: user can have one override per category+feature
    UNIQUE(user_id, category, feature_key)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ai_feature_user_config_lookup
ON ai_feature_user_config(user_id, category);

-- =============================================
-- 4. BANG VIP SENDERS (Always full AI)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_vip_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    sender_email TEXT, -- Specific email
    sender_domain TEXT, -- Or entire domain

    -- Settings
    enable_all_ai BOOLEAN DEFAULT TRUE,
    priority_boost INTEGER DEFAULT 1, -- Add to detected priority
    notify_on_receive BOOLEAN DEFAULT FALSE,

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- At least one must be set
    CONSTRAINT vip_sender_check CHECK (sender_email IS NOT NULL OR sender_domain IS NOT NULL)
);

-- Unique indexes (separate for nullable columns)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_vip_senders_email
ON ai_vip_senders(user_id, sender_email) WHERE sender_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_vip_senders_domain
ON ai_vip_senders(user_id, sender_domain) WHERE sender_domain IS NOT NULL;

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_ai_vip_senders_lookup
ON ai_vip_senders(user_id, sender_email, sender_domain);

-- =============================================
-- 5. BANG CONTENT TRIGGER RULES
-- =============================================

CREATE TABLE IF NOT EXISTS ai_content_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Can be global or user-specific
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    trigger_name TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'keyword', 'regex', 'has_attachment', 'email_length', 'has_money', 'has_deadline'
    trigger_value TEXT, -- keyword, regex pattern, or threshold

    -- Action when triggered
    enable_features TEXT[] DEFAULT '{}', -- Array of feature_keys to enable
    priority_boost INTEGER DEFAULT 0,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for user triggers
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_content_triggers_unique
ON ai_content_triggers(COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), trigger_name);

-- Insert default global triggers
INSERT INTO ai_content_triggers (user_id, trigger_name, trigger_type, trigger_value, enable_features, priority_boost) VALUES
-- Deadline keywords
(NULL, 'deadline_vi', 'keyword', 'deadline,han chot,truoc ngay,due date,het han', ARRAY['action_items', 'follow_up'], 1),
(NULL, 'urgent_vi', 'keyword', 'gap,khan,urgent,asap,ngay lap tuc,khan cap', ARRAY['summary', 'action_items', 'smart_reply'], 2),

-- Meeting keywords
(NULL, 'meeting_vi', 'keyword', 'hop,meeting,call,zoom,google meet,teams,cuoc hop', ARRAY['action_items', 'follow_up'], 1),

-- Content-based triggers
(NULL, 'long_email', 'email_length', '500', ARRAY['summary'], 0),
(NULL, 'has_attachment', 'has_attachment', 'true', ARRAY['summary', 'action_items'], 0),
(NULL, 'has_money', 'has_money', 'true', ARRAY['action_items'], 0),
(NULL, 'has_question', 'keyword', 'khong biet,co the,xin hoi,cho hoi', ARRAY['smart_reply'], 0)
ON CONFLICT DO NOTHING;

-- =============================================
-- 6. BANG AI FEATURE USAGE TRACKING
-- =============================================

CREATE TABLE IF NOT EXISTS ai_feature_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

    feature_key TEXT NOT NULL REFERENCES ai_feature_definitions(feature_key),

    -- Trigger info
    trigger_type TEXT NOT NULL, -- 'auto', 'manual', 'vip_sender', 'content_trigger', 'priority_override'
    trigger_reason TEXT, -- More details about why it was triggered

    -- Cost tracking
    api_cost_usd DECIMAL(10, 6) DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,

    -- Timing
    processing_time_ms INTEGER,

    -- Result (optional, for analytics)
    was_useful BOOLEAN, -- User feedback

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_ai_feature_usage_user_date
ON ai_feature_usage(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feature_usage_feature
ON ai_feature_usage(feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feature_usage_email
ON ai_feature_usage(email_id);

-- =============================================
-- 7. BANG AI COST SUMMARY (Daily aggregation)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_cost_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    cost_date DATE NOT NULL,

    -- Usage counts
    total_emails_processed INTEGER DEFAULT 0,

    -- Feature usage counts
    summary_auto_count INTEGER DEFAULT 0,
    summary_manual_count INTEGER DEFAULT 0,
    smart_reply_auto_count INTEGER DEFAULT 0,
    smart_reply_manual_count INTEGER DEFAULT 0,
    action_items_auto_count INTEGER DEFAULT 0,
    action_items_manual_count INTEGER DEFAULT 0,
    follow_up_auto_count INTEGER DEFAULT 0,
    follow_up_manual_count INTEGER DEFAULT 0,
    sentiment_count INTEGER DEFAULT 0,
    translate_count INTEGER DEFAULT 0,

    -- Cost breakdown
    total_cost_usd DECIMAL(10, 6) DEFAULT 0,
    cost_by_feature JSONB DEFAULT '{}'::jsonb,

    -- Category breakdown
    cost_by_category JSONB DEFAULT '{}'::jsonb,

    -- Savings estimate
    estimated_full_cost_usd DECIMAL(10, 6) DEFAULT 0, -- If all features were auto
    savings_usd DECIMAL(10, 6) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, cost_date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ai_cost_daily_lookup
ON ai_cost_daily(user_id, cost_date DESC);

-- =============================================
-- 8. THEM FIELDS VAO BANG EMAILS
-- =============================================

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS ai_features_enabled TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_features_available TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_features_used TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_total_cost_usd DECIMAL(10, 6) DEFAULT 0;

-- =============================================
-- 9. FUNCTIONS
-- =============================================

-- Function: Get effective feature config for an email
CREATE OR REPLACE FUNCTION get_ai_features_for_email(
    p_user_id UUID,
    p_category TEXT,
    p_priority INTEGER,
    p_sender_email TEXT,
    p_word_count INTEGER DEFAULT 0,
    p_has_attachment BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    feature_key TEXT,
    is_auto_enabled BOOLEAN,
    is_button_visible BOOLEAN,
    trigger_reason TEXT
) AS $$
DECLARE
    v_sender_domain TEXT;
    v_is_vip BOOLEAN := FALSE;
BEGIN
    -- Extract domain from email
    v_sender_domain := split_part(p_sender_email, '@', 2);

    -- Check if VIP sender
    SELECT TRUE INTO v_is_vip
    FROM ai_vip_senders
    WHERE user_id = p_user_id
    AND (sender_email = p_sender_email OR sender_domain = v_sender_domain)
    AND enable_all_ai = TRUE
    LIMIT 1;

    RETURN QUERY
    SELECT
        fd.feature_key,
        CASE
            -- VIP sender: enable all
            WHEN v_is_vip THEN TRUE
            -- Priority override
            WHEN p_priority >= COALESCE(def.min_priority_for_auto, 5) THEN TRUE
            -- User override
            WHEN uc.auto_enabled IS NOT NULL THEN uc.auto_enabled
            -- Conditional auto (long email)
            WHEN def.auto_condition = 'long_email' AND p_word_count >= 500 THEN TRUE
            -- Conditional auto (has attachment)
            WHEN def.auto_condition = 'has_attachment' AND p_has_attachment THEN TRUE
            -- Default
            ELSE COALESCE(def.auto_enabled, FALSE)
        END as is_auto_enabled,
        CASE
            -- User override
            WHEN uc.button_visible IS NOT NULL THEN uc.button_visible
            -- Default
            ELSE COALESCE(def.button_visible, TRUE)
        END as is_button_visible,
        CASE
            WHEN v_is_vip THEN 'vip_sender'
            WHEN p_priority >= COALESCE(def.min_priority_for_auto, 5) THEN 'priority_' || p_priority
            WHEN def.auto_condition = 'long_email' AND p_word_count >= 500 THEN 'long_email'
            WHEN def.auto_condition = 'has_attachment' AND p_has_attachment THEN 'has_attachment'
            WHEN def.auto_enabled THEN 'auto_default'
            ELSE NULL
        END as trigger_reason
    FROM ai_feature_definitions fd
    LEFT JOIN ai_feature_defaults def
        ON def.feature_key = fd.feature_key
        AND def.category = p_category
    LEFT JOIN ai_feature_user_config uc
        ON uc.user_id = p_user_id
        AND uc.feature_key = fd.feature_key
        AND (uc.category = p_category OR uc.category IS NULL)
    WHERE fd.is_active = TRUE
    ORDER BY fd.feature_key;
END;
$$ LANGUAGE plpgsql;

-- Function: Aggregate daily costs
CREATE OR REPLACE FUNCTION aggregate_ai_daily_costs(p_date DATE, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ai_cost_daily (
        user_id, cost_date,
        total_emails_processed,
        summary_auto_count, summary_manual_count,
        smart_reply_auto_count, smart_reply_manual_count,
        action_items_auto_count, action_items_manual_count,
        follow_up_auto_count, follow_up_manual_count,
        sentiment_count, translate_count,
        total_cost_usd, cost_by_feature
    )
    SELECT
        p_user_id,
        p_date,
        COUNT(DISTINCT email_id),
        COUNT(*) FILTER (WHERE feature_key = 'summary' AND trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE feature_key = 'summary' AND trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE feature_key = 'smart_reply' AND trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE feature_key = 'smart_reply' AND trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE feature_key = 'action_items' AND trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE feature_key = 'action_items' AND trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE feature_key = 'follow_up' AND trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE feature_key = 'follow_up' AND trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE feature_key = 'sentiment'),
        COUNT(*) FILTER (WHERE feature_key = 'translate'),
        COALESCE(SUM(api_cost_usd), 0),
        COALESCE(
            (SELECT jsonb_object_agg(fc.feature_key, fc.feature_cost)
             FROM (
                SELECT afu.feature_key, SUM(afu.api_cost_usd) as feature_cost
                FROM ai_feature_usage afu
                WHERE afu.user_id = p_user_id AND DATE(afu.created_at) = p_date
                GROUP BY afu.feature_key
             ) fc),
            '{}'::jsonb
        )
    FROM ai_feature_usage
    WHERE user_id = p_user_id AND DATE(created_at) = p_date
    GROUP BY 1, 2
    ON CONFLICT (user_id, cost_date) DO UPDATE SET
        total_emails_processed = EXCLUDED.total_emails_processed,
        summary_auto_count = EXCLUDED.summary_auto_count,
        summary_manual_count = EXCLUDED.summary_manual_count,
        smart_reply_auto_count = EXCLUDED.smart_reply_auto_count,
        smart_reply_manual_count = EXCLUDED.smart_reply_manual_count,
        action_items_auto_count = EXCLUDED.action_items_auto_count,
        action_items_manual_count = EXCLUDED.action_items_manual_count,
        follow_up_auto_count = EXCLUDED.follow_up_auto_count,
        follow_up_manual_count = EXCLUDED.follow_up_manual_count,
        sentiment_count = EXCLUDED.sentiment_count,
        translate_count = EXCLUDED.translate_count,
        total_cost_usd = EXCLUDED.total_cost_usd,
        cost_by_feature = EXCLUDED.cost_by_feature,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 10. RLS POLICIES
-- =============================================

-- Feature definitions: readable by all
ALTER TABLE ai_feature_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read feature definitions" ON ai_feature_definitions;
CREATE POLICY "Anyone can read feature definitions"
ON ai_feature_definitions FOR SELECT TO authenticated USING (true);

-- Feature defaults: readable by all
ALTER TABLE ai_feature_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read feature defaults" ON ai_feature_defaults;
CREATE POLICY "Anyone can read feature defaults"
ON ai_feature_defaults FOR SELECT TO authenticated USING (true);

-- User config: own data only
ALTER TABLE ai_feature_user_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own config" ON ai_feature_user_config;
CREATE POLICY "Users can manage own config"
ON ai_feature_user_config FOR ALL USING (auth.uid() = user_id);

-- VIP senders: own data only
ALTER TABLE ai_vip_senders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own VIP senders" ON ai_vip_senders;
CREATE POLICY "Users can manage own VIP senders"
ON ai_vip_senders FOR ALL USING (auth.uid() = user_id);

-- Content triggers: own or global
ALTER TABLE ai_content_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read global or own triggers" ON ai_content_triggers;
CREATE POLICY "Users can read global or own triggers"
ON ai_content_triggers FOR SELECT
USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own triggers" ON ai_content_triggers;
CREATE POLICY "Users can manage own triggers"
ON ai_content_triggers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own triggers"
ON ai_content_triggers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own triggers"
ON ai_content_triggers FOR DELETE
USING (auth.uid() = user_id);

-- Feature usage: own data only
ALTER TABLE ai_feature_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own usage" ON ai_feature_usage;
CREATE POLICY "Users can manage own usage"
ON ai_feature_usage FOR ALL USING (auth.uid() = user_id);

-- Cost daily: own data only
ALTER TABLE ai_cost_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own costs" ON ai_cost_daily;
CREATE POLICY "Users can view own costs"
ON ai_cost_daily FOR SELECT USING (auth.uid() = user_id);
