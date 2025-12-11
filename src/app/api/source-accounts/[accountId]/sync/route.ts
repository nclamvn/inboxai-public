import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'

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
