import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SenderScore {
  id: string
  sender_email: string
  sender_name: string | null
  importance_score: number
  engagement_score: number
  annoyance_score: number
  total_received: number
  total_opened: number
  total_replied: number
  total_deleted: number
  total_archived: number
  avg_read_time: number
  is_vip: boolean
  is_muted: boolean
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get sender scores
  const { data: senders, error } = await supabase
    .from('sender_scores')
    .select('*')
    .eq('user_id', user.id)
    .order('total_received', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Failed to fetch sender scores:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const allSenders = (senders || []) as SenderScore[]

  // Categorize senders
  const vipSenders = allSenders.filter(s => s.importance_score >= 70 || s.is_vip)
  const engagedSenders = allSenders.filter(s => s.engagement_score >= 60)
  const annoyingSenders = allSenders.filter(s => s.annoyance_score >= 50)
  const topSenders = allSenders.slice(0, 10)

  // Calculate stats
  const totalEmails = allSenders.reduce((sum, s) => sum + s.total_received, 0)
  const totalOpened = allSenders.reduce((sum, s) => sum + s.total_opened, 0)
  const totalReplied = allSenders.reduce((sum, s) => sum + s.total_replied, 0)
  const totalDeleted = allSenders.reduce((sum, s) => sum + s.total_deleted, 0)

  const overallOpenRate = totalEmails > 0 ? Math.round((totalOpened / totalEmails) * 100) : 0
  const overallReplyRate = totalEmails > 0 ? Math.round((totalReplied / totalEmails) * 100) : 0
  const overallDeleteRate = totalEmails > 0 ? Math.round((totalDeleted / totalEmails) * 100) : 0

  return NextResponse.json({
    vipSenders,
    engagedSenders,
    annoyingSenders,
    topSenders,
    totalTracked: allSenders.length,
    stats: {
      totalEmails,
      totalOpened,
      totalReplied,
      totalDeleted,
      overallOpenRate,
      overallReplyRate,
      overallDeleteRate
    }
  })
}

// Update VIP status
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { senderEmail, isVip, isMuted } = await request.json()

  if (!senderEmail) {
    return NextResponse.json({ error: 'Missing sender email' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof isVip === 'boolean') {
    updates.is_vip = isVip
  }

  if (typeof isMuted === 'boolean') {
    updates.is_muted = isMuted
  }

  const { error } = await supabase
    .from('sender_scores')
    .update(updates)
    .eq('user_id', user.id)
    .eq('sender_email', senderEmail)

  if (error) {
    console.error('Failed to update sender:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
