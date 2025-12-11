import OpenAI from 'openai'
import type { Email } from '@/types'
import type { EmailAnalysis } from './email-analyzer'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface DraftOptions {
  tone: 'formal' | 'friendly' | 'neutral'
  length: 'short' | 'medium' | 'long'
  includeGreeting: boolean
  includeSignature: boolean
  customInstructions?: string
  senderName?: string
}

export interface GeneratedDraft {
  subject: string
  body: string
  alternativeVersions: {
    tone: string
    body: string
  }[]
}

const lengthGuide = {
  short: '2-3 câu ngắn gọn',
  medium: '1-2 đoạn văn',
  long: 'phản hồi chi tiết với nhiều đoạn'
}

const toneGuide = {
  formal: 'trang trọng, chuyên nghiệp, dùng kính ngữ',
  friendly: 'thân thiện, gần gũi nhưng vẫn lịch sự',
  neutral: 'trung tính, cân bằng giữa formal và friendly'
}

export async function generateDraft(
  originalEmail: Email,
  analysis: EmailAnalysis,
  options: DraftOptions,
  relatedEmails?: Email[]
): Promise<GeneratedDraft> {
  const contextFromRelated = relatedEmails?.length
    ? `\nContext từ các email liên quan:\n${relatedEmails.slice(0, 3).map(e =>
        `- ${e.subject}: ${e.snippet}`
      ).join('\n')}`
    : ''

  const prompt = `Tạo email phản hồi với các yêu cầu sau:

EMAIL GỐC:
Từ: ${originalEmail.from_name || originalEmail.from_address}
Tiêu đề: ${originalEmail.subject}
Nội dung: ${originalEmail.body_text || originalEmail.snippet}

PHÂN TÍCH:
- Intent: ${analysis.intent}
- Urgency: ${analysis.urgency}
- Key points: ${analysis.keyPoints.join(', ')}
- Topics to address: ${analysis.responseStrategy.keyTopicsToAddress.join(', ')}
${contextFromRelated}

YÊU CẦU:
- Tone: ${toneGuide[options.tone]}
- Độ dài: ${lengthGuide[options.length]}
- ${options.includeGreeting ? 'Có' : 'Không'} lời chào đầu
- ${options.includeSignature ? 'Có' : 'Không'} chữ ký cuối (dùng tên: ${options.senderName || '[Tên của bạn]'})
${options.customInstructions ? `- Yêu cầu đặc biệt: ${options.customInstructions}` : ''}

Trả về JSON với format:
{
  "subject": "Re: ...",
  "body": "nội dung email",
  "alternativeVersions": [
    {"tone": "tên tone khác", "body": "phiên bản với tone khác"}
  ]
}

Chỉ trả về JSON, không có text khác.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Bạn là trợ lý viết email chuyên nghiệp. Viết email tự nhiên, phù hợp với văn hóa Việt Nam. Trả về JSON hợp lệ.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from AI')
  }

  return JSON.parse(content) as GeneratedDraft
}

export async function improveExistingDraft(
  draft: string,
  instructions: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Bạn là trợ lý chỉnh sửa email. Cải thiện email theo yêu cầu nhưng giữ nguyên ý chính.'
      },
      {
        role: 'user',
        content: `Cải thiện email sau theo yêu cầu: "${instructions}"\n\nEmail:\n${draft}\n\nChỉ trả về nội dung email đã chỉnh sửa, không giải thích.`
      }
    ],
    temperature: 0.5,
  })

  return response.choices[0]?.message?.content || draft
}
