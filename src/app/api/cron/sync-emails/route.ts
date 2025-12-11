import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const startTime = Date.now()
    const results = {
      processed: 0,
      synced: 0,
      errors: [] as string[]
    }

    // Get all active source accounts that need syncing
    const { data: accounts, error: accountsError } = await supabase
      .from('source_accounts')
      .select('*')
      .eq('is_active', true)

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError)
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

    // Process each account
    for (const account of accounts) {
      results.processed++

      try {
        // Update last sync attempt
        await supabase
          .from('source_accounts')
          .update({
            last_sync_at: new Date().toISOString(),
            sync_error: null
          })
          .eq('id', account.id)

        // TODO: Implement actual IMAP sync here
        // For now, just mark as synced
        results.synced++

        console.log(`Synced account: ${account.email_address}`)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push(`${account.email_address}: ${errorMsg}`)

        // Update sync error
        await supabase
          .from('source_accounts')
          .update({
            sync_error: errorMsg
          })
          .eq('id', account.id)
      }
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: `Sync completed`,
      results,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cron sync error:', error)
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
