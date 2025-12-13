import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ActionType = 'task' | 'deadline' | 'question' | 'meeting' | 'follow_up'
export type ActionPriority = 'high' | 'medium' | 'low'
export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed'

export interface ExtractedAction {
  type: ActionType
  title: string
  description: string | null
  due_date: string | null
  priority: ActionPriority
  context: string // Original text snippet from email
}

export interface ActionExtractionResult {
  actions: ExtractedAction[]
  hasUrgentItems: boolean
  summary: string | null
}

interface EmailContext {
  id: string
  from_name: string | null
  from_address: string
  subject: string | null
  body_text: string | null
  received_at: string | null
  category?: string | null
}

// Detect urgency indicators
function hasUrgencyIndicators(text: string): boolean {
  const urgentPatterns = [
    /gấp/i,
    /khẩn/i,
    /ngay/i,
    /asap/i,
    /urgent/i,
    /immediately/i,
    /deadline/i,
    /hạn chót/i,
    /trước\s+\d+/i,
    /trong\s+hôm\s+nay/i,
    /cuối\s+ngày/i,
    /end\s+of\s+day/i,
    /eod/i,
  ]
  return urgentPatterns.some(pattern => pattern.test(text))
}

// Extract actions using AI
export async function extractActions(email: EmailContext): Promise<ActionExtractionResult> {
  const bodyText = email.body_text || ''

  // Skip very short emails
  if (bodyText.length < 50) {
    return {
      actions: [],
      hasUrgentItems: false,
      summary: null
    }
  }

  const hasUrgent = hasUrgencyIndicators(bodyText)
  const today = new Date().toISOString().split('T')[0]

  const prompt = `Bạn là AI chuyên phân tích email và trích xuất các action items.

EMAIL CONTEXT:
- Từ: ${email.from_name || email.from_address}
- Tiêu đề: ${email.subject || '(No subject)'}
- Ngày nhận: ${email.received_at || 'Unknown'}
- Loại: ${email.category || 'Unknown'}

NỘI DUNG EMAIL:
---
${bodyText.slice(0, 2000)}
---

NHIỆM VỤ: Trích xuất TẤT CẢ các action items từ email này.

LOẠI ACTION:
1. "task" - Công việc cần làm, yêu cầu thực hiện
2. "deadline" - Hạn chót, ngày đến hạn
3. "question" - Câu hỏi cần trả lời
4. "meeting" - Lời mời họp, hẹn gặp
5. "follow_up" - Cần theo dõi, check lại sau

ĐỘ ƯU TIÊN:
- "high": Gấp, urgent, ASAP, deadline gần (trong 2 ngày)
- "medium": Cần làm nhưng không quá gấp (trong tuần)
- "low": Tham khảo, không bắt buộc

QUY TẮC:
1. Chỉ trích xuất action THỰC SỰ có trong email
2. Title ngắn gọn (< 100 ký tự), mô tả hành động cần làm
3. due_date format: YYYY-MM-DD hoặc null
4. context: trích dẫn nguyên văn phần liên quan trong email
5. Hôm nay là: ${today}
6. Nếu đề cập "thứ 2 tuần sau" thì tính ngày cụ thể
7. Nếu KHÔNG có action nào, trả về mảng rỗng

OUTPUT JSON:
{
  "actions": [
    {
      "type": "task|deadline|question|meeting|follow_up",
      "title": "Gửi báo cáo tháng 11",
      "description": "Chi tiết thêm nếu có",
      "due_date": "2024-12-15",
      "priority": "high|medium|low",
      "context": "Anh gửi báo cáo trước thứ 6 nhé"
    }
  ],
  "summary": "Tóm tắt 1 câu về các action items"
}

CHỈ trả về JSON.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Bạn là AI chuyên trích xuất action items từ email. Output JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500,
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const actions = (parsed.actions || []).map((action: ExtractedAction) => ({
        ...action,
        // Ensure priority is valid
        priority: ['high', 'medium', 'low'].includes(action.priority) ? action.priority : 'medium',
        // Ensure type is valid
        type: ['task', 'deadline', 'question', 'meeting', 'follow_up'].includes(action.type)
          ? action.type
          : 'task'
      }))

      return {
        actions,
        hasUrgentItems: hasUrgent || actions.some((a: ExtractedAction) => a.priority === 'high'),
        summary: parsed.summary || null
      }
    }
  } catch (error) {
    console.error('[ACTION_EXTRACTOR] Error:', error)
  }

  return {
    actions: [],
    hasUrgentItems: hasUrgent,
    summary: null
  }
}

// Batch extract from multiple emails
export async function batchExtractActions(
  emails: EmailContext[]
): Promise<Map<string, ActionExtractionResult>> {
  const results = new Map<string, ActionExtractionResult>()

  // Process in parallel with limit
  const batchSize = 5
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const promises = batch.map(async (email) => {
      const result = await extractActions(email)
      return { id: email.id, result }
    })

    const batchResults = await Promise.all(promises)
    batchResults.forEach(({ id, result }) => {
      results.set(id, result)
    })
  }

  return results
}
