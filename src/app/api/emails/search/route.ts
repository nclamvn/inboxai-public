import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSearchQuery, buildSearchConditions } from '@/lib/search/search-parser'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q') || ''
  const limit = parseInt(searchParams.get('limit') || '50')

  if (!query.trim()) {
    return NextResponse.json({ emails: [], total: 0 })
  }

  // Parse search query
  const parsed = parseSearchQuery(query)
  const { textSearch, filters } = buildSearchConditions(parsed)

  try {
    // Build Supabase query
    let dbQuery = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('received_at', { ascending: false })
      .limit(limit)

    // Apply text search (full-text on subject and body)
    if (textSearch) {
      dbQuery = dbQuery.or(
        `subject.ilike.%${textSearch}%,body_text.ilike.%${textSearch}%,from_name.ilike.%${textSearch}%,from_address.ilike.%${textSearch}%`
      )
    }

    // Apply filters
    if (filters.from) {
      dbQuery = dbQuery.or(
        `from_name.ilike.%${filters.from}%,from_address.ilike.%${filters.from}%`
      )
    }

    if (filters.subject) {
      dbQuery = dbQuery.ilike('subject', `%${filters.subject}%`)
    }

    if (filters.category) {
      dbQuery = dbQuery.eq('category', filters.category)
    }

    if (filters.is_starred !== undefined) {
      dbQuery = dbQuery.eq('is_starred', filters.is_starred)
    }

    if (filters.is_read !== undefined) {
      dbQuery = dbQuery.eq('is_read', filters.is_read)
    }

    if (filters.after) {
      dbQuery = dbQuery.gte('received_at', filters.after)
    }

    if (filters.before) {
      dbQuery = dbQuery.lte('received_at', filters.before)
    }

    if (filters.priority) {
      const priorityNum = Number(filters.priority)
      if (priorityNum >= 4) {
        dbQuery = dbQuery.gte('priority', 4)
      } else if (priorityNum <= 1) {
        dbQuery = dbQuery.lte('priority', 2)
      } else {
        dbQuery = dbQuery.gte('priority', 2).lte('priority', 3)
      }
    }

    // Check for attachments
    if (filters.has_attachment) {
      // Get emails that have attachments
      const { data: emailsWithAttachments } = await supabase
        .from('attachments')
        .select('email_id')
        .not('email_id', 'is', null)

      if (emailsWithAttachments && emailsWithAttachments.length > 0) {
        const emailIds = [...new Set(emailsWithAttachments.map(a => a.email_id))]
        dbQuery = dbQuery.in('id', emailIds)
      } else {
        // No emails with attachments
        return NextResponse.json({ emails: [], total: 0, query: parsed })
      }
    }

    const { data: emails, error, count } = await dbQuery

    if (error) {
      console.error('Search error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // Highlight matching text
    const highlightedEmails = emails?.map(email => ({
      ...email,
      _highlights: {
        subject: highlightText(email.subject, textSearch),
        body_preview: highlightText(email.body_text?.slice(0, 200), textSearch),
        from_name: highlightText(email.from_name, textSearch)
      }
    }))

    return NextResponse.json({
      emails: highlightedEmails || [],
      total: count || 0,
      query: parsed
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

// Helper: Highlight matching text
function highlightText(text: string | null, search: string): string | null {
  if (!text || !search) return text

  const regex = new RegExp(`(${escapeRegex(search)})`, 'gi')
  return text.replace(regex, '[[HIGHLIGHT]]$1[[/HIGHLIGHT]]')
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
