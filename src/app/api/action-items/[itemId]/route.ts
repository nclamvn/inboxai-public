import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH - Update action item (status, priority, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const body = await request.json()

  // Only allow updating specific fields
  const allowedFields = ['status', 'priority', 'title', 'description', 'due_date']
  const updates: Record<string, string | null> = {}

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  // Add completed_at timestamp if status is being set to completed
  if (updates.status === 'completed') {
    updates.completed_at = new Date().toISOString()
  } else if (updates.status && updates.status !== 'completed') {
    updates.completed_at = null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: action, error } = await supabase
    .from('action_items')
    .update(updates)
    .eq('id', itemId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[ACTION_ITEM] Update error:', error)
    return NextResponse.json({ error: 'Failed to update action' }, { status: 500 })
  }

  return NextResponse.json({ action })
}

// DELETE - Remove action item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params

  const { error } = await supabase
    .from('action_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[ACTION_ITEM] Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete action' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// GET - Get single action item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params

  const { data: action, error } = await supabase
    .from('action_items')
    .select(`
      *,
      email:emails(id, subject, from_name, from_address, received_at)
    `)
    .eq('id', itemId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  }

  return NextResponse.json({ action })
}
