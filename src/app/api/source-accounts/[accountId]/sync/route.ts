import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'
import { classifyEmail } from '@/lib/ai/classifier'

// Allow longer execution time for sync
export const maxDuration = 60

// POST - Trigger sync for account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get account with credentials
  const { data: account, error } = await supabase
    .from('source_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  if (!account.is_active) {
    return NextResponse.json({ error: 'Account is not active' }, { status: 400 })
  }

  // Parse request body for options
  let limit = 200  // Increased default
  let fullSync = false
  try {
    const body = await request.json()
    if (body.limit) limit = Math.min(body.limit, 500)  // Allow up to 500
    if (body.fullSync) fullSync = true
  } catch {
    // No body provided, use defaults
  }

  console.log(`[API] Starting sync for ${account.email_address}`)
  console.log(`[API] Options: limit=${limit}, fullSync=${fullSync}`)
  console.log(`[API] Current last_sync_uid: ${account.last_sync_uid || 'none'}`)

  // Perform sync with options
  const result = await syncEmails(account, { limit, fullSync })

  // Auto-classify new emails (async, non-blocking)
  if (result.synced > 0) {
    classifyNewEmails(supabase, user.id).catch(err => {
      console.error('Auto-classify error:', err)
    })
  }

  console.log(`[API] Sync completed: ${result.synced} emails synced`)

  return NextResponse.json({
    success: result.success,
    synced: result.synced,
    lastUid: result.lastUid,
    errors: result.errors.slice(0, 5),  // Limit errors returned
    message: result.synced > 0
      ? `Đã đồng bộ ${result.synced} email mới`
      : 'Không có email mới'
  })
}

// Helper function to classify new emails
async function classifyNewEmails(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, userId: string) {
  // Get unclassified emails
  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_address, from_name, subject, body_text, body_html')
    .eq('user_id', userId)
    .or('category.is.null,category.eq.uncategorized')
    .order('received_at', { ascending: false })
    .limit(10)

  if (!emails || emails.length === 0) return

  for (const email of emails) {
    try {
      const classification = await classifyEmail({
        from_address: email.from_address,
        from_name: email.from_name,
        subject: email.subject,
        body_text: email.body_text,
        body_html: email.body_html
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

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (err) {
      console.error(`Failed to classify email ${email.id}:`, err)
    }
  }
}
