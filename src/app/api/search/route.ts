import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSearchQuery, type ParsedSearchQuery } from '@/lib/ai/search-parser'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q') || ''
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const useAI = searchParams.get('ai') !== 'false' // Default to AI parsing

  if (!query.trim()) {
    return NextResponse.json({ emails: [], total: 0, parsed: null })
  }

  try {
    // Parse query (AI or basic)
    let parsed: ParsedSearchQuery

    if (useAI) {
      parsed = await parseSearchQuery(query)
    } else {
      // Basic operator parsing without AI
      parsed = {
        original: query,
        normalized: query,
        filters: { keywords: [query] },
        intent: 'general',
        confidence: 0.5
      }
    }

    // Build Supabase query
    let dbQuery = supabase
      .from('emails')
      .select('id, message_id, from_address, from_name, to_addresses, subject, snippet, body_text, received_at, is_read, is_starred, category, priority, labels, has_attachments, thread_id, ai_summary', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { filters } = parsed

    // Apply from filter
    if (filters.from) {
      const fromPattern = filters.from.includes('*')
        ? filters.from.replace(/\*/g, '%')
        : `%${filters.from}%`
      dbQuery = dbQuery.or(`from_name.ilike.${fromPattern},from_address.ilike.${fromPattern}`)
    }

    // Apply to filter
    if (filters.to) {
      dbQuery = dbQuery.ilike('to_addresses::text', `%${filters.to}%`)
    }

    // Apply subject filter
    if (filters.subject) {
      dbQuery = dbQuery.ilike('subject', `%${filters.subject}%`)
    }

    // Apply keywords (full-text search)
    if (filters.keywords?.length) {
      const keywordConditions = filters.keywords.map(k =>
        `subject.ilike.%${k}%,snippet.ilike.%${k}%,body_text.ilike.%${k}%,from_name.ilike.%${k}%`
      )
      dbQuery = dbQuery.or(keywordConditions.join(','))
    }

    // Apply date range
    if (filters.dateRange?.start) {
      dbQuery = dbQuery.gte('received_at', filters.dateRange.start)
    }
    if (filters.dateRange?.end) {
      dbQuery = dbQuery.lte('received_at', filters.dateRange.end + 'T23:59:59')
    }

    // Apply category
    if (filters.category) {
      dbQuery = dbQuery.eq('category', filters.category)
    }

    // Apply flags
    if (filters.isUnread === true) {
      dbQuery = dbQuery.eq('is_read', false)
    }
    if (filters.isStarred === true) {
      dbQuery = dbQuery.eq('is_starred', true)
    }
    if (filters.hasAttachment === true) {
      dbQuery = dbQuery.eq('has_attachments', true)
    }

    // Apply priority
    if (filters.priority) {
      dbQuery = dbQuery.gte('priority', filters.priority)
    }

    // Apply labels
    if (filters.labels?.length) {
      dbQuery = dbQuery.contains('labels', filters.labels)
    }

    const { data: emails, error, count } = await dbQuery

    if (error) {
      console.error('[SEARCH] Database error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // Process results with highlights
    const processedEmails = (emails || []).map(email => ({
      ...email,
      _highlights: generateHighlights(email, filters)
    }))

    // Save to search history
    if (query.trim()) {
      await saveSearchHistory(supabase, user.id, query)
    }

    return NextResponse.json({
      emails: processedEmails,
      total: count || 0,
      parsed: {
        original: parsed.original,
        normalized: parsed.normalized,
        intent: parsed.intent,
        confidence: parsed.confidence,
        filters: parsed.filters
      }
    })
  } catch (error) {
    console.error('[SEARCH] Error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

// Generate highlights for search results
function generateHighlights(
  email: { subject?: string; snippet?: string; from_name?: string },
  filters: ParsedSearchQuery['filters']
): { subject?: string; snippet?: string; from_name?: string } {
  const highlights: { subject?: string; snippet?: string; from_name?: string } = {}

  const searchTerms = [
    ...(filters.keywords || []),
    filters.from,
    filters.subject
  ].filter(Boolean) as string[]

  if (searchTerms.length === 0) return highlights

  if (email.subject) {
    highlights.subject = highlightTerms(email.subject, searchTerms)
  }
  if (email.snippet) {
    highlights.snippet = highlightTerms(email.snippet, searchTerms)
  }
  if (email.from_name) {
    highlights.from_name = highlightTerms(email.from_name, searchTerms)
  }

  return highlights
}

function highlightTerms(text: string, terms: string[]): string {
  let result = text
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi')
    result = result.replace(regex, '[[HIGHLIGHT]]$1[[/HIGHLIGHT]]')
  }
  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Save search to history
async function saveSearchHistory(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  query: string
) {
  try {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('recent_searches')
      .eq('user_id', userId)
      .single()

    const recentSearches: string[] = prefs?.recent_searches || []
    const filtered = recentSearches.filter(s => s !== query)
    filtered.unshift(query)
    const updated = filtered.slice(0, 10)

    await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        recent_searches: updated,
        updated_at: new Date().toISOString()
      })
  } catch {
    // Ignore history save errors
  }
}

// POST - Parse query only (for previewing)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { query } = await request.json()

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const parsed = await parseSearchQuery(query)

    return NextResponse.json({
      parsed: {
        original: parsed.original,
        normalized: parsed.normalized,
        intent: parsed.intent,
        confidence: parsed.confidence,
        filters: parsed.filters
      }
    })
  } catch (error) {
    console.error('[SEARCH] Parse error:', error)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }
}
