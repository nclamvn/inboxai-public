import { requireCronAuthorization } from '@/lib/security/cron'
import { NextRequest, NextResponse } from 'next/server'
import { aggregateDailyMetrics } from '@/lib/ai/classification-logger'

export const maxDuration = 60 // 1 minute
export const dynamic = 'force-dynamic'

/**
 * Cron job to aggregate daily AI metrics
 * Should run once per day (e.g., at 00:05 UTC)
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuthorization(request)
  if (denied) return denied

  try {
    const startTime = Date.now()

    // Aggregate yesterday's metrics
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const result = await aggregateDailyMetrics(yesterday)

    const duration = Date.now() - startTime

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Metrics aggregation completed',
        date: yesterday.toISOString().split('T')[0],
        aggregatedCount: result.count,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Metrics aggregation failed',
        duration: `${duration}ms`
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[CRON:Metrics] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Aggregation failed',
      details: errorMessage
    }, { status: 500 })
  }
}

// Also allow POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
