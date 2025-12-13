import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export type FollowUpType =
  | 'awaiting_reply'     // User sent email, waiting for response
  | 'needs_reply'        // Received email, user should respond
  | 'commitment_due'     // User made a promise/deadline
  | 'question_asked'     // Question was asked to user
  | 'action_required'    // Action required from user

export type FollowUpPriority = 'high' | 'medium' | 'low'

export interface FollowUp {
  emailId: string
  type: FollowUpType
  priority: FollowUpPriority
  reason: string
  suggestedAction: string
  dueDate?: string
  personInvolved: {
    email: string
    name?: string
  }
  confidence: number
}

export interface EmailForFollowUp {
  id: string
  from_address: string
  from_name?: string
  to_addresses: Array<{ address: string; name?: string }>
  subject?: string
  body_text?: string
  received_at: string
  is_read: boolean
  category?: string
  thread_id?: string
  user_email: string
}

const FOLLOW_UP_PROMPT = `Bạn là AI phân tích email để phát hiện các follow-up cần thiết.

NHIỆM VỤ: Phân tích email và xác định xem có cần follow-up không.

CÁC LOẠI FOLLOW-UP:
1. awaiting_reply - Email user gửi đi, đang chờ phản hồi
2. needs_reply - Email nhận được, user cần trả lời
3. commitment_due - Có cam kết/deadline cần thực hiện
4. question_asked - Có câu hỏi được hỏi user
5. action_required - Yêu cầu user làm gì đó

QUY TẮC:
- Nếu email có câu hỏi trực tiếp ("Bạn nghĩ sao?", "Khi nào xong?") → needs_reply
- Nếu email yêu cầu action ("Vui lòng gửi...", "Cần bạn...") → action_required
- Nếu email có deadline ("trước thứ 6", "cuối tuần này") → commitment_due
- Email xác nhận giao dịch, newsletter → KHÔNG cần follow-up
- Email từ noreply@... → KHÔNG cần follow-up

ĐỘ ƯU TIÊN:
- high: Deadline trong 2 ngày, câu hỏi quan trọng từ sếp/khách
- medium: Deadline trong tuần, câu hỏi thông thường
- low: Không có deadline cụ thể, nice-to-have

Trả về JSON:
{
  "needsFollowUp": true/false,
  "type": "awaiting_reply|needs_reply|commitment_due|question_asked|action_required",
  "priority": "high|medium|low",
  "reason": "Giải thích ngắn gọn bằng tiếng Việt",
  "suggestedAction": "Hành động đề xuất",
  "dueDate": "YYYY-MM-DD hoặc null nếu không có",
  "confidence": 0.0-1.0
}

CHỈ TRẢ VỀ JSON.`

export async function detectFollowUp(
  email: EmailForFollowUp,
  direction: 'sent' | 'received'
): Promise<FollowUp | null> {
  // Quick filters - skip obvious non-follow-up cases
  if (shouldSkipEmail(email)) {
    return null
  }

  const emailContent = `
Direction: ${direction === 'sent' ? 'User đã GỬI email này' : 'User đã NHẬN email này'}
From: ${email.from_name || ''} <${email.from_address}>
To: ${email.to_addresses.map(t => `${t.name || ''} <${t.address}>`).join(', ')}
Subject: ${email.subject || '(Không có tiêu đề)'}
Date: ${email.received_at}
Category: ${email.category || 'unknown'}

Body (500 chars):
${(email.body_text || '').slice(0, 500)}
`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: FOLLOW_UP_PROMPT },
        { role: 'user', content: emailContent }
      ],
      temperature: 0.1,
      max_tokens: 400
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      if (!parsed.needsFollowUp) {
        return null
      }

      // Determine person involved based on direction
      const personInvolved = direction === 'sent'
        ? {
          email: email.to_addresses[0]?.address || '',
          name: email.to_addresses[0]?.name
        }
        : {
          email: email.from_address,
          name: email.from_name
        }

      return {
        emailId: email.id,
        type: validateFollowUpType(parsed.type),
        priority: validatePriority(parsed.priority),
        reason: parsed.reason || '',
        suggestedAction: parsed.suggestedAction || '',
        dueDate: parsed.dueDate || undefined,
        personInvolved,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7))
      }
    }
  } catch (error) {
    console.error('[FOLLOW_UP_DETECTOR] Error:', error)
  }

  return null
}

function shouldSkipEmail(email: EmailForFollowUp): boolean {
  const from = email.from_address.toLowerCase()
  const subject = (email.subject || '').toLowerCase()
  const category = email.category?.toLowerCase()

  // Skip noreply addresses
  if (from.includes('noreply') || from.includes('no-reply') || from.includes('mailer-daemon')) {
    return true
  }

  // Skip transaction confirmations
  if (category === 'transaction') {
    const isNotification = /xác nhận|confirmation|receipt|đơn hàng|order|otp|mã xác|biến động/i.test(subject)
    if (isNotification) return true
  }

  // Skip newsletters and promotions
  if (category === 'newsletter' || category === 'promotion' || category === 'spam') {
    return true
  }

  // Skip social notifications
  if (category === 'social') {
    return true
  }

  return false
}

function validateFollowUpType(type: string): FollowUpType {
  const validTypes: FollowUpType[] = [
    'awaiting_reply', 'needs_reply', 'commitment_due',
    'question_asked', 'action_required'
  ]
  return validTypes.includes(type as FollowUpType)
    ? type as FollowUpType
    : 'needs_reply'
}

function validatePriority(priority: string): FollowUpPriority {
  const validPriorities: FollowUpPriority[] = ['high', 'medium', 'low']
  return validPriorities.includes(priority as FollowUpPriority)
    ? priority as FollowUpPriority
    : 'medium'
}

// Batch analyze emails for follow-ups
export async function detectFollowUps(
  emails: EmailForFollowUp[],
  userEmail: string
): Promise<FollowUp[]> {
  const followUps: FollowUp[] = []

  // Process in batches of 5
  const batchSize = 5
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(email => {
        // Determine if sent or received
        const isSent = email.from_address.toLowerCase() === userEmail.toLowerCase()
        return detectFollowUp(email, isSent ? 'sent' : 'received')
      })
    )

    batchResults.forEach(result => {
      if (result) {
        followUps.push(result)
      }
    })

    // Small delay between batches
    if (i + batchSize < emails.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return followUps
}

// Get follow-up type label in Vietnamese
export function getFollowUpTypeLabel(type: FollowUpType): string {
  const labels: Record<FollowUpType, string> = {
    awaiting_reply: 'Đang chờ phản hồi',
    needs_reply: 'Cần trả lời',
    commitment_due: 'Deadline',
    question_asked: 'Câu hỏi cần trả lời',
    action_required: 'Cần hành động'
  }
  return labels[type] || type
}

// Get priority color
export function getFollowUpPriorityColor(priority: FollowUpPriority): {
  bg: string
  text: string
  border: string
} {
  const colors: Record<FollowUpPriority, { bg: string; text: string; border: string }> = {
    high: {
      bg: 'bg-red-50 dark:bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-500/30'
    },
    medium: {
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-500/30'
    },
    low: {
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-500/30'
    }
  }
  return colors[priority] || colors.medium
}
