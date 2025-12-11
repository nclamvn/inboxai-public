import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get single rule
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { ruleId } = await params

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: rule } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', user.id)
    .single()

  if (!rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  return NextResponse.json({ rule })
}

// PATCH - Update rule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { ruleId } = await params

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .update({
      ...body,
      updated_at: new Date().toISOString()
    })
    .eq('id', ruleId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Failed to update rule:', error)
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
  }

  return NextResponse.json({ rule })
}

// DELETE - Delete rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { ruleId } = await params

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Failed to delete rule:', error)
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
