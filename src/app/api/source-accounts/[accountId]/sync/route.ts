import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'
import { classifyEmail } from '@/lib/ai/classifier'

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
  let limit = 50
  try {
    const body = await request.json()
    if (body.limit) limit = Math.min(body.limit, 200)
  } catch {
    // No body provided, use defaults
  }

  // Perform sync
  const result = await syncEmails(account, limit)

  // Update sync count
  if (result.synced > 0) {
    await supabase
      .from('source_accounts')
      .update({
        total_emails_synced: account.total_emails_synced + result.synced
      })
      .eq('id', accountId)

    // Auto-classify new emails (async, non-blocking)
    classifyNewEmails(supabase, user.id).catch(err => {
      console.error('Auto-classify error:', err)
    })
  }

  return NextResponse.json({
    success: result.success,
    synced: result.synced,
    errors: result.errors,
    message: result.success
      ? `Synced ${result.synced} emails`
      : 'Sync failed'
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
