import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  // Emails khẩn cấp: priority >= 4, chưa đọc, đã nhận hơn 30 phút
  const { data: urgentEmails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject, priority, received_at')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .eq('is_read', false)
    .gte('priority', 4)
    .lt('received_at', thirtyMinutesAgo.toISOString())
    .order('priority', { ascending: false })
    .order('received_at', { ascending: true })
    .limit(5)

  return NextResponse.json({
    urgentEmails: urgentEmails || [],
    checkedAt: new Date().toISOString()
  })
}
