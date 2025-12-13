import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractActions } from '@/lib/ai/action-extractor'

export const maxDuration = 30

// POST - Extract actions from email and save to database
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params

  // Fetch email
  const { data: email, error: emailError } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject, body_text, received_at, category')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (emailError || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Extract actions using AI
  const result = await extractActions({
    id: email.id,
    from_name: email.from_name,
    from_address: email.from_address,
    subject: email.subject,
    body_text: email.body_text,
    received_at: email.received_at,
    category: email.category
  })

  if (result.actions.length === 0) {
    return NextResponse.json({
      success: true,
      actions: [],
      message: 'No actions found in this email'
    })
  }

  // Save actions to database
  const actionsToInsert = result.actions.map(action => ({
    user_id: user.id,
    email_id: emailId,
    type: action.type,
    title: action.title,
    description: action.description,
    due_date: action.due_date,
    priority: action.priority,
    context: action.context,
    status: 'pending'
  }))

  const { data: savedActions, error: insertError } = await supabase
    .from('action_items')
    .insert(actionsToInsert)
    .select()

  if (insertError) {
    console.error('[EXTRACT_ACTIONS] Insert error:', insertError)
    // If table doesn't exist, return the actions anyway
    if (insertError.code === '42P01') {
      return NextResponse.json({
        success: true,
        actions: result.actions,
        hasUrgentItems: result.hasUrgentItems,
        summary: result.summary,
        warning: 'Actions extracted but not saved - table not yet created'
      })
    }
    return NextResponse.json({ error: 'Failed to save actions' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    actions: savedActions,
    hasUrgentItems: result.hasUrgentItems,
    summary: result.summary
  })
}

// GET - Get existing actions for this email
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params

  const { data: actions, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('email_id', emailId)
    .eq('user_id', user.id)
    .order('priority', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return NextResponse.json({ actions: [] })
    }
    return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 })
  }

  return NextResponse.json({ actions: actions || [] })
}
