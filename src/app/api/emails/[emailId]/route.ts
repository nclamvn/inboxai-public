import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { fetchEmailBody } from '@/lib/email/imap-client'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params

  // Fetch email with source account info
  const { data: email, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // LAZY LOAD: If body not fetched yet and has source account, fetch from IMAP
  if (!email.body_fetched && email.source_account_id && email.original_uid) {
    console.log(`[API] Lazy loading body for email ${email.id}`)

    // Get source account with credentials
    const { data: account } = await supabaseAdmin
      .from('source_accounts')
      .select('*')
      .eq('id', email.source_account_id)
      .single()

    if (account) {
      try {
        const body = await fetchEmailBody(account, email.original_uid)

        if (body) {
          // Update database with fetched body
          await supabaseAdmin
            .from('emails')
            .update({
              body_text: body.body_text,
              body_html: body.body_html,
              body_fetched: true
            })
            .eq('id', email.id)

          // Update response
          email.body_text = body.body_text
          email.body_html = body.body_html
          email.body_fetched = true

          console.log(`[API] Body fetched and cached for email ${email.id}`)
        }
      } catch (fetchError) {
        console.error(`[API] Failed to fetch body:`, fetchError)
        // Continue without body - don't fail the request
      }
    }
  }

  // Mark as read if unread
  if (!email.is_read) {
    await supabase
      .from('emails')
      .update({ is_read: true })
      .eq('id', emailId)
    email.is_read = true
  }

  return NextResponse.json({ email })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params
  const updates = await request.json()

  // Only allow these fields to be updated
  const allowedFields = ['is_read', 'is_starred', 'is_archived', 'is_deleted', 'category', 'priority']
  const filteredUpdates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field]
    }
  }

  const { data: email, error } = await supabase
    .from('emails')
    .update(filteredUpdates)
    .eq('id', emailId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ email })
}
