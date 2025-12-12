import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // First verify user owns this email
  const { data: email } = await supabase
    .from('emails')
    .select('id')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (!email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  const { data: attachments, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true })

  if (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return NextResponse.json({ attachments: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attachments: attachments || [] })
}
