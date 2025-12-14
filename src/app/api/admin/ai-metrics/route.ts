import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getRealtimeStats,
  getDailyMetrics,
  getAccuracyByCategory
} from '@/lib/ai/classification-logger'

/**
 * GET /api/admin/ai-metrics
 * Get AI classification metrics for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    const type = searchParams.get('type') || 'realtime' // 'realtime' or 'daily'

    if (type === 'daily') {
      // Get daily aggregated metrics
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const metrics = await getDailyMetrics(user.id, startDate, endDate)

      return NextResponse.json({
        type: 'daily',
        days,
        metrics
      })
    } else {
      // Get realtime stats
      const stats = await getRealtimeStats(user.id, days)
      const accuracyByCategory = await getAccuracyByCategory(user.id, days)

      return NextResponse.json({
        type: 'realtime',
        days,
        stats: {
          ...stats,
          accuracyByCategory
        }
      })
    }
  } catch (error) {
    console.error('AI metrics error:', error)
    return NextResponse.json({ error: 'Failed to get metrics' }, { status: 500 })
  }
}
