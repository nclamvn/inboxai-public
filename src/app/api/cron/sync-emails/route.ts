import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncEmails } from '@/lib/email/imap-client'
import { getUnsubscribeService } from '@/lib/email/unsubscribe-service'
import { classifyEmail } from '@/lib/ai/classifier'
import { notifySyncComplete, notifyAiClassified } from '@/lib/notifications/create'

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

// OPTIMIZED CRON SETTINGS
const CRON_EMAILS_PER_ACCOUNT = 100 // Increased from 30
const CLASSIFY_BATCH_SIZE = 5 // Emails to classify per account

// Classify newly synced emails for a user
async function classifyUserEmails(
  userId: string,
  limit: number = CLASSIFY_BATCH_SIZE
): Promise<number> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data: emails } = await supabase
      .from('emails')
      .select('id, from_address, from_name, subject, body_text, body_html')
      .eq('user_id', userId)
      .or('category.is.null,category.eq.uncategorized')
      .order('received_at', { ascending: false })
      .limit(limit)

    if (!emails || emails.length === 0) return 0

    let classified = 0
    for (const email of emails) {
      try {
        const classification = await classifyEmail({
          email_id: email.id,
          from_address: email.from_address,
          from_name: email.from_name,
          subject: email.subject,
          body_text: email.body_text,
          body_html: email.body_html,
          user_id: userId
        })

        await supabase
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

        classified++
      } catch {
        // Continue with next email
      }
    }

    return classified
  } catch {
    return 0
  }
}

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
    const results: {
      processed: number
      synced: number
      classified: number
      filtered: number
      errors: string[]
      accounts: Array<{
        email: string
        synced: number
        classified: number
        errors: string[]
      }>
    } = {
      processed: 0,
      synced: 0,
      classified: 0,
      filtered: 0,
      errors: [],
      accounts: []
    }

    // Get all active source accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('source_accounts')
      .select('*')
      .eq('is_active', true)
      .order('last_sync_at', { ascending: true, nullsFirst: true })
      .limit(10) // Process max 10 accounts per run

    if (accountsError) {
      console.error('[CRON] Error fetching accounts:', accountsError)
      return NextResponse.json({
        error: 'Failed to fetch accounts',
        details: accountsError.message
      }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts to sync',
        duration: Date.now() - startTime
      })
    }

    console.log(`[CRON] Syncing ${accounts.length} accounts`)

    const unsubscribeService = getUnsubscribeService(supabase)

    // Process each account
    for (const account of accounts) {
      results.processed++
      const accountResult = {
        email: account.email_address,
        synced: 0,
        classified: 0,
        errors: [] as string[]
      }

      try {
        // Check if account was synced recently (within 1 minute)
        if (account.last_sync_at) {
          const lastSync = new Date(account.last_sync_at)
          const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
          if (lastSync > oneMinuteAgo) {
            console.log(`[CRON] Skipping ${account.email_address} - synced recently`)
            continue
          }
        }

        console.log(`[CRON] Syncing: ${account.email_address}`)

        // Perform OPTIMIZED IMAP sync
        const syncResult = await syncEmails(account, {
          limit: CRON_EMAILS_PER_ACCOUNT,
          fullSync: false
        })

        if (syncResult.success) {
          accountResult.synced = syncResult.synced
          results.synced += syncResult.synced
          console.log(`[CRON] Synced ${syncResult.synced} emails for ${account.email_address}`)

          // Classify newly synced emails for this user
          if (syncResult.synced > 0) {
            const classified = await classifyUserEmails(
              account.user_id,
              Math.min(syncResult.synced, CLASSIFY_BATCH_SIZE)
            )
            accountResult.classified = classified
            results.classified += classified
            console.log(`[CRON] Classified ${classified} emails for ${account.email_address}`)

            // Send notifications
            if (syncResult.synced > 0) {
              notifySyncComplete(account.user_id, syncResult.synced).catch(() => {})
            }
            if (classified > 0) {
              notifyAiClassified(account.user_id, classified).catch(() => {})
            }
          }
        } else {
          accountResult.errors = syncResult.errors
          results.errors.push(`${account.email_address}: ${syncResult.errors.join(', ')}`)
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        accountResult.errors.push(errorMsg)
        results.errors.push(`${account.email_address}: ${errorMsg}`)

        // Update sync error
        await supabase
          .from('source_accounts')
          .update({
            sync_error: errorMsg
          })
          .eq('id', account.id)
      }

      results.accounts.push(accountResult)

      // Check timeout
      if (Date.now() - startTime > 280000) { // 280 seconds
        console.log('[CRON] Approaching timeout, stopping')
        break
      }
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: `Cron sync completed`,
      results: {
        processed: results.processed,
        synced: results.synced,
        classified: results.classified,
        errors: results.errors.length
      },
      accounts: results.accounts,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[CRON] Sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage
    }, { status: 500 })
  }
}

// Also allow POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
