export interface ParsedSearch {
  // Free text (không có operator)
  text: string

  // Operators
  from?: string
  to?: string
  subject?: string
  category?: string
  label?: string

  // Boolean flags
  isStarred?: boolean
  isUnread?: boolean
  isRead?: boolean
  hasAttachment?: boolean

  // Date range
  after?: Date
  before?: Date

  // Priority
  priority?: 'high' | 'normal' | 'low'
}

export function parseSearchQuery(query: string): ParsedSearch {
  const result: ParsedSearch = { text: '' }

  let remainingQuery = query

  // Extract from:
  const fromMatch = /from:(\S+)/i.exec(remainingQuery)
  if (fromMatch) {
    result.from = fromMatch[1].toLowerCase()
    remainingQuery = remainingQuery.replace(fromMatch[0], '')
  }

  // Extract to:
  const toMatch = /to:(\S+)/i.exec(remainingQuery)
  if (toMatch) {
    result.to = toMatch[1].toLowerCase()
    remainingQuery = remainingQuery.replace(toMatch[0], '')
  }

  // Extract subject: (supports quoted strings)
  const subjectMatch = /subject:("[^"]+"|[^\s]+)/i.exec(remainingQuery)
  if (subjectMatch) {
    result.subject = subjectMatch[1].replace(/"/g, '')
    remainingQuery = remainingQuery.replace(subjectMatch[0], '')
  }

  // Extract category:
  const categoryMatch = /category:(\S+)/i.exec(remainingQuery)
  if (categoryMatch) {
    result.category = categoryMatch[1].toLowerCase()
    remainingQuery = remainingQuery.replace(categoryMatch[0], '')
  }

  // Extract label:
  const labelMatch = /label:(\S+)/i.exec(remainingQuery)
  if (labelMatch) {
    result.label = labelMatch[1].toLowerCase()
    remainingQuery = remainingQuery.replace(labelMatch[0], '')
  }

  // Extract boolean flags
  if (/is:starred/i.test(remainingQuery)) {
    result.isStarred = true
    remainingQuery = remainingQuery.replace(/is:starred/gi, '')
  }

  if (/is:unread/i.test(remainingQuery)) {
    result.isUnread = true
    remainingQuery = remainingQuery.replace(/is:unread/gi, '')
  }

  if (/is:read/i.test(remainingQuery)) {
    result.isRead = true
    remainingQuery = remainingQuery.replace(/is:read/gi, '')
  }

  if (/has:attachment/i.test(remainingQuery)) {
    result.hasAttachment = true
    remainingQuery = remainingQuery.replace(/has:attachment/gi, '')
  }

  // Extract dates
  const afterMatch = /after:(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i.exec(remainingQuery)
  if (afterMatch) {
    result.after = new Date(afterMatch[1].replace(/\//g, '-'))
    remainingQuery = remainingQuery.replace(afterMatch[0], '')
  }

  const beforeMatch = /before:(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i.exec(remainingQuery)
  if (beforeMatch) {
    result.before = new Date(beforeMatch[1].replace(/\//g, '-'))
    remainingQuery = remainingQuery.replace(beforeMatch[0], '')
  }

  // Extract priority
  if (/priority:high/i.test(remainingQuery)) {
    result.priority = 'high'
    remainingQuery = remainingQuery.replace(/priority:high/gi, '')
  } else if (/priority:normal/i.test(remainingQuery)) {
    result.priority = 'normal'
    remainingQuery = remainingQuery.replace(/priority:normal/gi, '')
  } else if (/priority:low/i.test(remainingQuery)) {
    result.priority = 'low'
    remainingQuery = remainingQuery.replace(/priority:low/gi, '')
  }

  // Remaining text is free-text search
  result.text = remainingQuery.trim().replace(/\s+/g, ' ')

  return result
}

// Build SQL-like conditions from parsed search
export function buildSearchConditions(parsed: ParsedSearch): {
  textSearch: string
  filters: Record<string, string | boolean | number>
} {
  const filters: Record<string, string | boolean | number> = {}

  if (parsed.from) {
    filters.from = parsed.from
  }

  if (parsed.to) {
    filters.to = parsed.to
  }

  if (parsed.subject) {
    filters.subject = parsed.subject
  }

  if (parsed.category) {
    filters.category = parsed.category
  }

  if (parsed.isStarred !== undefined) {
    filters.is_starred = parsed.isStarred
  }

  if (parsed.isUnread !== undefined) {
    filters.is_read = !parsed.isUnread
  }

  if (parsed.isRead !== undefined) {
    filters.is_read = parsed.isRead
  }

  if (parsed.hasAttachment !== undefined) {
    filters.has_attachment = parsed.hasAttachment
  }

  if (parsed.after) {
    filters.after = parsed.after.toISOString()
  }

  if (parsed.before) {
    filters.before = parsed.before.toISOString()
  }

  if (parsed.priority) {
    filters.priority = parsed.priority === 'high' ? 4 : parsed.priority === 'low' ? 1 : 2
  }

  return {
    textSearch: parsed.text,
    filters
  }
}
