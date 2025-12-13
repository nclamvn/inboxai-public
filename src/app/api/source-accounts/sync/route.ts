import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/email/imap-client'

export const maxDuration = 60

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
