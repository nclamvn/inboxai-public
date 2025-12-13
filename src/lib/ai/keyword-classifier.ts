// Vietnamese + English keywords for each category
// Weight: high = 3 points, medium = 1 point

export const CATEGORY_KEYWORDS = {
  transaction: {
    high: [
      // Vietnamese banking
      'biến động số dư', 'giao dịch thành công', 'chuyển khoản',
      'thanh toán', 'hóa đơn', 'đơn hàng', 'xác nhận đặt hàng',
      'mã otp', 'mã xác nhận', 'số dư tài khoản', 'rút tiền',
      'nạp tiền', 'hoàn tiền', 'đã giao hàng', 'đang vận chuyển',
      'vé điện tử', 'e-ticket', 'booking confirmation',
      'xác nhận booking', 'mã đặt chỗ', 'thông báo giao dịch',
      'giao dịch số', 'stk:', 'số tk', 'số tài khoản',
      'chuyển tiền', 'nhận tiền', 'thẻ tín dụng', 'thẻ ghi nợ',
      'biên nhận', 'phiếu thu', 'hóa đơn điện tử',
      // English banking
      'transaction', 'payment received', 'order confirmed',
      'invoice', 'receipt', 'bank statement', 'wire transfer',
      'otp', 'verification code', 'your order', 'shipment',
      'delivery', 'tracking number', 'e-ticket', 'booking ref',
      'payment confirmation', 'order status', 'shipped',
      'account balance', 'withdrawal', 'deposit',
      'credit card', 'debit card', 'card ending in',
    ],
    medium: [
      'tài khoản', 'ngân hàng', 'account', 'balance',
      'credit', 'debit', 'amount', 'vnd', 'usd', 'đồng',
      'giao hàng', 'vận chuyển', 'shipping', 'delivery',
      'đặt hàng', 'order', 'purchase', 'mua',
    ],
  },

  work: {
    high: [
      // Vietnamese work
      'công việc', 'dự án', 'deadline', 'họp', 'meeting',
      'báo cáo', 'kế hoạch', 'phê duyệt', 'xin nghỉ phép',
      'hợp đồng', 'đề xuất', 'proposal', 'review',
      'task', 'sprint', 'jira', 'trello', 'slack',
      'nhiệm vụ', 'tiến độ', 'kết quả', 'mục tiêu',
      'phòng ban', 'nhân sự', 'tuyển dụng', 'cv',
      'phỏng vấn', 'offer', 'tăng lương', 'đánh giá',
      'quý', 'q1', 'q2', 'q3', 'q4', 'fy2024', 'fy2025',
      'kpi', 'okr', 'target', 'revenue', 'profit',
      // English work
      'project', 'deadline', 'meeting', 'report', 'quarterly',
      'presentation', 'schedule', 'agenda', 'memo', 'approval',
      'review', 'feedback', 'team', 'client', 'stakeholder',
      'sprint planning', 'standup', 'retrospective',
      'milestone', 'deliverable', 'requirement', 'spec',
      'budget', 'forecast', 'pipeline', 'roadmap',
    ],
    medium: [
      'attached', 'đính kèm', 'please review', 'xin xem',
      'follow up', 'update', 'status', 'progress',
      'fyi', 'urgent', 'asap', 'eod', 'eow',
      'cc:', 'bcc:', 're:', 'fw:',
    ],
  },

  personal: {
    high: [
      // Vietnamese personal
      'chúc mừng sinh nhật', 'happy birthday', 'hẹn gặp',
      'nhớ bạn', 'miss you', 'gia đình', 'family',
      'bạn thân', 'anh/chị/em', 'con', 'bố/mẹ',
      'cuối tuần', 'weekend', 'café', 'dinner',
      'đám cưới', 'wedding', 'party', 'tiệc',
      'du lịch', 'vacation', 'holiday', 'trip',
      'kỷ niệm', 'anniversary', 'valentine',
      // English personal
      'birthday', 'congratulations', 'wedding', 'party',
      'vacation', 'holiday', 'trip', 'photos', 'memories',
      'catching up', 'long time', 'miss you',
      'family', 'kids', 'parents', 'reunion',
    ],
    medium: [
      'hi', 'hello', 'hey', 'chào', 'ơi',
      'how are you', 'khỏe không', 'lâu rồi',
      'what\'s up', 'hows it going', 'dear friend',
    ],
  },

  newsletter: {
    high: [
      // Newsletter patterns
      'weekly digest', 'daily roundup', 'monthly update',
      'bản tin', 'newsletter', 'digest', 'roundup',
      'top stories', 'this week in', 'đọc thêm',
      'unsubscribe', 'hủy đăng ký', 'email preferences',
      'view in browser', 'xem trên trình duyệt',
      'weekly newsletter', 'daily brief', 'morning edition',
      'tin tức tuần', 'tin tức ngày', 'cập nhật hàng tuần',
      'edition #', 'issue #', 'vol.',
    ],
    medium: [
      'edition', 'curated', 'trending', 'featured',
      'spotlight', 'roundup', 'summary', 'highlights',
      'top picks', 'editor\'s choice', 'recommended',
    ],
  },

  promotion: {
    high: [
      // Vietnamese promo
      'giảm giá', 'khuyến mãi', 'sale', 'flash sale',
      'mã giảm giá', 'voucher', 'coupon', 'ưu đãi',
      'miễn phí vận chuyển', 'free ship', 'deal hot',
      'chỉ hôm nay', 'có hạn', 'số lượng có hạn',
      'giảm ngay', 'tiết kiệm', 'giá sốc', 'giá rẻ',
      'mua 1 tặng 1', 'buy 1 get 1', 'combo',
      'siêu sale', 'mega sale', 'black friday',
      'double day', '11.11', '12.12', 'clearance',
      // English promo
      'discount', '% off', 'promotion', 'special offer',
      'limited time', 'exclusive', 'save', 'deal',
      'free shipping', 'buy now', 'shop now', 'claim',
      'don\'t miss', 'last chance', 'hurry', 'ends soon',
      'best price', 'lowest price', 'price drop',
    ],
    medium: [
      'new arrival', 'hàng mới', 'collection', 'best seller',
      'hot deal', 'trending', 'popular', 'recommended',
      'special', 'exclusive', 'limited', 'premium',
    ],
  },

  social: {
    high: [
      // Social notifications
      'đã thích', 'đã bình luận', 'đã tag bạn',
      'liked your', 'commented on', 'tagged you',
      'friend request', 'lời mời kết bạn',
      'mentioned you', 'nhắc đến bạn',
      'new follower', 'người theo dõi mới',
      'new message', 'tin nhắn mới',
      'invitation to connect', 'connection request',
      'someone viewed', 'profile view',
    ],
    medium: [
      'facebook', 'instagram', 'twitter', 'linkedin',
      'tiktok', 'youtube', 'zalo', 'notification',
      'activity', 'update from', 'new post',
    ],
  },

  spam: {
    high: [
      // Vietnamese spam
      'trúng thưởng', 'bạn được chọn', 'nhận ngay',
      'kiếm tiền online', 'thu nhập thụ động', 'làm giàu',
      'giảm cân', 'tăng cường sinh lý', 'đặc trị',
      'tài khoản bị khóa', 'xác minh ngay',
      'click ngay', 'hành động ngay', 'khẩn cấp',
      'triệu đồng', 'tỷ đồng', 'trúng giải',
      // English spam
      'you won', 'congratulations winner', 'claim your prize',
      'act now', 'urgent action required', 'account suspended',
      'lottery', 'million dollars', 'inheritance',
      'click here immediately', 'verify your account',
      'nigerian prince', 'wire transfer', 'bitcoin opportunity',
      'make money fast', 'get rich quick', 'work from home',
      'no experience needed', 'guaranteed income',
      'free money', 'cash prize', 'selected winner',
      'limited offer', 'act immediately', 'expire soon',
    ],
    medium: [
      'make money', 'work from home', 'no experience needed',
      'guaranteed', '100% free', 'risk-free',
      'amazing opportunity', 'incredible deal',
      'too good to be true', 'secret method',
    ],
  },
}

// Subject line patterns for quick classification
export const SUBJECT_PATTERNS = {
  transaction: [
    /\botp\b/i,
    /mã xác nh[aậ]n/i,
    /bi[ếe]n đ[oộ]ng s[oố] d[uư]/i,
    /giao d[iị]ch/i,
    /chuy[eể]n kho[aả]n/i,
    /thanh to[aá]n/i,
    /đ[oơ]n h[aà]ng/i,
    /order\s*(#|confirmation|status)/i,
    /invoice\s*#/i,
    /receipt/i,
    /booking\s*(confirmation|ref|#)/i,
    /delivery\s*(confirmation|update|status)/i,
    /shipment/i,
    /tracking/i,
    /payment\s*(received|confirmation|successful)/i,
    /verification\s*code/i,
  ],
  work: [
    /\[.*?(jira|task|bug|issue).*?\]/i,
    /re:\s*\[/i,
    /meeting\s*(invite|request|update)/i,
    /deadline/i,
    /sprint/i,
    /review\s*(request|needed)/i,
    /action\s*required/i,
    /for\s*your\s*(review|approval)/i,
    /status\s*update/i,
    /weekly\s*report/i,
    /q[1-4]\s*(update|report|review)/i,
  ],
  newsletter: [
    /weekly\s*(digest|roundup|brief)/i,
    /daily\s*(digest|brief|update)/i,
    /newsletter/i,
    /issue\s*#?\d+/i,
    /edition\s*#?\d+/i,
    /vol\.\s*\d+/i,
    /this\s*week\s*in/i,
    /top\s*stories/i,
    /\bdigest\b/i,
  ],
  promotion: [
    /\d+%\s*(off|gi[aả]m)/i,
    /sale\b/i,
    /flash\s*sale/i,
    /deal\s*(hot|đặc biệt)/i,
    /khuy[eế]n\s*m[aã]i/i,
    /voucher/i,
    /coupon/i,
    /free\s*shipping/i,
    /limited\s*time/i,
    /last\s*chance/i,
    /don\'?t\s*miss/i,
  ],
  spam: [
    /you\s*(won|have\s*been\s*selected)/i,
    /claim\s*(your|now)/i,
    /urgent\s*action/i,
    /account\s*(suspended|locked|verify)/i,
    /\$\d+[,\d]*\s*(million|prize|won)/i,
    /congratulations\s*winner/i,
    /act\s*now/i,
    /100%\s*free/i,
    /guaranteed/i,
    /click\s*(here\s*)?immediately/i,
  ],
}

export interface KeywordScores {
  transaction: number
  work: number
  personal: number
  newsletter: number
  promotion: number
  social: number
  spam: number
}

/**
 * Calculate keyword scores for each category
 */
export function calculateKeywordScores(
  subject: string,
  bodyText: string,
  fromAddress: string
): KeywordScores {
  const text = `${subject} ${bodyText} ${fromAddress}`.toLowerCase()
  const subjectLower = subject.toLowerCase()

  const scores: KeywordScores = {
    transaction: 0,
    work: 0,
    personal: 0,
    newsletter: 0,
    promotion: 0,
    social: 0,
    spam: 0,
  }

  // Check keywords in text
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const cat = category as keyof KeywordScores

    // High weight keywords
    for (const keyword of keywords.high) {
      if (text.includes(keyword.toLowerCase())) {
        scores[cat] += 3
      }
    }

    // Medium weight keywords
    for (const keyword of keywords.medium) {
      if (text.includes(keyword.toLowerCase())) {
        scores[cat] += 1
      }
    }
  }

  // Check subject patterns (bonus points for subject matches)
  for (const [category, patterns] of Object.entries(SUBJECT_PATTERNS)) {
    const cat = category as keyof KeywordScores
    for (const pattern of patterns) {
      if (pattern.test(subjectLower)) {
        scores[cat] += 4 // Subject matches are strong signals
      }
    }
  }

  return scores
}

/**
 * Get the top scoring category from keyword analysis
 */
export function getTopKeywordCategory(scores: KeywordScores): {
  category: keyof KeywordScores
  score: number
  confidence: number
} {
  const entries = Object.entries(scores) as [keyof KeywordScores, number][]
  const sorted = entries.sort(([, a], [, b]) => b - a)

  const [topCategory, topScore] = sorted[0]
  const [, secondScore] = sorted[1] || ['', 0]

  // Calculate confidence based on score difference
  let confidence = 0
  if (topScore > 0) {
    // Higher score and larger gap = more confidence
    const gap = topScore - secondScore
    confidence = Math.min(0.95, (topScore / 15) * 0.5 + (gap / topScore) * 0.5)
  }

  return {
    category: topCategory,
    score: topScore,
    confidence,
  }
}

/**
 * Quick keyword-based classification (fast, for pre-filtering)
 */
export function quickKeywordClassify(
  subject: string,
  bodyText: string,
  fromAddress: string
): {
  suggestedCategory: keyof KeywordScores | null
  confidence: number
  scores: KeywordScores
} {
  const scores = calculateKeywordScores(subject, bodyText, fromAddress)
  const top = getTopKeywordCategory(scores)

  // Only return if confidence is reasonable
  if (top.score >= 6 && top.confidence >= 0.4) {
    return {
      suggestedCategory: top.category,
      confidence: top.confidence,
      scores,
    }
  }

  return {
    suggestedCategory: null,
    confidence: 0,
    scores,
  }
}
