import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectFollowUps, type EmailForFollowUp } from '@/lib/ai/follow-up-detector'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type') // 'awaiting_reply' | 'needs_reply' | etc.
  const priority = searchParams.get('priority') // 'high' | 'medium' | 'low'
  const status = searchParams.get('status') || 'pending' // 'pending' | 'done' | 'dismissed'
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    // Try to query from follow_ups table
    let query = supabase
      .from('follow_ups')
      .select(`
        *,
        emails:email_id (
          id, subject, from_address, from_name, to_addresses,
          received_at, is_read, snippet, category
        )
      `)
      .eq('user_id', user.id)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('type', type)
    }
    if (priority) {
      query = query.eq('priority', priority)
    }

    const { data: followUps, error } = await query

    if (error) {
      // Table might not exist yet - return empty
      console.error('[FOLLOW_UPS] Query error:', error)
      return NextResponse.json({
        followUps: [],
        counts: { total: 0, high: 0, medium: 0, low: 0 },
        message: 'Follow-ups table not yet created. Please run the SQL migration.'
      })
    }

    // Get counts by priority
    const { data: counts } = await supabase
      .from('follow_ups')
      .select('priority')
      .eq('user_id', user.id)
      .eq('status', 'pending')

    const priorityCounts = {
      total: counts?.length || 0,
      high: counts?.filter(f => f.priority === 'high').length || 0,
      medium: counts?.filter(f => f.priority === 'medium').length || 0,
      low: counts?.filter(f => f.priority === 'low').length || 0
    }

    return NextResponse.json({
      followUps: followUps || [],
      counts: priorityCounts
    })
  } catch (error) {
    console.error('[FOLLOW_UPS] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch follow-ups' }, { status: 500 })
  }
}

// POST - Scan emails for follow-ups
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { scan } = await request.json()

    if (scan) {
      // Scan recent emails for follow-ups
      const daysBack = 7
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - daysBack)

      // Get user's email for determining sent vs received
      const { data: sourceAccounts } = await supabase
        .from('source_accounts')
        .select('email')
        .eq('user_id', user.id)

      const userEmails = sourceAccounts?.map(a => a.email.toLowerCase()) || []

      // Fetch recent emails that might need follow-up
      const { data: emails, error: emailsError } = await supabase
        .from('emails')
        .select('id, from_address, from_name, to_addresses, subject, body_text, received_at, is_read, category, thread_id')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .in('category', ['work', 'personal', 'uncategorized'])
        .gte('received_at', sinceDate.toISOString())
        .order('received_at', { ascending: false })
        .limit(100)

      if (emailsError) {
        throw emailsError
      }

      if (!emails || emails.length === 0) {
        return NextResponse.json({
          message: 'No emails to scan',
          found: 0
        })
      }

      // Prepare emails for analysis
      const emailsForAnalysis: EmailForFollowUp[] = emails.map(email => ({
        id: email.id,
        from_address: email.from_address,
        from_name: email.from_name,
        to_addresses: email.to_addresses || [],
        subject: email.subject,
        body_text: email.body_text,
        received_at: email.received_at,
        is_read: email.is_read,
        category: email.category,
        thread_id: email.thread_id,
        user_email: userEmails[0] || ''
      }))

      // Detect follow-ups
      const followUps = await detectFollowUps(emailsForAnalysis, userEmails[0] || '')

      // Save to database
      if (followUps.length > 0) {
        const followUpsToInsert = followUps.map(fu => ({
          user_id: user.id,
          email_id: fu.emailId,
          type: fu.type,
          priority: fu.priority,
          reason: fu.reason,
          suggested_action: fu.suggestedAction,
          due_date: fu.dueDate || null,
          person_email: fu.personInvolved.email,
          person_name: fu.personInvolved.name || null,
          confidence: fu.confidence,
          status: 'pending'
        }))

        // Upsert to avoid duplicates
        const { error: insertError } = await supabase
          .from('follow_ups')
          .upsert(followUpsToInsert, {
            onConflict: 'user_id,email_id',
            ignoreDuplicates: false
          })

        if (insertError) {
          console.error('[FOLLOW_UPS] Insert error:', insertError)
          // Table might not exist, return result anyway
          return NextResponse.json({
            message: 'Detected follow-ups but could not save. Please run SQL migration.',
            found: followUps.length,
            followUps
          })
        }
      }

      return NextResponse.json({
        message: `Scanned ${emails.length} emails`,
        found: followUps.length,
        followUps
      })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error) {
    console.error('[FOLLOW_UPS] Scan error:', error)
    return NextResponse.json({ error: 'Failed to scan emails' }, { status: 500 })
  }
}

// PATCH - Update follow-up status
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, status, snoozeDays } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Follow-up ID required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (status) {
      updates.status = status // 'done' | 'dismissed' | 'pending'
    }

    if (snoozeDays) {
      const snoozeUntil = new Date()
      snoozeUntil.setDate(snoozeUntil.getDate() + snoozeDays)
      updates.snooze_until = snoozeUntil.toISOString()
    }

    const { error } = await supabase
      .from('follow_ups')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FOLLOW_UPS] Update error:', error)
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 })
  }
}
