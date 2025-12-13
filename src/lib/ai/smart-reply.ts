import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ReplyTone = 'formal' | 'casual' | 'auto'
export type ReplyIntent =
  | 'agree'
  | 'decline'
  | 'schedule'
  | 'ask_more'
  | 'thank'
  | 'confirm'
  | 'forward'
  | 'custom'

interface ReplyContext {
  originalEmail: {
    from_name: string | null
    from_address: string
    subject: string | null
    body_text: string | null
    received_at: string | null
  }
  userEmail: string
  userName?: string | null
  category?: string | null
}

export interface ReplySuggestion {
  intent: ReplyIntent
  label: string
  icon: string
  preview: string
  fullReply: string
  subject: string
}

export interface SmartReplyResult {
  suggestions: ReplySuggestion[]
  detectedTone: 'formal' | 'casual'
  detectedRelationship: 'boss' | 'colleague' | 'client' | 'friend' | 'service' | 'unknown'
}

// Detect relationship from email patterns
function detectRelationship(
  fromAddress: string,
  fromName: string | null,
  bodyText: string | null,
  category?: string | null
): 'boss' | 'colleague' | 'client' | 'friend' | 'service' | 'unknown' {
  const body = (bodyText || '').toLowerCase()
  const from = (fromName || fromAddress).toLowerCase()

  // Service/automated emails
  if (fromAddress.includes('noreply') || fromAddress.includes('no-reply') || fromAddress.includes('notification')) {
    return 'service'
  }

  // Check for boss indicators
  if (body.includes('deadline') || body.includes('báo cáo') || body.includes('cần gấp') || body.includes('asap')) {
    return 'boss'
  }

  // Check for client indicators
  if (body.includes('báo giá') || body.includes('hợp đồng') || body.includes('dự án') || body.includes('quotation')) {
    return 'client'
  }

  // Check for friend indicators
  if (category === 'personal' || body.includes('cuối tuần') || body.includes('café') || body.includes('party')) {
    return 'friend'
  }

  // Default to colleague for work emails
  if (category === 'work') {
    return 'colleague'
  }

  return 'unknown'
}

// Get appropriate honorific
function getHonorific(relationship: string, tone: ReplyTone): string {
  if (tone === 'casual') {
    return 'Bạn'
  }

  switch (relationship) {
    case 'boss':
    case 'client':
    case 'colleague':
      return 'Anh/Chị'
    case 'friend':
      return 'Bạn'
    default:
      return 'Anh/Chị'
  }
}

// Main smart reply function
export async function generateSmartReplies(
  context: ReplyContext,
  tone: ReplyTone = 'auto'
): Promise<SmartReplyResult> {
  const { originalEmail, userName, category } = context

  const relationship = detectRelationship(
    originalEmail.from_address,
    originalEmail.from_name,
    originalEmail.body_text,
    category
  )

  // Auto-detect tone based on relationship
  const detectedTone = tone === 'auto'
    ? (relationship === 'friend' ? 'casual' : 'formal')
    : tone

  const honorific = getHonorific(relationship, detectedTone)
  const senderName = originalEmail.from_name?.split(' ').pop() || 'Anh/Chị'

  const prompt = `Bạn là AI assistant giúp soạn email reply cho người Việt Nam.

CONTEXT:
- Email gốc từ: ${originalEmail.from_name || originalEmail.from_address}
- Subject: ${originalEmail.subject || '(No subject)'}
- Relationship: ${relationship}
- Tone: ${detectedTone}
- Cách xưng hô: ${honorific}

EMAIL GỐC:
---
${(originalEmail.body_text || '').slice(0, 1500)}
---

NHIỆM VỤ: Tạo 3 gợi ý reply khác nhau.

QUY TẮC TIẾNG VIỆT:
1. Formal: "Kính gửi ${senderName}", "Trân trọng", "Em xin phép", "Dạ", "Ạ"
2. Casual: "Hi ${senderName}", "Nhé", "Nha", "Ok", "Thanks"
3. Xưng hô đúng: Em (nếu formal với người trên), Mình/Tôi (nếu ngang hàng)
4. KHÔNG dùng "Tôi" khi formal với sếp/khách hàng, dùng "Em"
5. Kết thúc phù hợp: "Trân trọng" (formal) hoặc "Thanks!" (casual)

OUTPUT JSON:
{
  "suggestions": [
    {
      "intent": "agree|decline|schedule|ask_more|thank|confirm",
      "label": "Đồng ý",
      "icon": "check",
      "preview": "Dạ em nhận được...",
      "fullReply": "Full email reply here...",
      "subject": "Re: Original subject"
    }
  ]
}

TẠO 3 SUGGESTIONS KHÁC NHAU:
1. Positive response (đồng ý/xác nhận/cảm ơn)
2. Neutral response (hẹn lịch/hỏi thêm)
3. Contextual response (dựa vào nội dung email)

CHỈ trả về JSON.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Bạn là AI chuyên soạn email tiếng Việt chuyên nghiệp. Output JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        suggestions: parsed.suggestions || [],
        detectedTone,
        detectedRelationship: relationship
      }
    }
  } catch (error) {
    console.error('[SMART_REPLY] Error:', error)
  }

  // Fallback suggestions
  const replySubject = `Re: ${originalEmail.subject || '(No subject)'}`
  return {
    suggestions: [
      {
        intent: 'confirm',
        label: 'Xác nhận',
        icon: 'check',
        preview: 'Dạ em đã nhận được...',
        fullReply: `Kính gửi ${senderName},\n\nDạ em đã nhận được email của ${honorific.toLowerCase()}. Em sẽ xem xét và phản hồi sớm nhất có thể.\n\nTrân trọng,\n${userName || 'Em'}`,
        subject: replySubject
      },
      {
        intent: 'ask_more',
        label: 'Hỏi thêm',
        icon: 'help-circle',
        preview: 'Anh/Chị có thể cho em...',
        fullReply: `Kính gửi ${senderName},\n\nCảm ơn ${honorific.toLowerCase()} đã gửi email. ${honorific} có thể cho em thêm thông tin chi tiết về vấn đề này được không ạ?\n\nTrân trọng,\n${userName || 'Em'}`,
        subject: replySubject
      },
      {
        intent: 'thank',
        label: 'Cảm ơn',
        icon: 'heart',
        preview: 'Cảm ơn anh/chị...',
        fullReply: `Kính gửi ${senderName},\n\nEm xin cảm ơn ${honorific.toLowerCase()} đã thông báo.\n\nTrân trọng,\n${userName || 'Em'}`,
        subject: replySubject
      }
    ],
    detectedTone,
    detectedRelationship: relationship
  }
}

// Compose from bullets/key points
export async function composeFromBullets(
  context: ReplyContext,
  bullets: string,
  tone: ReplyTone = 'formal'
): Promise<{ reply: string; subject: string }> {
  const { originalEmail, userName, category } = context

  const relationship = detectRelationship(
    originalEmail.from_address,
    originalEmail.from_name,
    originalEmail.body_text,
    category
  )

  const senderName = originalEmail.from_name?.split(' ').pop() || 'Anh/Chị'

  const prompt = `Soạn email reply tiếng Việt từ các ý chính sau:

EMAIL GỐC:
From: ${originalEmail.from_name || originalEmail.from_address}
Subject: ${originalEmail.subject || '(No subject)'}
Content: ${(originalEmail.body_text || '').slice(0, 500)}

Ý CHÍNH CẦN VIẾT:
${bullets}

QUY TẮC:
- Tone: ${tone}
- Relationship: ${relationship}
- Xưng hô: ${tone === 'formal' ? 'Em - ' + senderName : 'Mình - Bạn'}
- Viết email hoàn chỉnh, lịch sự, tự nhiên
- Mở đầu + nội dung + kết thúc
- Ký tên: ${userName || 'Em'}

CHỈ trả về nội dung email, không cần giải thích.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Bạn là AI soạn email tiếng Việt chuyên nghiệp.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    return {
      reply: response.choices[0]?.message?.content || '',
      subject: `Re: ${originalEmail.subject || '(No subject)'}`
    }
  } catch (error) {
    console.error('[COMPOSE] Error:', error)
    return {
      reply: '',
      subject: `Re: ${originalEmail.subject || '(No subject)'}`
    }
  }
}
