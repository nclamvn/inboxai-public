-- =============================================
-- PHISHING DETECTION SYSTEM
-- =============================================

-- =============================================
-- 1. THÊM FIELDS VÀO BẢNG EMAILS
-- =============================================

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS phishing_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS phishing_risk TEXT DEFAULT 'safe',
ADD COLUMN IF NOT EXISTS phishing_reasons JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_phishing_reviewed BOOLEAN DEFAULT FALSE;

-- Constraint cho phishing_score (0-100)
ALTER TABLE emails
ADD CONSTRAINT check_phishing_score
CHECK (phishing_score >= 0 AND phishing_score <= 100);

-- Constraint cho phishing_risk
ALTER TABLE emails
ADD CONSTRAINT check_phishing_risk
CHECK (phishing_risk IN ('safe', 'low', 'medium', 'high', 'critical'));

-- Index cho query emails theo risk level
CREATE INDEX IF NOT EXISTS idx_emails_phishing_risk
ON emails(user_id, phishing_risk)
WHERE phishing_risk != 'safe';

-- Index cho query emails chưa review
CREATE INDEX IF NOT EXISTS idx_emails_phishing_unreviewed
ON emails(user_id, is_phishing_reviewed)
WHERE phishing_score >= 50 AND is_phishing_reviewed = FALSE;

-- =============================================
-- 2. BẢNG PHISHING PATTERNS
-- =============================================

CREATE TABLE IF NOT EXISTS phishing_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type TEXT NOT NULL,
    pattern_value TEXT NOT NULL,
    pattern_regex TEXT,
    severity INTEGER NOT NULL DEFAULT 10,
    description TEXT,
    description_vi TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(pattern_type, pattern_value)
);

-- Index cho lookup patterns
CREATE INDEX IF NOT EXISTS idx_phishing_patterns_type
ON phishing_patterns(pattern_type, is_active);

-- =============================================
-- 3. BẢNG PHISHING DOMAINS
-- =============================================

CREATE TABLE IF NOT EXISTS phishing_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL UNIQUE,
    is_blacklisted BOOLEAN DEFAULT TRUE,
    spoofed_from TEXT,
    threat_type TEXT,
    reported_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index cho lookup domain
CREATE INDEX IF NOT EXISTS idx_phishing_domains_lookup
ON phishing_domains(domain, is_blacklisted);

-- Index cho spoofed domains
CREATE INDEX IF NOT EXISTS idx_phishing_domains_spoofed
ON phishing_domains(spoofed_from)
WHERE spoofed_from IS NOT NULL;

-- =============================================
-- 4. BẢNG LEGITIMATE DOMAINS (Whitelist)
-- =============================================

CREATE TABLE IF NOT EXISTS legitimate_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL UNIQUE,
    organization TEXT,
    category TEXT,
    is_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index cho lookup
CREATE INDEX IF NOT EXISTS idx_legitimate_domains_lookup
ON legitimate_domains(domain, is_verified);

-- =============================================
-- 5. INSERT DEFAULT PATTERNS
-- =============================================

-- Urgency patterns (Vietnamese)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('urgency', 'khẩn cấp', 15, 'Urgency keyword', 'Từ khóa khẩn cấp'),
('urgency', 'gấp', 15, 'Urgency keyword', 'Từ khóa gấp'),
('urgency', 'ngay lập tức', 20, 'Immediate action required', 'Yêu cầu hành động ngay'),
('urgency', 'trong vòng 24 giờ', 15, 'Time pressure', 'Áp lực thời gian'),
('urgency', 'trong vòng 24h', 15, 'Time pressure', 'Áp lực thời gian'),
('urgency', 'hết hạn', 10, 'Expiration warning', 'Cảnh báo hết hạn'),
('urgency', 'sắp bị khóa', 25, 'Account lock threat', 'Đe dọa khóa tài khoản'),
('urgency', 'sẽ bị đình chỉ', 25, 'Suspension threat', 'Đe dọa đình chỉ')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Threat patterns (Vietnamese)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('threat', 'tài khoản bị khóa', 30, 'Account locked threat', 'Đe dọa tài khoản bị khóa'),
('threat', 'đã bị đình chỉ', 30, 'Account suspended', 'Tài khoản bị đình chỉ'),
('threat', 'giao dịch đáng ngờ', 20, 'Suspicious transaction', 'Giao dịch đáng ngờ'),
('threat', 'truy cập trái phép', 25, 'Unauthorized access', 'Truy cập trái phép'),
('threat', 'mất quyền truy cập', 25, 'Access loss threat', 'Đe dọa mất quyền truy cập'),
('threat', 'vi phạm bảo mật', 20, 'Security violation', 'Vi phạm bảo mật'),
('threat', 'phát hiện bất thường', 15, 'Anomaly detected', 'Phát hiện bất thường')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Request patterns (Vietnamese)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('request', 'xác minh tài khoản', 20, 'Account verification request', 'Yêu cầu xác minh tài khoản'),
('request', 'cập nhật thông tin', 15, 'Update info request', 'Yêu cầu cập nhật thông tin'),
('request', 'xác nhận danh tính', 20, 'Identity confirmation', 'Xác nhận danh tính'),
('request', 'nhập mã otp', 35, 'OTP request', 'Yêu cầu nhập mã OTP'),
('request', 'gửi mã xác nhận', 30, 'Send verification code', 'Gửi mã xác nhận'),
('request', 'cung cấp mật khẩu', 40, 'Password request', 'Yêu cầu cung cấp mật khẩu'),
('request', 'click vào link', 15, 'Click link request', 'Yêu cầu click vào link'),
('request', 'đăng nhập ngay', 20, 'Login now request', 'Yêu cầu đăng nhập ngay')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Prize scam patterns (Vietnamese)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('prize', 'trúng thưởng', 35, 'Prize winning', 'Trúng thưởng'),
('prize', 'được chọn ngẫu nhiên', 30, 'Randomly selected', 'Được chọn ngẫu nhiên'),
('prize', 'nhận thưởng', 30, 'Claim prize', 'Nhận thưởng'),
('prize', 'quà tặng miễn phí', 25, 'Free gift', 'Quà tặng miễn phí'),
('prize', 'voucher', 10, 'Voucher offer', 'Ưu đãi voucher'),
('prize', 'chiết khấu đặc biệt', 15, 'Special discount', 'Chiết khấu đặc biệt')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Financial patterns (Vietnamese)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('financial', 'chuyển tiền', 25, 'Money transfer', 'Chuyển tiền'),
('financial', 'thanh toán ngay', 20, 'Pay now', 'Thanh toán ngay'),
('financial', 'nợ quá hạn', 20, 'Overdue debt', 'Nợ quá hạn'),
('financial', 'hóa đơn chưa thanh toán', 15, 'Unpaid invoice', 'Hóa đơn chưa thanh toán'),
('financial', 'phí phạt', 20, 'Penalty fee', 'Phí phạt'),
('financial', 'hoàn tiền', 15, 'Refund', 'Hoàn tiền')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Urgency patterns (English)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('urgency', 'urgent', 15, 'Urgency keyword', 'Từ khóa khẩn cấp'),
('urgency', 'immediately', 20, 'Immediate action', 'Hành động ngay'),
('urgency', 'within 24 hours', 15, 'Time pressure', 'Áp lực thời gian'),
('urgency', 'act now', 20, 'Act now', 'Hành động ngay'),
('urgency', 'limited time', 15, 'Limited time', 'Thời gian có hạn'),
('urgency', 'expires soon', 15, 'Expiring soon', 'Sắp hết hạn')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- Threat patterns (English)
INSERT INTO phishing_patterns (pattern_type, pattern_value, severity, description, description_vi) VALUES
('threat', 'account suspended', 30, 'Account suspended', 'Tài khoản bị đình chỉ'),
('threat', 'account locked', 30, 'Account locked', 'Tài khoản bị khóa'),
('threat', 'unauthorized access', 25, 'Unauthorized access', 'Truy cập trái phép'),
('threat', 'security alert', 20, 'Security alert', 'Cảnh báo bảo mật'),
('threat', 'verify your identity', 20, 'Verify identity', 'Xác minh danh tính')
ON CONFLICT (pattern_type, pattern_value) DO NOTHING;

-- =============================================
-- 6. INSERT LEGITIMATE DOMAINS (Vietnamese Banks & Services)
-- =============================================

INSERT INTO legitimate_domains (domain, organization, category) VALUES
-- Vietnamese Banks
('vietcombank.com.vn', 'Vietcombank', 'bank'),
('vietinbank.vn', 'VietinBank', 'bank'),
('bidv.com.vn', 'BIDV', 'bank'),
('agribank.com.vn', 'Agribank', 'bank'),
('techcombank.com.vn', 'Techcombank', 'bank'),
('mbbank.com.vn', 'MB Bank', 'bank'),
('vpbank.com.vn', 'VPBank', 'bank'),
('acb.com.vn', 'ACB', 'bank'),
('sacombank.com.vn', 'Sacombank', 'bank'),
('hdbank.com.vn', 'HDBank', 'bank'),
('tpbank.vn', 'TPBank', 'bank'),
('ocb.com.vn', 'OCB', 'bank'),
('msb.com.vn', 'MSB', 'bank'),
('vib.com.vn', 'VIB', 'bank'),
('eximbank.com.vn', 'Eximbank', 'bank'),
('shb.com.vn', 'SHB', 'bank'),
('seabank.com.vn', 'SeABank', 'bank'),
-- E-wallets
('momo.vn', 'MoMo', 'ewallet'),
('zalopay.vn', 'ZaloPay', 'ewallet'),
('vnpay.vn', 'VNPay', 'ewallet'),
('shopeepay.vn', 'ShopeePay', 'ewallet'),
-- Government
('dichvucong.gov.vn', 'Dịch vụ công', 'government'),
('baohiemxahoi.gov.vn', 'BHXH', 'government'),
('gdt.gov.vn', 'Tổng cục thuế', 'government'),
-- Tech
('google.com', 'Google', 'tech'),
('microsoft.com', 'Microsoft', 'tech'),
('apple.com', 'Apple', 'tech'),
('facebook.com', 'Facebook', 'tech'),
('amazon.com', 'Amazon', 'tech')
ON CONFLICT (domain) DO NOTHING;

-- =============================================
-- 7. INSERT KNOWN PHISHING DOMAINS
-- =============================================

INSERT INTO phishing_domains (domain, spoofed_from, threat_type, notes) VALUES
-- Spoofed bank domains (examples)
('vietcombank-verify.com', 'vietcombank.com.vn', 'bank_spoof', 'Fake Vietcombank'),
('vietc0mbank.com', 'vietcombank.com.vn', 'bank_spoof', 'Typosquatting - 0 thay o'),
('vietcombank-security.net', 'vietcombank.com.vn', 'bank_spoof', 'Fake security page'),
('techcombank-online.com', 'techcombank.com.vn', 'bank_spoof', 'Fake Techcombank'),
('bidv-verify.com', 'bidv.com.vn', 'bank_spoof', 'Fake BIDV'),
('mb-bank.net', 'mbbank.com.vn', 'bank_spoof', 'Fake MB Bank'),
-- Common phishing TLDs
('secure-banking.xyz', NULL, 'generic_phishing', 'Suspicious TLD'),
('account-verify.top', NULL, 'generic_phishing', 'Suspicious TLD'),
('login-secure.click', NULL, 'generic_phishing', 'Suspicious TLD')
ON CONFLICT (domain) DO NOTHING;

-- =============================================
-- 8. RLS POLICIES
-- =============================================

-- Phishing patterns: readable by all authenticated users
ALTER TABLE phishing_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read phishing patterns"
ON phishing_patterns FOR SELECT
TO authenticated
USING (true);

-- Phishing domains: readable by all authenticated users
ALTER TABLE phishing_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read phishing domains"
ON phishing_domains FOR SELECT
TO authenticated
USING (true);

-- Legitimate domains: readable by all authenticated users
ALTER TABLE legitimate_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read legitimate domains"
ON legitimate_domains FOR SELECT
TO authenticated
USING (true);

-- =============================================
-- 9. FUNCTION: Calculate phishing risk level
-- =============================================

CREATE OR REPLACE FUNCTION get_phishing_risk_level(score INTEGER)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN score >= 80 THEN 'critical'
        WHEN score >= 60 THEN 'high'
        WHEN score >= 40 THEN 'medium'
        WHEN score >= 20 THEN 'low'
        ELSE 'safe'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- 10. TRIGGER: Auto-update phishing_risk
-- =============================================

CREATE OR REPLACE FUNCTION update_phishing_risk()
RETURNS TRIGGER AS $$
BEGIN
    NEW.phishing_risk := get_phishing_risk_level(NEW.phishing_score);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_phishing_risk ON emails;

CREATE TRIGGER trigger_update_phishing_risk
BEFORE INSERT OR UPDATE OF phishing_score ON emails
FOR EACH ROW
EXECUTE FUNCTION update_phishing_risk();
