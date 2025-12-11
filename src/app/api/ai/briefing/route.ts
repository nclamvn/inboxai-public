import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface BriefingItem {
  type: 'urgent' | 'deadline' | 'waiting' | 'vip'
  icon: string
  title: string
  description: string
  count: number
  emailIds: string[]
}

interface CleanupItem {
  type: 'newsletter' | 'promotion'
  title: string
  description: string
  action: 'archive' | 'delete'
  emailIds: string[]
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Chào buổi sáng'
  if (hour >= 12 && hour < 18) return 'Chào buổi chiều'
  if (hour >= 18 && hour < 22) return 'Chào buổi tối'
  return 'Làm việc khuya'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Fetch all relevant emails
  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .order('received_at', { ascending: false })

  if (!emails) {
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }

  // === URGENT ITEMS ===

  // Emails cần trả lời (needs_reply = true, chưa đọc)
  const needsReply = emails.filter(e =>
    e.needs_reply &&
    !e.is_read &&
    e.direction === 'inbound'
  )

  // Emails quan trọng chưa đọc (priority >= 4)
  const urgentUnread = emails.filter(e =>
    !e.is_read &&
    (e.priority || 3) >= 4
  )

  // Emails có deadline hôm nay hoặc quá hạn
  const hasDeadlineToday = emails.filter(e => {
    if (!e.detected_deadline) return false
    const deadline = new Date(e.detected_deadline)
    return deadline <= new Date(today.getTime() + 24 * 60 * 60 * 1000)
  })

  // Emails chờ reply quá 24h
  const waitingReplyLong = emails.filter(e => {
    if (!e.needs_reply || e.is_read) return false
    const received = new Date(e.received_at)
    return received < yesterday
  })

  // === STATS ===

  const unreadCount = emails.filter(e => !e.is_read).length
  const todayCount = emails.filter(e => new Date(e.received_at) >= today).length

  // Category breakdown
  const byCategory = {
    work: emails.filter(e => e.category === 'work' && !e.is_read).length,
    personal: emails.filter(e => e.category === 'personal' && !e.is_read).length,
    newsletter: emails.filter(e => e.category === 'newsletter' && !e.is_read).length,
    promotion: emails.filter(e => e.category === 'promotion' && !e.is_read).length,
    transaction: emails.filter(e => e.category === 'transaction' && !e.is_read).length,
  }

  // === CLEANUP SUGGESTIONS ===

  // Newsletter cũ (>7 ngày, chưa đọc)
  const oldNewsletter = emails.filter(e => {
    if (e.category !== 'newsletter' || e.is_read) return false
    return new Date(e.received_at) < weekAgo
  })

  // Promotion cũ (>7 ngày, chưa đọc)
  const oldPromotion = emails.filter(e => {
    if (e.category !== 'promotion' || e.is_read) return false
    return new Date(e.received_at) < weekAgo
  })

  // === VIP SENDERS ===
  const { data: vipSenders } = await supabase
    .from('sender_scores')
    .select('sender_email, sender_name')
    .eq('user_id', user.id)
    .eq('is_vip', true)

  const vipEmails = vipSenders
    ? emails.filter(e =>
      !e.is_read &&
      vipSenders.some(v => v.sender_email === e.from_address)
    )
    : []

  // === GENERATE BRIEFING ===
  const greeting = getGreeting()

  const briefingItems: BriefingItem[] = []

  if (urgentUnread.length > 0) {
    briefingItems.push({
      type: 'urgent',
      icon: 'AlertCircle',
      title: `${urgentUnread.length} email quan trọng`,
      description: 'Cần xem ngay',
      count: urgentUnread.length,
      emailIds: urgentUnread.slice(0, 5).map(e => e.id)
    })
  }

  if (hasDeadlineToday.length > 0) {
    briefingItems.push({
      type: 'deadline',
      icon: 'Clock',
      title: `${hasDeadlineToday.length} email có deadline`,
      description: 'Hôm nay hoặc đã quá hạn',
      count: hasDeadlineToday.length,
      emailIds: hasDeadlineToday.map(e => e.id)
    })
  }

  if (waitingReplyLong.length > 0) {
    briefingItems.push({
      type: 'waiting',
      icon: 'MessageCircle',
      title: `${waitingReplyLong.length} email chờ phản hồi`,
      description: 'Quá 24 giờ chưa trả lời',
      count: waitingReplyLong.length,
      emailIds: waitingReplyLong.map(e => e.id)
    })
  }

  if (vipEmails.length > 0) {
    briefingItems.push({
      type: 'vip',
      icon: 'Star',
      title: `${vipEmails.length} email từ VIP`,
      description: 'Người gửi quan trọng',
      count: vipEmails.length,
      emailIds: vipEmails.map(e => e.id)
    })
  }

  // Cleanup suggestions
  const cleanupItems: CleanupItem[] = []

  if (oldNewsletter.length >= 3) {
    cleanupItems.push({
      type: 'newsletter',
      title: `${oldNewsletter.length} newsletter cũ`,
      description: 'Chưa đọc hơn 7 ngày',
      action: 'archive',
      emailIds: oldNewsletter.map(e => e.id)
    })
  }

  if (oldPromotion.length >= 3) {
    cleanupItems.push({
      type: 'promotion',
      title: `${oldPromotion.length} khuyến mãi cũ`,
      description: 'Chưa đọc hơn 7 ngày',
      action: 'delete',
      emailIds: oldPromotion.map(e => e.id)
    })
  }

  return NextResponse.json({
    greeting,
    summary: {
      total: emails.length,
      unread: unreadCount,
      today: todayCount,
      byCategory
    },
    briefingItems,
    cleanupItems,
    generatedAt: now.toISOString()
  })
}
