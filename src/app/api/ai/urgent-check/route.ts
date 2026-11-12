import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { compareInboxPriority, rankActionInbox } from '@/lib/action-inbox/rank'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000)

  const { data, error } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject, priority, received_at, source_account_id, category:mail_category, detected_deadline, needs_reply, is_starred, inbox_priority, snippet:inbox_preview')
    .eq('user_id', user.id)
    .eq('direction', 'inbound')
    .eq('provider_deleted', false)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .eq('is_read', false)
    .lt('received_at', thirtyMinutesAgo.toISOString())
    .order('received_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Inbox unavailable' }, { status: 503 })
  const rankings = rankActionInbox(data, now)
  const urgentEmails = data
    .filter(email => {
      const rank = rankings.get(email.id)
      return rank?.band === 'action' && (rank.strength >= 4 || email.priority >= 4)
    })
    .sort((a, b) => compareInboxPriority(rankings.get(a.id)!, rankings.get(b.id)!))
    .slice(0, 5)
    .map(({ id, from_name, from_address, subject, priority }) => ({ id, from_name, from_address, subject, priority }))

  return NextResponse.json({
    urgentEmails,
    checkedAt: new Date(now).toISOString()
  })
}
