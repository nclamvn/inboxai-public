import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { syncEmails } from '@/lib/email/imap-client'
import { classifyEmail } from '@/lib/ai/classifier'
import { notifySyncComplete } from '@/lib/notifications/create'

export const maxDuration = 60

// Classify newly synced emails (background, fire-and-forget)
async function classifyNewEmails(userId: string, limit: number = 10) {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Get recent unclassified emails for this user
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

// POST - Sync all active accounts for user
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse options
  let limit = 30
  let fullSync = false
  try {
    const body = await request.json()
    if (body.limit) limit = Math.min(body.limit, 50)
    if (body.fullSync) fullSync = true
  } catch {
    // No body
  }

  // Get all active accounts
  const { data: accounts, error } = await supabase
    .from('source_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      success: true,
      synced: 0,
      message: 'No active accounts'
    })
  }

  // Check rate limit - don't sync too often
  const recentlySynced = accounts.every(acc => {
    if (!acc.last_sync_at) return false
    const lastSync = new Date(acc.last_sync_at)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000)
    return lastSync > thirtySecondsAgo
  })

  if (recentlySynced && !fullSync) {
    return NextResponse.json({
      success: true,
      synced: 0,
      skipped: true,
      message: 'Synced recently'
    })
  }

  let totalSynced = 0
  const errors: string[] = []

  // Sync each account
  for (const account of accounts) {
    try {
      const result = await syncEmails(account, { limit, fullSync })

      if (result.success) {
        totalSynced += result.synced
      } else {
        errors.push(...result.errors.slice(0, 2))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${account.email_address}: ${msg}`)
    }

    // Timeout check
    if (Date.now() - startTime > 55000) {
      break
    }
  }

  const duration = Date.now() - startTime

  // Trigger classification for newly synced emails (fire-and-forget)
  if (totalSynced > 0) {
    // Classify in background, don't wait
    classifyNewEmails(user.id, Math.min(totalSynced, 20)).then(classified => {
      if (classified > 0) {
        // Send notification about sync completion
        notifySyncComplete(user.id, totalSynced).catch(() => {})
      }
    }).catch(() => {})
  }

  return NextResponse.json({
    success: true,
    synced: totalSynced,
    accounts: accounts.length,
    duration: `${duration}ms`,
    errors: errors.slice(0, 3),
    message: totalSynced > 0
      ? `Đã đồng bộ ${totalSynced} email mới`
      : 'Không có email mới'
  })
}

// GET - Get sync status
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: accounts } = await supabase
    .from('source_accounts')
    .select('id, email_address, last_sync_at, sync_error, total_emails_synced')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const lastSyncAt = accounts?.reduce((latest, acc) => {
    if (!acc.last_sync_at) return latest
    if (!latest) return acc.last_sync_at
    return new Date(acc.last_sync_at) > new Date(latest) ? acc.last_sync_at : latest
  }, null as string | null)

  return NextResponse.json({
    accounts: accounts?.length || 0,
    lastSyncAt,
    status: accounts?.map(a => ({
      email: a.email_address,
      lastSync: a.last_sync_at,
      error: a.sync_error,
      totalSynced: a.total_emails_synced
    }))
  })
}
