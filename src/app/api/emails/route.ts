import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create Supabase client with Bearer token authentication for mobile apps
async function createClientFromToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  )
  return supabase
}

export async function GET(request: NextRequest) {
  // Extract Bearer token from Authorization header
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 })
  }

  try {
    const supabase = await createClientFromToken(token)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error:', authError?.message)
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const folder = searchParams.get('folder') || 'inbox'
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const accountId = searchParams.get('account_id')
    const accountIds = searchParams.get('account_ids')

    // Build query
    let query = supabase
      .from('emails')
      .select(`
        id, from_name, from_address, to_addresses, subject,
        received_at, is_read, is_starred, is_archived, is_deleted,
        priority, category, needs_reply, detected_deadline, direction,
        summary, ai_confidence, snippet, source_account_id
      `)
      .eq('user_id', user.id)

    // Filter by account(s) if specified
    if (accountId) {
      query = query.eq('source_account_id', accountId)
    } else if (accountIds) {
      const ids = accountIds.split(',').filter(Boolean)
      if (ids.length > 0) {
        query = query.in('source_account_id', ids)
      }
    }

    // Apply folder-specific filters
    switch (folder) {
      case 'inbox':
        query = query
          .eq('direction', 'inbound')
          .eq('is_archived', false)
          .eq('is_deleted', false)
        break
      case 'sent':
        query = query
          .eq('direction', 'outbound')
          .eq('is_deleted', false)
        break
      case 'starred':
        query = query
          .eq('is_starred', true)
          .eq('is_deleted', false)
        break
      case 'archive':
        query = query
          .eq('is_archived', true)
          .eq('is_deleted', false)
        break
      case 'trash':
        query = query.eq('is_deleted', true)
        break
    }

    // Apply category filter if provided
    if (category) {
      query = query.eq('category', category)
    }

    // Order and paginate
    const { data: emails, error, count } = await query
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Fetch emails error:', error)
      return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
    }

    return NextResponse.json({
      emails: emails || [],
      total: count || emails?.length || 0,
      hasMore: (emails?.length || 0) === limit
    })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
