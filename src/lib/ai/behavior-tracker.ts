import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type BehaviorAction = 'open' | 'read' | 'reply' | 'archive' | 'delete' | 'star' | 'unstar'

interface TrackBehaviorInput {
  userId: string
  emailId: string
  action: BehaviorAction
  readDuration?: number  // seconds
}

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

function getDayOfWeek(): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()]
}

export async function trackBehavior(input: TrackBehaviorInput) {
  const { userId, emailId, action, readDuration } = input

  // Get email để tính time_to_action
  const { data: email } = await supabase
    .from('emails')
    .select('received_at, from_address, from_name')
    .eq('id', emailId)
    .single()

  const timeToAction = email?.received_at
    ? Math.floor((Date.now() - new Date(email.received_at).getTime()) / 1000)
    : null

  // Insert behavior
  await supabase.from('user_behaviors').insert({
    user_id: userId,
    email_id: emailId,
    action,
    time_of_day: getTimeOfDay(),
    day_of_week: getDayOfWeek(),
    time_to_action: timeToAction,
    read_duration: readDuration
  })

  // Update sender score
  if (email?.from_address) {
    await updateSenderScore(userId, email.from_address, email.from_name, action, readDuration)
  }
}

async function updateSenderScore(
  userId: string,
  senderEmail: string,
  senderName: string | null,
  action: BehaviorAction,
  readDuration?: number
) {
  // Upsert sender score
  const { data: existing } = await supabase
    .from('sender_scores')
    .select('*')
    .eq('user_id', userId)
    .eq('sender_email', senderEmail)
    .single()

  if (existing) {
    // Update existing
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (action === 'open') {
      updates.total_opened = existing.total_opened + 1
    } else if (action === 'reply') {
      updates.total_replied = existing.total_replied + 1
    } else if (action === 'delete') {
      updates.total_deleted = existing.total_deleted + 1
    } else if (action === 'archive') {
      updates.total_archived = existing.total_archived + 1
    }

    if (readDuration) {
      updates.avg_read_time = Math.floor(
        (existing.avg_read_time * existing.total_opened + readDuration) / (existing.total_opened + 1)
      )
    }

    // Recalculate scores
    const totalInteractions = existing.total_opened + (action === 'open' ? 1 : 0)
    const totalReceived = existing.total_received

    if (totalReceived > 0) {
      // Importance: based on open rate and reply rate
      const openRate = totalInteractions / totalReceived
      const replyRate = existing.total_replied / totalReceived
      updates.importance_score = Math.min(100, Math.floor((openRate * 60) + (replyRate * 40) * 100))

      // Annoyance: based on delete rate and low engagement
      const deleteRate = existing.total_deleted / totalReceived
      updates.annoyance_score = Math.floor(deleteRate * 100)

      // Engagement: based on read time
      const avgReadTime = updates.avg_read_time as number | undefined
      if (avgReadTime) {
        updates.engagement_score = Math.min(100, Math.floor(avgReadTime / 60 * 20)) // 5 min = 100
      }
    }

    await supabase
      .from('sender_scores')
      .update(updates)
      .eq('id', existing.id)

  } else {
    // Create new
    await supabase.from('sender_scores').insert({
      user_id: userId,
      sender_email: senderEmail,
      sender_name: senderName,
      total_received: 1,
      total_opened: action === 'open' ? 1 : 0,
      total_replied: action === 'reply' ? 1 : 0,
      total_deleted: action === 'delete' ? 1 : 0,
      total_archived: action === 'archive' ? 1 : 0,
      avg_read_time: readDuration || 0
    })
  }
}

// Increment received count when email arrives
export async function trackEmailReceived(userId: string, senderEmail: string, senderName?: string) {
  const { data: existing } = await supabase
    .from('sender_scores')
    .select('id, total_received')
    .eq('user_id', userId)
    .eq('sender_email', senderEmail)
    .single()

  if (existing) {
    await supabase
      .from('sender_scores')
      .update({
        total_received: existing.total_received + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('sender_scores').insert({
      user_id: userId,
      sender_email: senderEmail,
      sender_name: senderName,
      total_received: 1
    })
  }
}

// Get user's behavior summary
export async function getUserBehaviorSummary(userId: string) {
  const { data: behaviors } = await supabase
    .from('user_behaviors')
    .select('action, time_of_day, day_of_week')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!behaviors || behaviors.length === 0) {
    return null
  }

  // Analyze patterns
  const timeOfDayCounts: Record<string, number> = {}
  const dayOfWeekCounts: Record<string, number> = {}
  const actionCounts: Record<string, number> = {}

  behaviors.forEach(b => {
    if (b.time_of_day) {
      timeOfDayCounts[b.time_of_day] = (timeOfDayCounts[b.time_of_day] || 0) + 1
    }
    if (b.day_of_week) {
      dayOfWeekCounts[b.day_of_week] = (dayOfWeekCounts[b.day_of_week] || 0) + 1
    }
    actionCounts[b.action] = (actionCounts[b.action] || 0) + 1
  })

  // Find preferred time
  const preferredTime = Object.entries(timeOfDayCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'morning'

  // Find most active day
  const mostActiveDay = Object.entries(dayOfWeekCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'monday'

  return {
    totalActions: behaviors.length,
    preferredTime,
    mostActiveDay,
    actionCounts,
    timeOfDayCounts,
    dayOfWeekCounts
  }
}
