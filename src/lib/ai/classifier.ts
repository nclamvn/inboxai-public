import OpenAI from 'openai'
import type { AIClassification, Priority, Category } from '@/types'

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
}

export async function classifyEmail(email: ClassifyEmailInput): Promise<AIClassification> {
  const emailContent = `
FROM: ${email.from_name || ''} <${email.from_address}>
SUBJECT: ${email.subject || '(Không có tiêu đề)'}

BODY:
${email.body_text || stripHtml(email.body_html || '')}
`.trim()

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
          content: `EMAIL CẦN PHÂN TÍCH:\n${emailContent}`
        }
      ],
      temperature: 0.3,
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

    const result = JSON.parse(jsonMatch[0]) as AIClassification

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

    // Return default values on error
    return {
      priority: 3,
      category: 'uncategorized',
      needs_reply: false,
      deadline: null,
      summary: '',
      suggested_labels: [],
      suggested_action: 'none',
      confidence: 0,
      key_entities: {
        people: [],
        dates: [],
        amounts: [],
        tasks: []
      }
    }
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
