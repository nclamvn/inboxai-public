import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseInstance
}

interface WeeklyStats {
  totalReceived: number
  totalProcessed: number
  processRate: number
  avgResponseTime: number  // hours
  inboxZeroDays: number
  busiestDay: string
  busiestHour: number
  categoryBreakdown: Record<string, number>
  priorityBreakdown: Record<number, number>
}

interface SenderInsight {
  email: string
  name: string
  totalEmails: number
  openRate: number
  avgReadTime: number
  importance: number
  suggestion: 'vip' | 'unsubscribe' | 'mute' | 'none'
  reason: string
}

interface ProductivityScore {
  score: number  // 0-100
  grade: 'Xuất sắc' | 'Tốt' | 'Khá' | 'Cần cải thiện'
  trend: 'up' | 'down' | 'stable'
  trendValue: number
  factors: {
    name: string
    score: number
    weight: number
  }[]
}

interface WeeklyReport {
  period: {
    start: string
    end: string
  }
  stats: WeeklyStats
  topSenders: SenderInsight[]
  productivity: ProductivityScore
  suggestions: {
    type: 'unsubscribe' | 'vip' | 'rule' | 'habit'
    title: string
    description: string
    actionable: boolean
    data?: string[]
  }[]
  comparison: {
    metric: string
    current: number
    previous: number
    change: number
    changePercent: number
  }[]
}

interface Email {
  id: string
  user_id: string
  from_address: string
  from_name: string | null
  subject: string | null
  category: string | null
  priority: number
  is_read: boolean
  is_starred: boolean
  is_archived: boolean
  is_deleted: boolean
  received_at: string
  created_at: string
}

interface Behavior {
  id: string
  user_id: string
  action: string
  time_to_action: number | null
  created_at: string
}

interface SenderScore {
  id: string
  user_id: string
  sender_email: string
  sender_name: string | null
  total_received: number
  total_opened: number
  total_replied: number
  total_deleted: number
  total_archived: number
  avg_read_time: number
  importance_score: number
  engagement_score: number
  annoyance_score: number
}

export async function generateWeeklyReport(userId: string): Promise<WeeklyReport> {
  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  // Fetch this week's data
  const { data: thisWeekEmails } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .gte('received_at', weekStart.toISOString())
    .order('received_at', { ascending: false })

  // Fetch last week's data for comparison
  const { data: lastWeekEmails } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .gte('received_at', prevWeekStart.toISOString())
    .lt('received_at', weekStart.toISOString())

  // Fetch ALL emails for sender analysis (last 30 days for more data)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const { data: allRecentEmails } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .gte('received_at', thirtyDaysAgo.toISOString())
    .order('received_at', { ascending: false })

  const emails = (thisWeekEmails || []) as Email[]
  const prevEmails = (lastWeekEmails || []) as Email[]
  const allEmails = (allRecentEmails || []) as Email[]

  // === CALCULATE STATS ===
  const stats = calculateWeeklyStats(emails, [])
  const prevStats = calculateWeeklyStats(prevEmails, [])

  // === TOP SENDERS WITH INSIGHTS (from all recent emails) ===
  const topSenders = analyzeSendersFromEmails(allEmails)

  // === PRODUCTIVITY SCORE ===
  const productivity = calculateProductivityScore(stats, prevStats)

  // === SUGGESTIONS ===
  const suggestions = generateSuggestions(stats, topSenders)

  // === COMPARISON ===
  const comparison = [
    {
      metric: 'Email nhận',
      current: stats.totalReceived,
      previous: prevStats.totalReceived,
      change: stats.totalReceived - prevStats.totalReceived,
      changePercent: prevStats.totalReceived > 0
        ? Math.round((stats.totalReceived - prevStats.totalReceived) / prevStats.totalReceived * 100)
        : 0
    },
    {
      metric: 'Tỷ lệ xử lý',
      current: stats.processRate,
      previous: prevStats.processRate,
      change: stats.processRate - prevStats.processRate,
      changePercent: Math.round(stats.processRate - prevStats.processRate)
    },
    {
      metric: 'Thời gian phản hồi (giờ)',
      current: stats.avgResponseTime,
      previous: prevStats.avgResponseTime,
      change: stats.avgResponseTime - prevStats.avgResponseTime,
      changePercent: prevStats.avgResponseTime > 0
        ? Math.round((stats.avgResponseTime - prevStats.avgResponseTime) / prevStats.avgResponseTime * 100)
        : 0
    }
  ]

  return {
    period: {
      start: weekStart.toISOString(),
      end: now.toISOString()
    },
    stats,
    topSenders,
    productivity,
    suggestions,
    comparison
  }
}

function calculateWeeklyStats(emails: Email[], behaviors: Behavior[]): WeeklyStats {
  const totalReceived = emails.length
  const processed = emails.filter(e => e.is_read || e.is_archived || e.is_deleted)
  const totalProcessed = processed.length
  const processRate = totalReceived > 0 ? Math.round(totalProcessed / totalReceived * 100) : 0

  // Avg response time (for emails that were replied to)
  const repliedBehaviors = behaviors.filter(b => b.action === 'reply' && b.time_to_action)
  const avgResponseTime = repliedBehaviors.length > 0
    ? Math.round(repliedBehaviors.reduce((sum, b) => sum + (b.time_to_action || 0), 0) / repliedBehaviors.length / 3600 * 10) / 10
    : 0

  // Inbox zero days (days where all emails were processed)
  const emailsByDay: Record<string, { received: number; processed: number }> = {}
  emails.forEach(e => {
    const day = new Date(e.received_at).toDateString()
    if (!emailsByDay[day]) emailsByDay[day] = { received: 0, processed: 0 }
    emailsByDay[day].received++
    if (e.is_read || e.is_archived || e.is_deleted) emailsByDay[day].processed++
  })
  const inboxZeroDays = Object.values(emailsByDay).filter(d => d.received === d.processed).length

  // Busiest day
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  const emailsByDayOfWeek: Record<number, number> = {}
  emails.forEach(e => {
    const day = new Date(e.received_at).getDay()
    emailsByDayOfWeek[day] = (emailsByDayOfWeek[day] || 0) + 1
  })
  const busiestDayNum = Object.entries(emailsByDayOfWeek)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '1'
  const busiestDay = dayNames[parseInt(busiestDayNum)]

  // Busiest hour
  const emailsByHour: Record<number, number> = {}
  emails.forEach(e => {
    const hour = new Date(e.received_at).getHours()
    emailsByHour[hour] = (emailsByHour[hour] || 0) + 1
  })
  const busiestHour = parseInt(
    Object.entries(emailsByHour).sort((a, b) => b[1] - a[1])[0]?.[0] || '9'
  )

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {}
  emails.forEach(e => {
    const cat = e.category || 'uncategorized'
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1
  })

  // Priority breakdown
  const priorityBreakdown: Record<number, number> = {}
  emails.forEach(e => {
    const pri = e.priority || 3
    priorityBreakdown[pri] = (priorityBreakdown[pri] || 0) + 1
  })

  return {
    totalReceived,
    totalProcessed,
    processRate,
    avgResponseTime,
    inboxZeroDays,
    busiestDay,
    busiestHour,
    categoryBreakdown,
    priorityBreakdown
  }
}

function analyzeSendersFromEmails(emails: Email[]): SenderInsight[] {
  // Group emails by sender
  const senderMap: Record<string, {
    email: string
    name: string
    total: number
    read: number
    deleted: number
    archived: number
  }> = {}

  emails.forEach(e => {
    const key = e.from_address || 'unknown'
    if (!senderMap[key]) {
      senderMap[key] = {
        email: key,
        name: e.from_name || key.split('@')[0],
        total: 0,
        read: 0,
        deleted: 0,
        archived: 0
      }
    }
    senderMap[key].total++
    if (e.is_read) senderMap[key].read++
    if (e.is_deleted) senderMap[key].deleted++
    if (e.is_archived) senderMap[key].archived++
  })

  // Convert to array and sort by total
  const senders = Object.values(senderMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return senders.map(sender => {
    const openRate = sender.total > 0
      ? Math.round(sender.read / sender.total * 100)
      : 0

    let suggestion: 'vip' | 'unsubscribe' | 'mute' | 'none' = 'none'
    let reason = ''

    // Suggest VIP if high engagement
    if (openRate >= 90 && sender.total >= 3) {
      suggestion = 'vip'
      reason = 'Luôn mở email từ người này'
    }
    // Suggest unsubscribe if very low engagement
    else if (openRate < 20 && sender.total >= 5) {
      suggestion = 'unsubscribe'
      reason = `${sender.total} email, chỉ mở ${sender.read}`
    }
    // Suggest mute if mostly deleted
    else if (sender.deleted > sender.read && sender.total >= 3) {
      suggestion = 'mute'
      reason = 'Thường xóa email từ người này'
    }

    return {
      email: sender.email,
      name: sender.name,
      totalEmails: sender.total,
      openRate,
      avgReadTime: 0,
      importance: openRate,
      suggestion,
      reason
    }
  })
}

function calculateProductivityScore(stats: WeeklyStats, prevStats: WeeklyStats): ProductivityScore {
  const factors = [
    {
      name: 'Tỷ lệ xử lý email',
      score: Math.min(100, stats.processRate),
      weight: 0.3
    },
    {
      name: 'Inbox Zero',
      score: Math.min(100, stats.inboxZeroDays / 7 * 100),
      weight: 0.2
    },
    {
      name: 'Thời gian phản hồi',
      score: Math.max(0, 100 - stats.avgResponseTime * 5), // Penalty for slow response
      weight: 0.25
    },
    {
      name: 'Xử lý email quan trọng',
      score: Math.min(100, (stats.priorityBreakdown[4] || 0) + (stats.priorityBreakdown[5] || 0) > 0 ? 80 : 100),
      weight: 0.25
    }
  ]

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  )

  const prevScore = prevStats.totalReceived > 0
    ? Math.round(prevStats.processRate * 0.3 + (prevStats.inboxZeroDays / 7 * 100) * 0.2 + 50 * 0.5)
    : score

  let grade: 'Xuất sắc' | 'Tốt' | 'Khá' | 'Cần cải thiện'
  if (score >= 85) grade = 'Xuất sắc'
  else if (score >= 70) grade = 'Tốt'
  else if (score >= 50) grade = 'Khá'
  else grade = 'Cần cải thiện'

  const trendValue = score - prevScore
  let trend: 'up' | 'down' | 'stable'
  if (trendValue > 3) trend = 'up'
  else if (trendValue < -3) trend = 'down'
  else trend = 'stable'

  return { score, grade, trend, trendValue, factors }
}

function generateSuggestions(
  stats: WeeklyStats,
  senders: SenderInsight[]
): WeeklyReport['suggestions'] {
  const suggestions: WeeklyReport['suggestions'] = []

  // Unsubscribe suggestions
  const unsubscribeCandidates = senders.filter(s => s.suggestion === 'unsubscribe')
  if (unsubscribeCandidates.length > 0) {
    suggestions.push({
      type: 'unsubscribe',
      title: `Unsubscribe ${unsubscribeCandidates.length} nguồn email`,
      description: `Các nguồn này gửi nhiều nhưng sếp hầu như không mở`,
      actionable: true,
      data: unsubscribeCandidates.map(s => s.email)
    })
  }

  // VIP suggestions
  const vipCandidates = senders.filter(s => s.suggestion === 'vip')
  if (vipCandidates.length > 0) {
    suggestions.push({
      type: 'vip',
      title: `Đánh dấu VIP cho ${vipCandidates.length} người gửi`,
      description: `Email từ những người này luôn được mở nhanh`,
      actionable: true,
      data: vipCandidates.map(s => s.email)
    })
  }

  // Rule suggestion based on patterns
  const newsletterCount = stats.categoryBreakdown['newsletter'] || 0
  if (newsletterCount > 10) {
    suggestions.push({
      type: 'rule',
      title: 'Tạo rule tự động cho Newsletter',
      description: `Tuần này có ${newsletterCount} newsletter. Gom lại và đọc 1 lần/tuần?`,
      actionable: true
    })
  }

  // Habit suggestion
  if (stats.busiestHour >= 9 && stats.busiestHour <= 11) {
    suggestions.push({
      type: 'habit',
      title: 'Email tập trung buổi sáng',
      description: `Phần lớn email đến lúc ${stats.busiestHour}h. Cân nhắc check email cố định 9h và 14h.`,
      actionable: false
    })
  }

  return suggestions
}

// Daily digest for quick check
export async function generateDailyDigest(userId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const { data: todayEmails } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .gte('received_at', todayStart.toISOString())

  const { data: unreadImportant } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .gte('priority', 4)

  const emails = (todayEmails || []) as Email[]
  const important = (unreadImportant || []) as Email[]

  return {
    date: todayStart.toISOString(),
    todayCount: emails.length,
    unreadCount: emails.filter(e => !e.is_read).length,
    importantUnread: important.length,
    byCategory: {
      work: emails.filter(e => e.category === 'work').length,
      personal: emails.filter(e => e.category === 'personal').length,
      newsletter: emails.filter(e => e.category === 'newsletter').length,
      promotion: emails.filter(e => e.category === 'promotion').length,
    },
    topSenders: Object.entries(
      emails.reduce((acc: Record<string, number>, e) => {
        const key = e.from_name || e.from_address
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }
}
