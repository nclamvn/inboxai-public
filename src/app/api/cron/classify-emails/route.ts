/**
 * Cron Job: Classify Unclassified Emails
 * Runs periodically to classify emails that don't have a category
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyEmail } from '@/lib/ai/classifier'
import { notifyAiClassified } from '@/lib/notifications/create'

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

// Process emails in batches
const BATCH_SIZE = 10
const MAX_EMAILS_PER_RUN = 50

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

  const startTime = Date.now()
  const results = {
    processed: 0,
    classified: 0,
    errors: 0,
    byUser: {} as Record<string, number>
  }

  try {
    // Get unclassified emails (category is null or 'uncategorized')
    const { data: emails, error } = await supabase
      .from('emails')
      .select('id, user_id, from_address, from_name, subject, body_text, body_html')
      .or('category.is.null,category.eq.uncategorized')
      .order('received_at', { ascending: false })
      .limit(MAX_EMAILS_PER_RUN)

    if (error) {
      return NextResponse.json({
        error: 'Failed to fetch emails',
        details: error.message
      }, { status: 500 })
    }

    if (!emails || emails.length === 0) {
      return NextResponse.json({
        message: 'No emails to classify',
        duration: `${Date.now() - startTime}ms`
      })
    }

    // Process in batches
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (email) => {
        try {
          const classification = await classifyEmail({
            email_id: email.id,
            from_address: email.from_address,
            from_name: email.from_name,
            subject: email.subject,
            body_text: email.body_text,
            body_html: email.body_html,
            user_id: email.user_id
          })

          // Update the email with classification
          const { error: updateError } = await supabase
            .from('emails')
            .update({
              priority: classification.priority,
              category: classification.category,
              summary: classification.summary,
              detected_deadline: classification.deadline,
              needs_reply: classification.needs_reply,
              ai_confidence: classification.confidence,
              ai_suggestions: {
                suggested_labels: classification.suggested_labels,
                suggested_action: classification.suggested_action,
                key_entities: classification.key_entities
              }
            })
            .eq('id', email.id)

          if (updateError) {
            results.errors++
            return false
          }

          results.classified++
          results.byUser[email.user_id] = (results.byUser[email.user_id] || 0) + 1
          return true
        } catch {
          results.errors++
          return false
        }
      })

      await Promise.all(batchPromises)
      results.processed += batch.length

      // Check timeout (leave 20s buffer)
      if (Date.now() - startTime > 280000) {
        break
      }
    }

    // Send notifications to users about classified emails
    for (const [userId, count] of Object.entries(results.byUser)) {
      if (count > 0) {
        notifyAiClassified(userId, count).catch(() => {})
      }
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: `Classified ${results.classified} emails`,
      results: {
        processed: results.processed,
        classified: results.classified,
        errors: results.errors,
        users: Object.keys(results.byUser).length
      },
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Classification failed',
      details: errorMessage
    }, { status: 500 })
  }
}

// POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
