import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseInstance
}

export interface SenderTrust {
  id: string
  user_id: string
  email_address: string
  domain: string | null
  trust_level: 'trusted' | 'neutral' | 'untrusted' | 'blocked'
  trust_score: number
  is_contact: boolean
  has_replied: boolean
  times_received: number
  times_opened: number
  times_replied: number
  last_email_at: string | null
}

/**
 * Lấy trust info của sender
 */
export async function getSenderTrust(
  userId: string,
  senderEmail: string
): Promise<SenderTrust | null> {
  const { data, error } = await getSupabase()
    .from('sender_trust')
    .select('*')
    .eq('user_id', userId)
    .eq('email_address', senderEmail.toLowerCase())
    .single()

  if (error || !data) return null
  return data as SenderTrust
}

/**
 * Cập nhật sender trust khi nhận email mới
 */
export async function updateSenderOnReceive(
  userId: string,
  senderEmail: string,
  senderName?: string
): Promise<void> {
  const email = senderEmail.toLowerCase()
  const domain = email.split('@')[1] || null

  const { data: existing } = await getSupabase()
    .from('sender_trust')
    .select('*')
    .eq('user_id', userId)
    .eq('email_address', email)
    .single()

  if (existing) {
    // Update existing record
    await getSupabase()
      .from('sender_trust')
      .update({
        times_received: (existing.times_received || 0) + 1,
        last_email_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
  } else {
    // Create new record
    await getSupabase()
      .from('sender_trust')
      .insert({
        user_id: userId,
        email_address: email,
        domain,
        trust_level: 'neutral',
        trust_score: 0,
        times_received: 1,
        last_email_at: new Date().toISOString()
      })
  }
}

/**
 * Đánh dấu sender là TRUSTED
 * - Khi user reply
 * - Khi user mark "Not spam"
 * - Khi thêm vào contacts
 */
export async function markSenderAsTrusted(
  userId: string,
  senderEmail: string,
  reason: 'replied' | 'marked_not_spam' | 'contact'
): Promise<void> {
  const email = senderEmail.toLowerCase()
  const domain = email.split('@')[1] || null

  const updateData: Record<string, unknown> = {
    trust_level: 'trusted',
    trust_score: 100,
    updated_at: new Date().toISOString()
  }

  if (reason === 'replied') {
    updateData.has_replied = true
    updateData.times_replied = 1
  } else if (reason === 'contact') {
    updateData.is_contact = true
  }

  const { data: existing } = await getSupabase()
    .from('sender_trust')
    .select('id, times_replied')
    .eq('user_id', userId)
    .eq('email_address', email)
    .single()

  if (existing) {
    if (reason === 'replied') {
      updateData.times_replied = (existing.times_replied || 0) + 1
    }
    await getSupabase()
      .from('sender_trust')
      .update(updateData)
      .eq('id', existing.id)
  } else {
    await getSupabase()
      .from('sender_trust')
      .insert({
        user_id: userId,
        email_address: email,
        domain,
        ...updateData,
        times_received: 0
      })
  }
}

/**
 * Đánh dấu sender là UNTRUSTED (khi user mark spam)
 */
export async function markSenderAsUntrusted(
  userId: string,
  senderEmail: string
): Promise<void> {
  const email = senderEmail.toLowerCase()
  const domain = email.split('@')[1] || null

  const { data: existing } = await getSupabase()
    .from('sender_trust')
    .select('id')
    .eq('user_id', userId)
    .eq('email_address', email)
    .single()

  const updateData = {
    trust_level: 'untrusted',
    trust_score: -100,
    updated_at: new Date().toISOString()
  }

  if (existing) {
    await getSupabase()
      .from('sender_trust')
      .update(updateData)
      .eq('id', existing.id)
  } else {
    await getSupabase()
      .from('sender_trust')
      .insert({
        user_id: userId,
        email_address: email,
        domain,
        ...updateData,
        times_received: 0
      })
  }
}

/**
 * Block sender hoàn toàn
 */
export async function blockSender(
  userId: string,
  senderEmail: string
): Promise<void> {
  const email = senderEmail.toLowerCase()
  const domain = email.split('@')[1] || null

  await getSupabase()
    .from('sender_trust')
    .upsert({
      user_id: userId,
      email_address: email,
      domain,
      trust_level: 'blocked',
      trust_score: -100,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,email_address'
    })
}

/**
 * Tính trust score tổng hợp từ nhiều signals
 */
export function calculateTrustScore(sender: SenderTrust | null): number {
  if (!sender) return 0

  let score = sender.trust_score || 0

  // Đã reply = rất trusted (+50)
  if (sender.has_replied) score += 50

  // Là contact = trusted (+30)
  if (sender.is_contact) score += 30

  // Đã nhận nhiều email và không block = có thể trusted
  if (sender.times_received > 5 && sender.trust_level !== 'untrusted') {
    score += 10
  }

  // Đã mở nhiều lần = quan tâm
  if (sender.times_opened > 3) score += 15

  // Đã reply nhiều lần = rất trusted
  if (sender.times_replied > 1) score += 20

  return Math.max(-100, Math.min(100, score))
}

/**
 * Extract email signals để hỗ trợ AI classification
 */
export function extractEmailSignals(email: {
  from_address: string
  from_name?: string
  subject?: string
  body_text?: string
  body_html?: string
}): Record<string, unknown> {
  const fromEmail = email.from_address.toLowerCase()
  const fromName = email.from_name || ''
  const subject = email.subject || ''
  const body = email.body_text || ''

  return {
    // Sender signals
    isNoReply: /noreply|no-reply|donotreply|do-not-reply/i.test(fromEmail),
    isMarketing: /marketing|promo|newsletter|campaign|bulk|notify|notification/i.test(fromEmail),
    isSupportOrInfo: /support|info|help|service|contact/i.test(fromEmail),

    // Name signals - check for real Vietnamese or English names
    hasRealName: hasRealPersonName(fromName),

    // Content signals
    hasPersonalGreeting: /^(hi|hello|hey|dear|chào|anh|chị|em|bạn|ông|bà|thân|kính)\s/i.test(body.trim()),
    hasRecipientName: false, // Would need recipient's name to check
    hasUnsubscribe: /unsubscribe|hủy đăng ký|ngừng nhận|opt.out/i.test(body),
    hasPromoWords: /(sale|discount|off|free|limited|exclusive|deal|giảm giá|khuyến mãi|miễn phí|ưu đãi|%\s*off)/i.test(subject + ' ' + body),
    hasUrgentWords: /(urgent|asap|immediately|ngay|gấp|khẩn|important|quan trọng)/i.test(subject),

    // Structure signals
    bodyLength: body.length,
    subjectLength: subject.length,
    hasImages: /<img\s/i.test(email.body_html || ''),
    linkCount: (body.match(/https?:\/\//g) || []).length,

    // Spam indicators
    hasExcessiveCaps: (subject.match(/[A-Z]{3,}/g) || []).length > 2,
    hasExcessivePunctuation: (subject.match(/[!?]{2,}/g) || []).length > 0,
    hasCurrencySymbols: /[$€£¥₫]\s*\d|đ\s*\d/i.test(subject + ' ' + body),
  }
}

/**
 * Check if name looks like a real person (Vietnamese or English)
 */
function hasRealPersonName(name: string): boolean {
  if (!name || name.length < 3) return false

  // Vietnamese name pattern: Họ Tên (e.g., "Nguyễn Văn An", "Trần Thị Hương")
  const vietnamesePattern = /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/

  // English name pattern: First Last (e.g., "John Smith", "Mary Jane")
  const englishPattern = /^[A-Z][a-z]+\s+[A-Z][a-z]+/

  // Check if it's NOT a company/service name
  const companyIndicators = /team|support|service|company|inc|ltd|corp|noreply|newsletter|marketing|sales/i

  if (companyIndicators.test(name)) return false

  return vietnamesePattern.test(name) || englishPattern.test(name)
}

/**
 * Check if same domain as user (likely colleague)
 */
export function isSameDomain(userEmail: string, senderEmail: string): boolean {
  const userDomain = userEmail.toLowerCase().split('@')[1]
  const senderDomain = senderEmail.toLowerCase().split('@')[1]

  if (!userDomain || !senderDomain) return false

  // Ignore common email providers
  const commonProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']
  if (commonProviders.includes(userDomain) || commonProviders.includes(senderDomain)) {
    return false
  }

  return userDomain === senderDomain
}
