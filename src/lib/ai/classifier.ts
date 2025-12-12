import OpenAI from 'openai'
import type { AIClassification, Priority, Category } from '@/types'
import {
  getSenderTrust,
  calculateTrustScore,
  extractEmailSignals,
  isSameDomain,
  type SenderTrust
} from './sender-trust'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

const CLASSIFICATION_PROMPT = `Bạn là AI assistant chuyên phân tích email. Phân tích email sau và trả về JSON với format chính xác như sau (KHÔNG có text khác, CHỈ có JSON):

{
  "priority": <number 1-5>,
  "category": "<string>",
  "needs_reply": <boolean>,
  "deadline": "<ISO date string hoặc null>",
  "summary": "<string 1-2 câu tiếng Việt>",
  "suggested_labels": ["<label1>", "<label2>"],
  "suggested_action": "<string>",
  "confidence": <number 0-1>,
  "key_entities": {
    "people": ["<tên người>"],
    "dates": ["<ngày quan trọng>"],
    "amounts": ["<số tiền>"],
    "tasks": ["<việc cần làm>"]
  }
}

HƯỚNG DẪN PRIORITY:
5 - Khẩn cấp: deadline trong 24h, từ sếp/khách hàng VIP, sự cố critical
4 - Cao: cần phản hồi trong 2-3 ngày, công việc quan trọng
3 - Trung bình: thông tin cần biết, không gấp
2 - Thấp: newsletter đã đăng ký, thông báo routine
1 - Rất thấp: promotion, quảng cáo, spam-like

CATEGORY (chọn 1):
- work: email công việc, từ đồng nghiệp, khách hàng
- personal: email cá nhân, bạn bè, gia đình
- newsletter: bản tin, subscription content
- promotion: khuyến mãi, marketing, quảng cáo
- transaction: xác nhận đơn hàng, hóa đơn, ngân hàng
- social: thông báo mạng xã hội
- spam: spam, scam, không mong muốn

SUGGESTED_ACTION (chọn 1):
- reply: cần trả lời
- archive: có thể lưu trữ
- delete: có thể xóa
- read_later: đọc sau
- none: không cần action

CRITICAL RULES:
1. Nếu SENDER_TRUST = trusted hoặc has_replied = true → KHÔNG BAO GIỜ phân loại là spam
2. Email từ người thật (có tên đầy đủ, lời chào cá nhân) thường là personal/work
3. Email với lời chào có tên người nhận thường là personal/work
4. Cùng domain công ty = work

CHÚ Ý:
- Summary phải bằng tiếng Việt, ngắn gọn, nêu được nội dung chính
- Nếu phát hiện deadline trong email, trích xuất ra field deadline
- Nếu không chắc chắn, cho priority = 3 và confidence thấp`

interface ClassifyEmailInput {
  from_address: string
  from_name?: string
  subject?: string
  body_text?: string
  body_html?: string
  user_id?: string  // Optional: for sender trust lookup
  user_email?: string  // Optional: for same-domain check
}

/**
 * Enhanced email classification with multi-signal approach
 * 1. Check sender trust first (rule-based override)
 * 2. Extract email signals
 * 3. Call AI with context
 * 4. Apply trust-based post-processing
 */
export async function classifyEmail(email: ClassifyEmailInput): Promise<AIClassification> {
  // STEP 1: Get sender trust if user_id provided
  let senderTrust: SenderTrust | null = null
  let trustScore = 0

  if (email.user_id) {
    try {
      senderTrust = await getSenderTrust(email.user_id, email.from_address)
      trustScore = calculateTrustScore(senderTrust)
    } catch (e) {
      console.error('Failed to get sender trust:', e)
    }
  }

  // RULE-BASED QUICK DECISIONS (skip AI call)
  if (senderTrust?.trust_level === 'blocked') {
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

  // STEP 2: Extract email signals
  const signals = extractEmailSignals(email)

  // Check same domain (likely colleague)
  const sameDomain = email.user_email
    ? isSameDomain(email.user_email, email.from_address)
    : false

  // STEP 3: Build enhanced prompt with context
  const emailContent = buildEnhancedPrompt(email, senderTrust, signals, sameDomain)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: CLASSIFICATION_PROMPT
        },
        {
          role: 'user',
          content: emailContent
        }
      ],
      temperature: 0.2, // Lower temperature for more consistent results
      max_tokens: 1024
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON từ response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    let result = JSON.parse(jsonMatch[0]) as AIClassification

    // STEP 4: Apply trust-based override
    result = applyTrustOverride(result, senderTrust, trustScore, signals, sameDomain)

    // Validate và normalize
    return {
      priority: Math.min(5, Math.max(1, result.priority)) as Priority,
      category: validateCategory(result.category),
      needs_reply: Boolean(result.needs_reply),
      deadline: result.deadline || null,
      summary: result.summary || '',
      suggested_labels: result.suggested_labels || [],
      suggested_action: result.suggested_action || 'none',
      confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
      key_entities: {
        people: result.key_entities?.people || [],
        dates: result.key_entities?.dates || [],
        amounts: result.key_entities?.amounts || [],
        tasks: result.key_entities?.tasks || []
      }
    }
  } catch (error) {
    console.error('AI classification failed:', error)

    // Fallback: Use rule-based classification
    return fallbackClassification(email, senderTrust, signals, sameDomain)
  }
}

/**
 * Build enhanced prompt with sender trust and signals context
 */
function buildEnhancedPrompt(
  email: ClassifyEmailInput,
  senderTrust: SenderTrust | null,
  signals: Record<string, unknown>,
  sameDomain: boolean
): string {
  let context = ''

  // Add sender trust context
  if (senderTrust) {
    context += `
SENDER HISTORY (QUAN TRỌNG):
- Trust Level: ${senderTrust.trust_level}
- Đã Reply Trước: ${senderTrust.has_replied ? 'CÓ ✓' : 'KHÔNG'}
- Là Contact: ${senderTrust.is_contact ? 'CÓ ✓' : 'KHÔNG'}
- Số lần nhận email: ${senderTrust.times_received}
`
  }

  // Add signals context
  context += `
SENDER SIGNALS:
- Is NoReply/System: ${signals.isNoReply}
- Is Marketing Address: ${signals.isMarketing}
- Has Real Person Name: ${signals.hasRealName}
- Same Company Domain: ${sameDomain}

CONTENT SIGNALS:
- Has Personal Greeting: ${signals.hasPersonalGreeting}
- Has Unsubscribe Link: ${signals.hasUnsubscribe}
- Has Promotional Words: ${signals.hasPromoWords}
`

  return `${context}

EMAIL CẦN PHÂN TÍCH:
FROM: ${email.from_name || ''} <${email.from_address}>
SUBJECT: ${email.subject || '(Không có tiêu đề)'}

BODY (first 3000 chars):
${(email.body_text || stripHtml(email.body_html || '')).slice(0, 3000)}
`
}

/**
 * Apply trust-based override to AI result
 */
function applyTrustOverride(
  result: AIClassification,
  senderTrust: SenderTrust | null,
  trustScore: number,
  signals: Record<string, unknown>,
  sameDomain: boolean
): AIClassification {
  // CRITICAL: Trusted sender should NEVER be spam
  if (result.category === 'spam') {
    // Override if trusted
    if (trustScore > 50 || senderTrust?.has_replied || senderTrust?.is_contact) {
      result.category = 'personal'
      result.confidence = Math.max(result.confidence, 0.8)
      result.summary = result.summary + ' (Trusted sender)'
    }

    // Override if same domain (colleague)
    if (sameDomain) {
      result.category = 'work'
      result.confidence = Math.max(result.confidence, 0.85)
    }

    // Override if has real name and personal greeting
    if (signals.hasRealName && signals.hasPersonalGreeting) {
      result.category = 'personal'
      result.confidence = Math.max(result.confidence, 0.7)
    }
  }

  // Boost priority for trusted senders
  if (trustScore > 50 && result.priority < 3) {
    result.priority = 3 as Priority
  }

  // Same domain = likely work
  if (sameDomain && result.category !== 'transaction') {
    result.category = 'work'
  }

  return result
}

/**
 * Fallback rule-based classification when AI fails
 */
function fallbackClassification(
  email: ClassifyEmailInput,
  senderTrust: SenderTrust | null,
  signals: Record<string, unknown>,
  sameDomain: boolean
): AIClassification {
  let category: Category = 'uncategorized'
  let priority: Priority = 3

  // Rule 1: Trusted sender = personal
  if (senderTrust?.has_replied || senderTrust?.is_contact) {
    category = 'personal'
    priority = 3
  }
  // Rule 2: Same domain = work
  else if (sameDomain) {
    category = 'work'
    priority = 3
  }
  // Rule 3: NoReply + Promo words = promotion
  else if (signals.isNoReply && signals.hasPromoWords) {
    category = 'promotion'
    priority = 1
  }
  // Rule 4: Has unsubscribe = newsletter or promotion
  else if (signals.hasUnsubscribe) {
    category = signals.hasPromoWords ? 'promotion' : 'newsletter'
    priority = 2
  }
  // Rule 5: Marketing address = promotion
  else if (signals.isMarketing) {
    category = 'promotion'
    priority = 1
  }
  // Rule 6: Real name + personal greeting = personal
  else if (signals.hasRealName && signals.hasPersonalGreeting) {
    category = 'personal'
    priority = 3
  }

  return {
    priority,
    category,
    needs_reply: false,
    deadline: null,
    summary: '',
    suggested_labels: [],
    suggested_action: 'none',
    confidence: 0.5,
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

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000)
}
