import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all emails
  const { data: emails, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .order('received_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  const allEmails = emails || []

  // === SMART GROUPINGS ===

  // 1. Nhóm theo độ ưu tiên
  const byPriority = {
    urgent: allEmails.filter(e => e.priority === 5),
    high: allEmails.filter(e => e.priority === 4),
    normal: allEmails.filter(e => e.priority === 3),
    low: allEmails.filter(e => (e.priority || 3) <= 2),
  }

  // 2. Nhóm theo người gửi (top senders)
  const senderCounts: Record<string, { count: number; emails: typeof allEmails; name: string }> = {}
  allEmails.forEach(e => {
    const key = e.from_address
    if (!senderCounts[key]) {
      senderCounts[key] = { count: 0, emails: [], name: e.from_name || e.from_address }
    }
    senderCounts[key].count++
    senderCounts[key].emails.push(e)
  })
  const bySender = Object.entries(senderCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([email, data]) => ({
      email,
      name: data.name,
      count: data.count,
      emails: data.emails
    }))

  // 3. Nhóm theo category
  const byCategory = {
    work: allEmails.filter(e => e.category === 'work'),
    personal: allEmails.filter(e => e.category === 'personal'),
    transaction: allEmails.filter(e => e.category === 'transaction'),
    newsletter: allEmails.filter(e => e.category === 'newsletter'),
    promotion: allEmails.filter(e => e.category === 'promotion'),
    social: allEmails.filter(e => e.category === 'social'),
    uncategorized: allEmails.filter(e => !e.category || e.category === 'uncategorized'),
  }

  // 4. Nhóm theo thời gian
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  const byTime = {
    today: allEmails.filter(e => new Date(e.received_at) >= today),
    thisWeek: allEmails.filter(e => {
      const d = new Date(e.received_at)
      return d >= weekAgo && d < today
    }),
    thisMonth: allEmails.filter(e => {
      const d = new Date(e.received_at)
      return d >= monthAgo && d < weekAgo
    }),
    older: allEmails.filter(e => new Date(e.received_at) < monthAgo),
  }

  // 5. Action items (cần hành động)
  const actionItems = {
    needsReply: allEmails.filter(e => e.needs_reply && !e.is_read),
    hasDeadline: allEmails.filter(e => e.detected_deadline),
    unreadImportant: allEmails.filter(e => !e.is_read && (e.priority || 3) >= 4),
    unreadLongTime: allEmails.filter(e => {
      if (e.is_read) return false
      const daysSinceReceived = (now.getTime() - new Date(e.received_at).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceReceived > 3
    }),
  }

  // 6. Cleanup suggestions
  const cleanupSuggestions = {
    oldUnreadPromo: allEmails.filter(e => {
      if (e.is_read || e.category !== 'promotion') return false
      const days = (now.getTime() - new Date(e.received_at).getTime()) / (1000 * 60 * 60 * 24)
      return days > 7
    }),
    oldUnreadNewsletter: allEmails.filter(e => {
      if (e.is_read || e.category !== 'newsletter') return false
      const days = (now.getTime() - new Date(e.received_at).getTime()) / (1000 * 60 * 60 * 24)
      return days > 14
    }),
  }

  return NextResponse.json({
    total: allEmails.length,
    byPriority,
    bySender,
    byCategory,
    byTime,
    actionItems,
    cleanupSuggestions,
    stats: {
      unread: allEmails.filter(e => !e.is_read).length,
      needsReply: actionItems.needsReply.length,
      hasDeadline: actionItems.hasDeadline.length,
    }
  })
}
