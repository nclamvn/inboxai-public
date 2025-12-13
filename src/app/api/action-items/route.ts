import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List all action items with filters
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // pending, in_progress, completed, dismissed
  const type = searchParams.get('type') // task, deadline, question, meeting, follow_up
  const priority = searchParams.get('priority') // high, medium, low
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = supabase
    .from('action_items')
    .select(`
      *,
      email:emails(id, subject, from_name, from_address, received_at)
    `, { count: 'exact' })
    .eq('user_id', user.id)

  // Apply filters
  if (status) {
    query = query.eq('status', status)
  }
  if (type) {
    query = query.eq('type', type)
  }
  if (priority) {
    query = query.eq('priority', priority)
  }

  // Order by priority (high first) then by due_date
  query = query
    .order('status', { ascending: true }) // pending first
    .order('priority', { ascending: true }) // high priority first
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1)

  const { data: actions, error, count } = await query

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({
        actions: [],
        total: 0,
        hasMore: false
      })
    }
    console.error('[ACTION_ITEMS] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 })
  }

  return NextResponse.json({
    actions: actions || [],
    total: count || 0,
    hasMore: (count || 0) > offset + limit
  })
}

// POST - Create action item manually
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email_id, type, title, description, due_date, priority } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'title and type are required' }, { status: 400 })
  }

  const { data: action, error } = await supabase
    .from('action_items')
    .insert({
      user_id: user.id,
      email_id: email_id || null,
      type,
      title,
      description: description || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    console.error('[ACTION_ITEMS] Insert error:', error)
    return NextResponse.json({ error: 'Failed to create action' }, { status: 500 })
  }

  return NextResponse.json({ action })
}
