import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'
import { syncGmailEmails } from '@/lib/gmail/sync'

// Longer timeout for optimized batch sync
export const maxDuration = 120 // Increased to 2 minutes

// OPTIMIZED LIMITS
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

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

  // Parse request body for options - OPTIMIZED defaults
  let limit = DEFAULT_LIMIT
  let fullSync = false
  try {
    const body = await request.json()
    if (body.limit) limit = Math.min(body.limit, MAX_LIMIT)  // Max 500 per sync
    if (body.fullSync) fullSync = true
  } catch {
    // No body provided, use defaults
  }

  console.log(`[SYNC-API] Starting sync for ${account.email_address}, auth_type=${account.auth_type}, limit=${limit}`)

  let result: { success: boolean; synced?: number; syncedCount?: number; errors?: string[]; error?: string; lastUid?: string }

  // Route to appropriate sync method based on auth_type
  if (account.auth_type === 'oauth_google') {
    // Gmail OAuth - use Gmail API sync
    console.log(`[SYNC-API] Using Gmail API sync for OAuth account`)
    result = await syncGmailEmails(user.id, accountId, {
      maxResults: limit,
      fullSync
    })
    // Normalize result format
    result = {
      success: result.success,
      synced: result.syncedCount,
      errors: result.error ? [result.error] : []
    }
  } else {
    // IMAP - use IMAP sync
    console.log(`[SYNC-API] Using IMAP sync`)
    result = await syncEmails(account, { limit, fullSync })
  }

  const duration = Date.now() - startTime
  console.log(`[SYNC-API] Done in ${duration}ms: ${result.synced} synced`)

  return NextResponse.json({
    success: result.success,
    synced: result.synced || 0,
    lastUid: result.lastUid,
    duration: `${duration}ms`,
    errors: (result.errors || []).slice(0, 3),
    message: (result.synced || 0) > 0
      ? `Đã đồng bộ ${result.synced} email`
      : 'Không có email mới'
  })
}
