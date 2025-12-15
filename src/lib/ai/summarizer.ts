import OpenAI from 'openai'
import { aiLogger } from '@/lib/logger'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export interface SummaryResult {
  summary: string[]
  keyDates?: string[]
  actionRequired: boolean
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent'
  wordCount: number
}

const SUMMARY_PROMPT = `Bạn là AI assistant chuyên tóm tắt email cho người dùng Việt Nam.

NHIỆM VỤ: Tóm tắt email sau thành 3-5 bullet points ngắn gọn, súc tích.

QUY TẮC:
1. Mỗi bullet point tối đa 20 từ
2. Ưu tiên thông tin quan trọng: deadline, số tiền, yêu cầu hành động
3. Giữ nguyên tên riêng, số liệu, ngày tháng
4. Nếu email tiếng Việt → tóm tắt tiếng Việt
5. Nếu email tiếng Anh → tóm tắt tiếng Anh
6. Xác định sentiment: positive/neutral/negative/urgent
7. Xác định có cần action không

OUTPUT FORMAT (JSON):
{
  "summary": [
    "Điểm quan trọng 1",
    "Điểm quan trọng 2",
    "Điểm quan trọng 3"
  ],
  "keyDates": ["15/01/2025 - Deadline nộp báo cáo"],
  "actionRequired": true,
  "sentiment": "neutral"
}

EMAIL:
---
From: {from}
Subject: {subject}
Date: {date}

{body}
---

CHỈ trả về JSON, không giải thích.`

export async function summarizeEmail(
  email: {
    from_address: string
    from_name?: string | null
    subject: string | null
    body_text: string | null
    received_at: string | null
  }
): Promise<SummaryResult | null> {
  const bodyText = email.body_text || ''

  // Count words
  const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length

  // Don't summarize very short emails
  if (wordCount < 30) {
    aiLogger.debug('[SUMMARIZER] Skipped - word count:', wordCount, '< 30');
    return null
  }

  // Truncate body if too long (save tokens)
  const maxChars = 4000
  const body = bodyText.length > maxChars
    ? bodyText.slice(0, maxChars) + '...[truncated]'
    : bodyText

  const prompt = SUMMARY_PROMPT
    .replace('{from}', `${email.from_name || ''} <${email.from_address}>`)
    .replace('{subject}', email.subject || '(No subject)')
    .replace('{date}', email.received_at ? new Date(email.received_at).toLocaleDateString('vi-VN') : '')
    .replace('{body}', body)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Bạn là AI tóm tắt email chuyên nghiệp. Trả lời bằng JSON.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || [],
        keyDates: parsed.keyDates || [],
        actionRequired: parsed.actionRequired || false,
        sentiment: parsed.sentiment || 'neutral',
        wordCount
      }
    }
  } catch (error) {
    aiLogger.error('[SUMMARIZER] Error:', error)
  }

  return null
}

// Check if email needs summary based on length
export function needsSummary(bodyText: string | null): boolean {
  if (!bodyText) return false
  const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length
  return wordCount >= 30
}

// Check based on character count (for UI)
export function needsSummaryByChars(text: string | null): boolean {
  if (!text) return false
  return text.length >= 400
}
