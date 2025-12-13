import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get counts by priority for pending follow-ups
    const { data: followUps, error } = await supabase
      .from('follow_ups')
      .select('priority')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .or('snooze_until.is.null,snooze_until.lte.' + new Date().toISOString())

    if (error) {
      // Table might not exist yet
      return NextResponse.json({
        total: 0,
        high: 0,
        medium: 0,
        low: 0
      })
    }

    const counts = {
      total: followUps?.length || 0,
      high: followUps?.filter(f => f.priority === 'high').length || 0,
      medium: followUps?.filter(f => f.priority === 'medium').length || 0,
      low: followUps?.filter(f => f.priority === 'low').length || 0
    }

    return NextResponse.json(counts)
  } catch (error) {
    console.error('[FOLLOW_UPS_COUNTS] Error:', error)
    return NextResponse.json({
      total: 0,
      high: 0,
      medium: 0,
      low: 0
    })
  }
}
