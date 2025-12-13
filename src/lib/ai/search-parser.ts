import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export interface ParsedSearchQuery {
  original: string
  normalized: string
  filters: {
    from?: string
    to?: string
    subject?: string
    keywords?: string[]
    dateRange?: {
      start?: string
      end?: string
    }
    category?: string
    hasAttachment?: boolean
    isUnread?: boolean
    isStarred?: boolean
    priority?: number
    labels?: string[]
  }
  intent: 'find_email' | 'find_person' | 'find_date' | 'find_topic' | 'general'
  confidence: number
}

const SEARCH_PARSER_PROMPT = `Bạn là AI phân tích câu tìm kiếm email tiếng Việt.

NHIỆM VỤ: Phân tích câu tìm kiếm tự nhiên và trích xuất các bộ lọc.

VÍ DỤ:
1. "email sếp gửi tuần trước về budget" →
   - from: "sếp" (cần resolve)
   - dateRange: { start: "tuần trước" }
   - keywords: ["budget"]

2. "những email chưa đọc từ Shopee" →
   - from: "*shopee*"
   - isUnread: true

3. "hóa đơn tháng 11" →
   - keywords: ["hóa đơn"]
   - dateRange: { start: "2024-11-01", end: "2024-11-30" }

4. "email có file đính kèm từ team" →
   - from: "*team*"
   - hasAttachment: true

QUY TẮC NGÀY THÁNG:
- "hôm nay" → ngày hiện tại
- "hôm qua" → -1 ngày
- "tuần này" → đầu tuần đến nay
- "tuần trước" → 7-14 ngày trước
- "tháng này" → đầu tháng đến nay
- "tháng trước" → tháng trước
- "năm nay" → từ 1/1 năm nay

QUY TẮC NGƯỜI GỬI:
- "sếp", "boss", "manager" → role, cần resolve từ context
- "team", "nhóm" → nhiều người
- Tên cụ thể → tìm chính xác
- Email domain → *@domain.com

Trả lời JSON:
{
  "filters": {
    "from": "string hoặc null",
    "subject": "string hoặc null",
    "keywords": ["array"],
    "dateRange": { "start": "ISO hoặc relative", "end": "ISO hoặc relative" },
    "category": "work|personal|transaction|...",
    "hasAttachment": true/false/null,
    "isUnread": true/false/null,
    "isStarred": true/false/null,
    "priority": 1-5 hoặc null,
    "labels": ["array"]
  },
  "intent": "find_email|find_person|find_date|find_topic|general",
  "confidence": 0.0-1.0
}

CHỈ TRẢ VỀ JSON.`

export async function parseSearchQuery(query: string): Promise<ParsedSearchQuery> {
  // Fast path: if query uses operators, parse directly
  if (hasSearchOperators(query)) {
    return parseOperatorQuery(query)
  }

  // AI path: natural language parsing
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SEARCH_PARSER_PROMPT },
        { role: 'user', content: `Ngày hôm nay: ${new Date().toISOString().split('T')[0]}\n\nTìm kiếm: "${query}"` }
      ],
      temperature: 0.1,
      max_tokens: 500
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // Resolve relative dates
      if (parsed.filters?.dateRange) {
        parsed.filters.dateRange = resolveRelativeDates(parsed.filters.dateRange)
      }

      return {
        original: query,
        normalized: buildNormalizedQuery(parsed.filters),
        filters: parsed.filters || {},
        intent: parsed.intent || 'general',
        confidence: parsed.confidence || 0.7
      }
    }
  } catch (error) {
    console.error('[SEARCH_PARSER] AI error:', error)
  }

  // Fallback: treat as keyword search
  return {
    original: query,
    normalized: query,
    filters: { keywords: query.split(/\s+/).filter(w => w.length > 1) },
    intent: 'general',
    confidence: 0.5
  }
}

function hasSearchOperators(query: string): boolean {
  return /\b(from:|to:|subject:|category:|after:|before:|is:|has:)/i.test(query)
}

function parseOperatorQuery(query: string): ParsedSearchQuery {
  const filters: ParsedSearchQuery['filters'] = {}
  let remainingQuery = query

  // Parse from:
  const fromMatch = query.match(/from:(\S+)/i)
  if (fromMatch) {
    filters.from = fromMatch[1].replace(/['"]/g, '')
    remainingQuery = remainingQuery.replace(fromMatch[0], '')
  }

  // Parse to:
  const toMatch = query.match(/to:(\S+)/i)
  if (toMatch) {
    filters.to = toMatch[1].replace(/['"]/g, '')
    remainingQuery = remainingQuery.replace(toMatch[0], '')
  }

  // Parse subject:
  const subjectMatch = query.match(/subject:["']([^"']+)["']|subject:(\S+)/i)
  if (subjectMatch) {
    filters.subject = subjectMatch[1] || subjectMatch[2]
    remainingQuery = remainingQuery.replace(subjectMatch[0], '')
  }

  // Parse category:
  const categoryMatch = query.match(/category:(\S+)/i)
  if (categoryMatch) {
    filters.category = categoryMatch[1]
    remainingQuery = remainingQuery.replace(categoryMatch[0], '')
  }

  // Parse after:
  const afterMatch = query.match(/after:(\S+)/i)
  if (afterMatch) {
    filters.dateRange = filters.dateRange || {}
    filters.dateRange.start = afterMatch[1]
    remainingQuery = remainingQuery.replace(afterMatch[0], '')
  }

  // Parse before:
  const beforeMatch = query.match(/before:(\S+)/i)
  if (beforeMatch) {
    filters.dateRange = filters.dateRange || {}
    filters.dateRange.end = beforeMatch[1]
    remainingQuery = remainingQuery.replace(beforeMatch[0], '')
  }

  // Parse is:starred, is:unread
  if (/is:starred/i.test(query)) {
    filters.isStarred = true
    remainingQuery = remainingQuery.replace(/is:starred/gi, '')
  }
  if (/is:unread/i.test(query)) {
    filters.isUnread = true
    remainingQuery = remainingQuery.replace(/is:unread/gi, '')
  }

  // Parse has:attachment
  if (/has:attachment/i.test(query)) {
    filters.hasAttachment = true
    remainingQuery = remainingQuery.replace(/has:attachment/gi, '')
  }

  // Remaining text as keywords
  const keywords = remainingQuery.trim().split(/\s+/).filter(w => w.length > 1)
  if (keywords.length > 0) {
    filters.keywords = keywords
  }

  // Resolve dates
  if (filters.dateRange) {
    filters.dateRange = resolveRelativeDates(filters.dateRange)
  }

  return {
    original: query,
    normalized: buildNormalizedQuery(filters),
    filters,
    intent: determineIntent(filters),
    confidence: 0.95
  }
}

function resolveRelativeDates(dateRange: { start?: string; end?: string }): { start?: string; end?: string } {
  const now = new Date()
  const result: { start?: string; end?: string } = {}

  if (dateRange.start) {
    result.start = resolveRelativeDate(dateRange.start, now)
  }
  if (dateRange.end) {
    result.end = resolveRelativeDate(dateRange.end, now)
  }

  return result
}

function resolveRelativeDate(dateStr: string, now: Date): string {
  const lower = dateStr.toLowerCase()

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr
  }

  // Date format like 2024/12/01
  const slashMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Vietnamese relative dates
  if (lower.includes('hôm nay') || lower === 'today') {
    return today.toISOString().split('T')[0]
  }

  if (lower.includes('hôm qua') || lower === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
  }

  if (lower.includes('tuần này') || lower === 'this week') {
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))
    return monday.toISOString().split('T')[0]
  }

  if (lower.includes('tuần trước') || lower === 'last week') {
    const lastWeekStart = new Date(today)
    lastWeekStart.setDate(today.getDate() - today.getDay() - 6)
    return lastWeekStart.toISOString().split('T')[0]
  }

  if (lower.includes('tháng này') || lower === 'this month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }

  if (lower.includes('tháng trước') || lower === 'last month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return lastMonth.toISOString().split('T')[0]
  }

  if (lower.includes('năm nay') || lower === 'this year') {
    return `${now.getFullYear()}-01-01`
  }

  // Specific month: "tháng 11", "tháng 12"
  const monthMatch = lower.match(/tháng\s*(\d{1,2})/)
  if (monthMatch) {
    const month = parseInt(monthMatch[1])
    const year = month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear()
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  // N days ago
  const daysAgoMatch = lower.match(/(\d+)\s*(ngày|days?)\s*(trước|ago)/i)
  if (daysAgoMatch) {
    const daysAgo = new Date(today)
    daysAgo.setDate(today.getDate() - parseInt(daysAgoMatch[1]))
    return daysAgo.toISOString().split('T')[0]
  }

  // N weeks ago
  const weeksAgoMatch = lower.match(/(\d+)\s*(tuần|weeks?)\s*(trước|ago)/i)
  if (weeksAgoMatch) {
    const weeksAgo = new Date(today)
    weeksAgo.setDate(today.getDate() - parseInt(weeksAgoMatch[1]) * 7)
    return weeksAgo.toISOString().split('T')[0]
  }

  return dateStr
}

function buildNormalizedQuery(filters: ParsedSearchQuery['filters']): string {
  const parts: string[] = []

  if (filters.from) parts.push(`from:${filters.from}`)
  if (filters.to) parts.push(`to:${filters.to}`)
  if (filters.subject) parts.push(`subject:"${filters.subject}"`)
  if (filters.category) parts.push(`category:${filters.category}`)
  if (filters.dateRange?.start) parts.push(`after:${filters.dateRange.start}`)
  if (filters.dateRange?.end) parts.push(`before:${filters.dateRange.end}`)
  if (filters.isStarred) parts.push('is:starred')
  if (filters.isUnread) parts.push('is:unread')
  if (filters.hasAttachment) parts.push('has:attachment')
  if (filters.keywords?.length) parts.push(filters.keywords.join(' '))

  return parts.join(' ')
}

function determineIntent(filters: ParsedSearchQuery['filters']): ParsedSearchQuery['intent'] {
  if (filters.from || filters.to) return 'find_person'
  if (filters.dateRange?.start || filters.dateRange?.end) return 'find_date'
  if (filters.subject) return 'find_topic'
  if (filters.keywords?.length) return 'find_email'
  return 'general'
}

// Build Supabase query from parsed filters
export interface SearchQueryOptions {
  userId: string
  filters: ParsedSearchQuery['filters']
  limit?: number
  offset?: number
}

export function buildSearchQuery(options: SearchQueryOptions): {
  conditions: string[]
  params: Record<string, unknown>
} {
  const { filters } = options
  const conditions: string[] = []
  const params: Record<string, unknown> = {
    user_id: options.userId
  }

  // From filter
  if (filters.from) {
    if (filters.from.includes('*')) {
      // Wildcard search
      const pattern = filters.from.replace(/\*/g, '%')
      conditions.push(`(from_address ILIKE :from_pattern OR from_name ILIKE :from_pattern)`)
      params.from_pattern = pattern
    } else {
      conditions.push(`(from_address ILIKE :from_pattern OR from_name ILIKE :from_pattern)`)
      params.from_pattern = `%${filters.from}%`
    }
  }

  // To filter
  if (filters.to) {
    conditions.push(`to_addresses @> :to_address::jsonb`)
    params.to_address = JSON.stringify([{ address: filters.to }])
  }

  // Subject filter
  if (filters.subject) {
    conditions.push(`subject ILIKE :subject_pattern`)
    params.subject_pattern = `%${filters.subject}%`
  }

  // Keywords (full-text search)
  if (filters.keywords?.length) {
    const keywordConditions = filters.keywords.map((_, i) => {
      params[`keyword_${i}`] = `%${filters.keywords![i]}%`
      return `(subject ILIKE :keyword_${i} OR snippet ILIKE :keyword_${i})`
    })
    conditions.push(`(${keywordConditions.join(' AND ')})`)
  }

  // Date range
  if (filters.dateRange?.start) {
    conditions.push(`date >= :date_start`)
    params.date_start = filters.dateRange.start
  }
  if (filters.dateRange?.end) {
    conditions.push(`date <= :date_end`)
    params.date_end = filters.dateRange.end + 'T23:59:59'
  }

  // Category
  if (filters.category) {
    conditions.push(`category = :category`)
    params.category = filters.category
  }

  // Flags
  if (filters.hasAttachment === true) {
    conditions.push(`has_attachments = true`)
  }
  if (filters.isUnread === true) {
    conditions.push(`is_read = false`)
  }
  if (filters.isStarred === true) {
    conditions.push(`is_starred = true`)
  }
  if (filters.priority) {
    conditions.push(`priority >= :priority`)
    params.priority = filters.priority
  }

  // Labels
  if (filters.labels?.length) {
    conditions.push(`labels @> :labels`)
    params.labels = filters.labels
  }

  return { conditions, params }
}
