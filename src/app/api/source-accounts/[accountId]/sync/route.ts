import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'

// Shorter timeout for faster response
export const maxDuration = 30

// POST - Trigger sync for account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const startTime = Date.now()
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

  // Parse request body for options - DEFAULT 30 emails max
  let limit = 30
  let fullSync = false
  try {
    const body = await request.json()
    if (body.limit) limit = Math.min(body.limit, 50)  // Max 50
    if (body.fullSync) fullSync = true
  } catch {
    // No body provided, use defaults
  }

  console.log(`[SYNC-API] Starting for ${account.email_address}, limit=${limit}`)

  // Perform sync with options (headers only - fast!)
  const result = await syncEmails(account, { limit, fullSync })

  const duration = Date.now() - startTime
  console.log(`[SYNC-API] Done in ${duration}ms: ${result.synced} synced`)

  return NextResponse.json({
    success: result.success,
    synced: result.synced,
    lastUid: result.lastUid,
    duration: `${duration}ms`,
    errors: result.errors.slice(0, 3),
    message: result.synced > 0
      ? `Đã đồng bộ ${result.synced} email mới`
      : 'Không có email mới'
  })
}
