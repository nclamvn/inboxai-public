import OpenAI from 'openai'
import type { AIClassification, Priority, Category } from '@/types'
import {
  getSenderTrust,
  calculateTrustScore,
  extractEmailSignals,
  isSameDomain,
  type SenderTrust
} from './sender-trust'
import {
  getDomainCategory,
  getEmailPatternHint,
  VIETNAMESE_DOMAINS
} from './vietnamese-domains'
import {
  calculateKeywordScores,
  getTopKeywordCategory,
  type KeywordScores
} from './keyword-classifier'
import {
  determinePriority,
  extractDeadline,
  needsReply,
  suggestAction
} from './priority-rules'
import { applyLearnedRules } from './feedback-learner'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

// Simplified prompt focused on category + confidence
const CLASSIFICATION_PROMPT = `Bạn là AI phân loại email cho người dùng Việt Nam.

PHÂN LOẠI VÀO 1 TRONG CÁC NHÃN:
- work: email công việc, từ đồng nghiệp, khách hàng, dự án
- personal: email cá nhân, bạn bè, gia đình
- transaction: xác nhận đơn hàng, hóa đơn, ngân hàng, OTP, booking
- newsletter: bản tin đã đăng ký, digest, weekly/daily updates
- promotion: khuyến mãi, marketing, quảng cáo, sale
- social: thông báo mạng xã hội (Facebook, LinkedIn, etc.)
- spam: spam, scam, không mong muốn

QUY TẮC QUAN TRỌNG:
1. Email ngân hàng (BIDV, VCB, MB, Techcombank...) về giao dịch/OTP → TRANSACTION
2. Email xác nhận đơn hàng, vé máy bay, booking → TRANSACTION
3. Email từ đồng nghiệp, công ty, dự án → WORK
4. Email từ bạn bè, gia đình có lời chào cá nhân → PERSONAL
5. Bản tin có nút unsubscribe, không bán hàng → NEWSLETTER
6. Email giảm giá, khuyến mãi, sale → PROMOTION
7. TRUSTED SENDER không bao giờ là spam
8. Cùng domain công ty = WORK

Trả lời JSON:
{
  "category": "...",
  "confidence": 0.0-1.0,
  "summary": "1-2 câu tiếng Việt tóm tắt",
  "key_entities": {
    "people": [],
    "dates": [],
    "amounts": [],
    "tasks": []
  }
}

CHỈ TRẢ VỀ JSON.`

interface ClassifyEmailInput {
  from_address: string
  from_name?: string
  subject?: string
  body_text?: string
  body_html?: string
  user_id?: string
  user_email?: string
}

interface ClassificationMethod {
  method: 'rule' | 'ai' | 'hybrid' | 'learned'
  reasoning?: string
}

// ============================================================
//                    PHASE 1: RULE-BASED
// ============================================================

function classifyByRules(email: ClassifyEmailInput): {
  category: Category | null
  priority: Priority
  confidence: number
  reasoning: string
} | null {
  const domain = email.from_address.split('@')[1]?.toLowerCase() || ''
  const fromLower = email.from_address.toLowerCase()
  const subjectLower = (email.subject || '').toLowerCase()
  const bodyLower = (email.body_text || '').toLowerCase()

  // 1. VIETNAMESE BANK DOMAINS → Always TRANSACTION
  const domainInfo = getDomainCategory(domain)

  if (domainInfo.subCategory === 'bank') {
    return {
      category: 'transaction',
      priority: 4,
      confidence: 0.95,
      reasoning: 'Vietnamese bank domain'
    }
  }

  // 2. FINTECH/WALLET → TRANSACTION
  if (domainInfo.subCategory === 'fintech') {
    return {
      category: 'transaction',
      priority: 4,
      confidence: 0.92,
      reasoning: 'Fintech/wallet domain'
    }
  }

  // 3. OTP/VERIFICATION → TRANSACTION (Highest priority)
  if (/otp|mã xác nhận|verification|xác thực|mã code|security code/i.test(subjectLower)) {
    return {
      category: 'transaction',
      priority: 5,
      confidence: 0.95,
      reasoning: 'OTP/Verification email'
    }
  }

  // 4. BANK TRANSACTION KEYWORDS → TRANSACTION
  if (/biến động số dư|giao dịch|chuyển khoản|thanh toán thành công/i.test(subjectLower)) {
    return {
      category: 'transaction',
      priority: 4,
      confidence: 0.93,
      reasoning: 'Bank transaction keywords'
    }
  }

  // 5. TRANSPORT BOOKING → TRANSACTION
  if (domainInfo.subCategory === 'transport') {
    const isBooking = /booking|confirm|ticket|vé|đặt|receipt|hóa đơn|e-ticket/i.test(subjectLower)
    if (isBooking) {
      return {
        category: 'transaction',
        priority: 3,
        confidence: 0.90,
        reasoning: 'Transport booking confirmation'
      }
    }
  }

  // 6. ECOMMERCE - Check if order or promo
  if (domainInfo.category === 'ecommerce') {
    const isOrder = /đơn hàng|order|đặt hàng|giao hàng|shipping|tracking|delivered|đã giao/i.test(subjectLower)
    if (isOrder) {
      return {
        category: 'transaction',
        priority: 3,
        confidence: 0.88,
        reasoning: 'Ecommerce order notification'
      }
    }
    // Otherwise likely promotion
    const isPromo = /sale|giảm|off|deal|khuyến|voucher|coupon|ưu đãi/i.test(subjectLower)
    if (isPromo) {
      return {
        category: 'promotion',
        priority: 1,
        confidence: 0.85,
        reasoning: 'Ecommerce marketing'
      }
    }
  }

  // 7. GOVERNMENT → WORK
  if (domainInfo.subCategory === 'government') {
    return {
      category: 'work',
      priority: 4,
      confidence: 0.88,
      reasoning: 'Government domain'
    }
  }

  // 8. EDUCATION → WORK
  if (domainInfo.subCategory === 'education') {
    return {
      category: 'work',
      priority: 3,
      confidence: 0.85,
      reasoning: 'Education domain'
    }
  }

  // 9. SOCIAL MEDIA → SOCIAL
  if (domainInfo.category === 'social') {
    return {
      category: 'social',
      priority: 2,
      confidence: 0.88,
      reasoning: 'Social media notification'
    }
  }

  // 10. CLEAR SPAM PATTERNS
  const spamScore = calculateSpamScore(email)
  if (spamScore > 0.75) {
    return {
      category: 'spam',
      priority: 1,
      confidence: Math.min(0.95, spamScore),
      reasoning: 'High spam score'
    }
  }

  // 11. UNSUBSCRIBE + CONTENT ANALYSIS
  const hasUnsubscribe = /unsubscribe|hủy đăng ký|opt.out|email preferences/i.test(bodyLower)
  if (hasUnsubscribe) {
    // Newsletter patterns
    const isNewsletter = /digest|weekly|daily|bản tin|newsletter|roundup|this week|edition/i.test(subjectLower)
    if (isNewsletter) {
      return {
        category: 'newsletter',
        priority: 2,
        confidence: 0.85,
        reasoning: 'Newsletter with unsubscribe'
      }
    }

    // Promotion patterns
    const isPromo = /sale|giảm|off|deal|ưu đãi|khuyến|voucher|%/i.test(subjectLower)
    if (isPromo) {
      return {
        category: 'promotion',
        priority: 1,
        confidence: 0.85,
        reasoning: 'Promotion with unsubscribe'
      }
    }
  }

  // 12. TRUSTED NEWSLETTER DOMAINS
  if (domainInfo.category === 'newsletter' && domainInfo.subCategory === 'trusted') {
    return {
      category: 'newsletter',
      priority: 2,
      confidence: 0.82,
      reasoning: 'Trusted newsletter domain'
    }
  }

  // No confident rule match
  return null
}

function calculateSpamScore(email: ClassifyEmailInput): number {
  let score = 0
  const subject = (email.subject || '').toLowerCase()
  const body = (email.body_text || '').toLowerCase()
  const from = email.from_address.toLowerCase()

  // Spam keywords in subject (high weight)
  const spamSubjectKeywords = [
    'you won', 'trúng thưởng', 'congratulations winner', 'claim your prize',
    'act now', 'urgent action', 'account suspended', 'verify immediately',
    'million dollars', 'inheritance', 'lottery winner',
  ]
  for (const keyword of spamSubjectKeywords) {
    if (subject.includes(keyword)) score += 0.3
  }

  // Spam keywords in body
  const spamBodyKeywords = [
    'click here immediately', 'wire transfer', 'nigerian prince',
    'make money fast', 'get rich quick', 'guaranteed income',
    '100% free', 'no risk', 'act immediately',
  ]
  for (const keyword of spamBodyKeywords) {
    if (body.includes(keyword)) score += 0.15
  }

  // Suspicious sender patterns
  if (/^[a-z0-9]{20,}@/.test(from)) score += 0.3 // Random string email
  if (/\d{6,}@/.test(from)) score += 0.25 // Many numbers in email

  // ALL CAPS subject
  const originalSubject = email.subject || ''
  if (originalSubject === originalSubject.toUpperCase() && originalSubject.length > 10) {
    score += 0.2
  }

  // Excessive punctuation
  if ((originalSubject.match(/[!?]{2,}/g) || []).length > 0) score += 0.15

  // Suspicious phrases
  if (/click here.*immediately|act now.*limited/i.test(subject + ' ' + body)) score += 0.2
  if (/won|winner|prize|selected.*winner/i.test(subject)) score += 0.25

  return Math.min(score, 1)
}

// ============================================================
//                    PHASE 2: AI CLASSIFICATION
// ============================================================

async function classifyByAI(
  email: ClassifyEmailInput,
  keywordScores: KeywordScores,
  senderTrust: SenderTrust | null,
  sameDomain: boolean
): Promise<{
  category: Category
  confidence: number
  summary: string
  key_entities: AIClassification['key_entities']
}> {
  // Build context for AI
  const topKeywords = Object.entries(keywordScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, score]) => `${cat}:${score}`)
    .join(', ')

  // Build trust context
  let trustContext = ''
  if (senderTrust) {
    trustContext = `\nSENDER TRUST: ${senderTrust.trust_level}`
    if (senderTrust.has_replied) trustContext += ' (đã reply trước đây)'
    if (senderTrust.is_contact) trustContext += ' (là contact)'
  }
  if (sameDomain) {
    trustContext += '\nSAME DOMAIN: Có (có thể là đồng nghiệp)'
  }

  const emailContent = `${trustContext}
KEYWORD SCORES: ${topKeywords}

EMAIL:
From: ${email.from_name || ''} <${email.from_address}>
Subject: ${email.subject || '(Không có tiêu đề)'}
Body (500 chars): ${(email.body_text || '').slice(0, 500)}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: emailContent }
      ],
      temperature: 0.1, // Very low for consistency
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        category: validateCategory(parsed.category),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        summary: parsed.summary || '',
        key_entities: {
          people: parsed.key_entities?.people || [],
          dates: parsed.key_entities?.dates || [],
          amounts: parsed.key_entities?.amounts || [],
          tasks: parsed.key_entities?.tasks || [],
        }
      }
    }
  } catch (error) {
    console.error('[CLASSIFIER] AI error:', error)
  }

  // Fallback to keyword-based
  const topCategory = getTopKeywordCategory(keywordScores)
  return {
    category: topCategory.category as Category,
    confidence: 0.5,
    summary: '',
    key_entities: { people: [], dates: [], amounts: [], tasks: [] }
  }
}

// ============================================================
//                    MAIN CLASSIFIER
// ============================================================

export async function classifyEmail(email: ClassifyEmailInput): Promise<AIClassification> {
  console.log(`[CLASSIFIER] Processing: ${(email.subject || '').slice(0, 50)}...`)

  let classificationMethod: ClassificationMethod = { method: 'ai' }

  // STEP 1: Get sender trust
  let senderTrust: SenderTrust | null = null
  let trustScore = 0

  if (email.user_id) {
    try {
      senderTrust = await getSenderTrust(email.user_id, email.from_address)
      trustScore = calculateTrustScore(senderTrust)
    } catch (e) {
      console.error('[CLASSIFIER] Trust lookup failed:', e)
    }
  }

  // BLOCKED sender → Instant spam
  if (senderTrust?.trust_level === 'blocked') {
    return createBlockedResponse()
  }

  // STEP 2: Check learned rules from user feedback
  if (email.user_id) {
    try {
      const learned = await applyLearnedRules(email, email.user_id)
      if (learned.category && learned.confidence >= 0.8) {
        console.log(`[CLASSIFIER] Learned rule: ${learned.category} (${learned.source})`)
        classificationMethod = { method: 'learned', reasoning: learned.source || undefined }

        const priority = determinePriority({
          category: learned.category,
          subject: email.subject || '',
          fromAddress: email.from_address,
          bodyText: email.body_text || '',
          hasAttachment: false, // Would need this from email data
          isRepliedThread: false,
          senderTrustLevel: senderTrust?.trust_level,
        })

        return {
          priority,
          category: learned.category,
          needs_reply: needsReply(learned.category, email.subject || '', email.body_text || '', email.from_address),
          deadline: extractDeadline(email.subject || '', email.body_text || ''),
          summary: '',
          suggested_labels: [],
          suggested_action: suggestAction(learned.category, priority, false),
          confidence: learned.confidence,
          key_entities: { people: [], dates: [], amounts: [], tasks: [] }
        }
      }
    } catch (e) {
      console.error('[CLASSIFIER] Learned rules check failed:', e)
    }
  }

  // STEP 3: Rule-based classification (fast, high confidence)
  const ruleResult = classifyByRules(email)
  const signals = extractEmailSignals(email)
  const sameDomain = email.user_email ? isSameDomain(email.user_email, email.from_address) : false

  if (ruleResult && ruleResult.confidence >= 0.85) {
    console.log(`[CLASSIFIER] Rule match: ${ruleResult.category} (${ruleResult.confidence.toFixed(2)}) - ${ruleResult.reasoning}`)
    classificationMethod = { method: 'rule', reasoning: ruleResult.reasoning }

    // Apply trust override if needed
    let finalCategory = ruleResult.category!
    let finalConfidence = ruleResult.confidence

    if (finalCategory === 'spam' && shouldOverrideSpam(senderTrust, trustScore, signals, sameDomain)) {
      finalCategory = sameDomain ? 'work' : 'personal'
      finalConfidence = 0.85
      classificationMethod.reasoning += ' → Overridden by trust'
    }

    const priority = determinePriority({
      category: finalCategory,
      subject: email.subject || '',
      fromAddress: email.from_address,
      bodyText: email.body_text || '',
      hasAttachment: false,
      isRepliedThread: false,
      senderTrustLevel: senderTrust?.trust_level,
    })

    return {
      priority,
      category: finalCategory,
      needs_reply: needsReply(finalCategory, email.subject || '', email.body_text || '', email.from_address),
      deadline: extractDeadline(email.subject || '', email.body_text || ''),
      summary: '',
      suggested_labels: [],
      suggested_action: suggestAction(finalCategory, priority, false),
      confidence: finalConfidence,
      key_entities: { people: [], dates: [], amounts: [], tasks: [] }
    }
  }

  // STEP 4: Calculate keyword scores
  const keywordScores = calculateKeywordScores(
    email.subject || '',
    email.body_text || '',
    email.from_address
  )

  // STEP 5: AI classification with context
  const aiResult = await classifyByAI(email, keywordScores, senderTrust, sameDomain)

  // STEP 6: Hybrid - combine rule hints with AI
  let finalCategory = aiResult.category
  let finalConfidence = aiResult.confidence

  if (ruleResult) {
    if (ruleResult.category === aiResult.category) {
      // Rule and AI agree → Boost confidence
      finalConfidence = Math.min(0.95, aiResult.confidence + 0.15)
      classificationMethod = { method: 'hybrid', reasoning: 'Rule + AI agree' }
    } else if (ruleResult.confidence > aiResult.confidence) {
      // Rule more confident → Use rule
      finalCategory = ruleResult.category!
      finalConfidence = ruleResult.confidence
      classificationMethod = { method: 'hybrid', reasoning: 'Rule override' }
    }
  }

  // STEP 7: Trust-based override
  if (finalCategory === 'spam' && shouldOverrideSpam(senderTrust, trustScore, signals, sameDomain)) {
    finalCategory = sameDomain ? 'work' : 'personal'
    finalConfidence = 0.85
  }

  // Same domain = likely work (unless clearly personal)
  if (sameDomain && !['personal', 'transaction'].includes(finalCategory)) {
    finalCategory = 'work'
  }

  // STEP 8: Determine priority and other fields
  const priority = determinePriority({
    category: finalCategory,
    subject: email.subject || '',
    fromAddress: email.from_address,
    bodyText: email.body_text || '',
    hasAttachment: false,
    isRepliedThread: false,
    senderTrustLevel: senderTrust?.trust_level,
  })

  const needsReplyFlag = needsReply(finalCategory, email.subject || '', email.body_text || '', email.from_address)

  console.log(`[CLASSIFIER] Final: ${finalCategory} (${finalConfidence.toFixed(2)}) via ${classificationMethod.method}`)

  return {
    priority,
    category: finalCategory,
    needs_reply: needsReplyFlag,
    deadline: extractDeadline(email.subject || '', email.body_text || '') || aiResult.key_entities.dates[0] || null,
    summary: aiResult.summary,
    suggested_labels: [],
    suggested_action: suggestAction(finalCategory, priority, needsReplyFlag),
    confidence: finalConfidence,
    key_entities: aiResult.key_entities
  }
}

// ============================================================
//                    HELPER FUNCTIONS
// ============================================================

function shouldOverrideSpam(
  senderTrust: SenderTrust | null,
  trustScore: number,
  signals: Record<string, unknown>,
  sameDomain: boolean
): boolean {
  // Trusted sender
  if (trustScore > 50 || senderTrust?.has_replied || senderTrust?.is_contact) {
    return true
  }
  // Same company domain
  if (sameDomain) {
    return true
  }
  // Real name + personal greeting
  if (signals.hasRealName && signals.hasPersonalGreeting) {
    return true
  }
  return false
}

function createBlockedResponse(): AIClassification {
  return {
    priority: 1,
    category: 'spam',
    needs_reply: false,
    deadline: null,
    summary: 'Sender bị chặn',
    suggested_labels: ['blocked'],
    suggested_action: 'delete',
    confidence: 1,
    key_entities: { people: [], dates: [], amounts: [], tasks: [] }
  }
}

function validateCategory(category: string): Category {
  const validCategories: Category[] = [
    'work', 'personal', 'newsletter', 'promotion',
    'transaction', 'social', 'spam', 'uncategorized'
  ]
  return validCategories.includes(category as Category)
    ? category as Category
    : 'uncategorized'
}

// ============================================================
//                    BULK CLASSIFIER
// ============================================================

export async function classifyEmails(
  emails: ClassifyEmailInput[]
): Promise<Map<string, AIClassification>> {
  const results = new Map<string, AIClassification>()

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(email => classifyEmail(email))
    )

    batch.forEach((email, idx) => {
      // Use from_address as key if no id available
      const key = (email as { id?: string }).id || email.from_address
      results.set(key, batchResults[idx])
    })

    // Small delay between batches
    if (i + batchSize < emails.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return results
}
