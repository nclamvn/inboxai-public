import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateConfidence } from '@/lib/ai/sender-reputation'

export const maxDuration = 60 // 1 minute
export const dynamic = 'force-dynamic'

/**
 * Cron job to recalculate sender reputation confidence scores
 * This can be run periodically to:
 * 1. Apply formula changes to existing records
 * 2. Clean up stale records
 * 3. Ensure data consistency
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const startTime = Date.now()
    let processed = 0
    let updated = 0
    let errors = 0

    // Get all sender_reputation records in batches
    const batchSize = 100
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: reputations, error } = await supabase
        .from('sender_reputation')
        .select('id, total_emails, user_overrides, category_scores, confidence')
        .range(offset, offset + batchSize - 1)
        .order('updated_at', { ascending: true })

      if (error) {
        console.error('[CRON:Reputation] Error fetching reputations:', error)
        return NextResponse.json({
          error: 'Failed to fetch reputations',
          details: error.message
        }, { status: 500 })
      }

      if (!reputations || reputations.length === 0) {
        hasMore = false
        break
      }

      // Process each reputation
      for (const rep of reputations) {
        processed++

        try {
          // Recalculate confidence
          const newConfidence = calculateConfidence(
            rep.total_emails,
            rep.user_overrides,
            rep.category_scores as Record<string, number>
          )

          // Only update if confidence changed significantly (> 0.01 difference)
          if (Math.abs(newConfidence - rep.confidence) > 0.01) {
            const { error: updateError } = await supabase
              .from('sender_reputation')
              .update({ confidence: newConfidence })
              .eq('id', rep.id)

            if (updateError) {
              console.error(`[CRON:Reputation] Error updating ${rep.id}:`, updateError)
              errors++
            } else {
              updated++
            }
          }
        } catch (err) {
          console.error(`[CRON:Reputation] Error processing ${rep.id}:`, err)
          errors++
        }
      }

      offset += batchSize

      // Check timeout (50 seconds to leave buffer)
      if (Date.now() - startTime > 50000) {
        console.log('[CRON:Reputation] Approaching timeout, stopping')
        break
      }
    }

    const duration = Date.now() - startTime

    console.log(`[CRON:Reputation] Completed: processed=${processed}, updated=${updated}, errors=${errors}`)

    return NextResponse.json({
      success: true,
      message: 'Reputation recalculation completed',
      results: {
        processed,
        updated,
        errors
      },
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[CRON:Reputation] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Recalculation failed',
      details: errorMessage
    }, { status: 500 })
  }
}

// Also allow POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
