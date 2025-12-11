import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Fetch full email với tất cả fields
  const { data: email, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Mark as read nếu chưa đọc
  if (!email.is_read) {
    await supabase
      .from('emails')
      .update({ is_read: true })
      .eq('id', emailId)
  }

  return NextResponse.json({ email })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params
  const updates = await request.json()

  // Chỉ cho phép update các fields này
  const allowedFields = ['is_read', 'is_starred', 'is_archived', 'is_deleted', 'category', 'priority']
  const filteredUpdates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field]
    }
  }

  const { data: email, error } = await supabase
    .from('emails')
    .update(filteredUpdates)
    .eq('id', emailId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ email })
}
