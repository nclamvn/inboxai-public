import OpenAI from 'openai'
import type { Email } from '@/types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface EmailAnalysis {
  intent: 'question' | 'request' | 'information' | 'complaint' | 'followup' | 'introduction' | 'other'
  urgency: 'high' | 'medium' | 'low'
  keyPoints: string[]
  suggestedActions: string[]
  quickReplies: {
    label: string
    content: string
    tone: 'formal' | 'friendly' | 'neutral'
  }[]
  responseStrategy: {
    shouldReply: boolean
    suggestedTone: 'formal' | 'friendly' | 'neutral'
    suggestedLength: 'short' | 'medium' | 'long'
    keyTopicsToAddress: string[]
  }
}

export async function analyzeEmail(email: Email): Promise<EmailAnalysis> {
  const prompt = `Phân tích email sau và trả về JSON với cấu trúc:
{
  "intent": "question|request|information|complaint|followup|introduction|other",
  "urgency": "high|medium|low",
  "keyPoints": ["điểm chính 1", "điểm chính 2"],
  "suggestedActions": ["hành động 1", "hành động 2"],
  "quickReplies": [
    {"label": "Xác nhận", "content": "nội dung ngắn", "tone": "formal|friendly|neutral"}
  ],
  "responseStrategy": {
    "shouldReply": true/false,
    "suggestedTone": "formal|friendly|neutral",
    "suggestedLength": "short|medium|long",
    "keyTopicsToAddress": ["topic 1", "topic 2"]
  }
}

Email:
Từ: ${email.from_name || email.from_address}
Tiêu đề: ${email.subject}
Nội dung: ${email.body_text || email.snippet}

Chỉ trả về JSON, không có text khác.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Bạn là trợ lý phân tích email chuyên nghiệp. Trả về JSON hợp lệ.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from AI')
  }

  return JSON.parse(content) as EmailAnalysis
}
