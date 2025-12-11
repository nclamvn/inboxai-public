import { createClient } from '@/lib/supabase/server'
import type { Email } from '@/types'

export interface ResearchResult {
  relatedEmails: Email[]
  senderHistory: {
    totalEmails: number
    lastContact: string
    commonTopics: string[]
  }
  threadContext: Email[]
}

export async function researchEmailContext(
  email: Email,
  userId: string
): Promise<ResearchResult> {
  const supabase = await createClient()

  // Find related emails from the same sender
  const { data: senderEmails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .eq('from_address', email.from_address)
    .neq('id', email.id)
    .order('received_at', { ascending: false })
    .limit(10)

  // Find emails in the same thread (by subject pattern)
  const subjectBase = email.subject
    ?.replace(/^(Re:|Fwd:|RE:|FWD:)\s*/gi, '')
    .trim()

  const { data: threadEmails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .ilike('subject', `%${subjectBase}%`)
    .neq('id', email.id)
    .order('received_at', { ascending: false })
    .limit(5)

  // Find emails with similar content (keyword matching)
  const keywords = extractKeywords(email.subject || '', email.snippet || '')
  let relatedByContent: Email[] = []

  if (keywords.length > 0) {
    const { data } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .neq('id', email.id)
      .or(keywords.map(k => `subject.ilike.%${k}%`).join(','))
      .order('received_at', { ascending: false })
      .limit(5)

    relatedByContent = data || []
  }

  // Calculate sender history
  const senderHistory = {
    totalEmails: senderEmails?.length || 0,
    lastContact: senderEmails?.[0]?.received_at || '',
    commonTopics: extractCommonTopics(senderEmails || [])
  }

  // Merge and dedupe related emails
  const allRelated = [...(senderEmails || []), ...(relatedByContent || [])]
  const uniqueRelated = Array.from(
    new Map(allRelated.map(e => [e.id, e])).values()
  ).slice(0, 10)

  return {
    relatedEmails: uniqueRelated,
    senderHistory,
    threadContext: threadEmails || []
  }
}

function extractKeywords(subject: string, body: string): string[] {
  const text = `${subject} ${body}`.toLowerCase()

  // Remove common Vietnamese stop words and punctuation
  const stopWords = [
    'và', 'của', 'là', 'có', 'được', 'cho', 'với', 'trong', 'đến', 'từ',
    'này', 'đó', 'các', 'những', 'một', 'để', 'theo', 'về', 'như', 'khi',
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in',
    're', 'fwd', 'fw'
  ]

  const words = text
    .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))

  // Get unique keywords, prioritize longer words
  const uniqueWords = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)

  return uniqueWords
}

function extractCommonTopics(emails: Email[]): string[] {
  if (emails.length === 0) return []

  const subjectWords: Record<string, number> = {}

  emails.forEach(email => {
    const words = (email.subject || '')
      .replace(/^(Re:|Fwd:|RE:|FWD:)\s*/gi, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)

    words.forEach(word => {
      subjectWords[word] = (subjectWords[word] || 0) + 1
    })
  })

  // Return top 5 most common topics
  return Object.entries(subjectWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)
}
