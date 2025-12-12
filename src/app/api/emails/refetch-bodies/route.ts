import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { fetchEmailBody, decryptPassword } from '@/lib/email/imap-client'

export const maxDuration = 55

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accountId, limit = 20 } = await request.json()

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
  }

  // Get account
  const { data: account, error: accountError } = await supabaseAdmin
    .from('source_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Get emails without body (body_text is null or empty)
  const { data: emails, error: emailsError } = await supabaseAdmin
    .from('emails')
    .select('id, original_uid')
    .eq('source_account_id', accountId)
    .eq('user_id', user.id)
    .or('body_text.is.null,body_text.eq.')
    .not('original_uid', 'is', null)
    .order('received_at', { ascending: false })
    .limit(Math.min(limit, 30))

  if (emailsError) {
    return NextResponse.json({ error: emailsError.message }, { status: 500 })
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({
      success: true,
      refetched: 0,
      message: 'Tất cả emails đã có nội dung'
    })
  }

  console.log(`[REFETCH] Found ${emails.length} emails without body for account ${accountId}`)

  let refetched = 0
  const errors: string[] = []

  for (const email of emails) {
    if (!email.original_uid) continue

    try {
      const body = await fetchEmailBody(account, email.original_uid)

      if (body) {
        const { error: updateError } = await supabaseAdmin
          .from('emails')
          .update({
            body_text: body.body_text,
            body_html: body.body_html,
            body_fetched: true
          })
          .eq('id', email.id)

        if (!updateError) {
          refetched++
          console.log(`[REFETCH] Updated email ${email.id}`)
        } else {
          errors.push(`Email ${email.id}: ${updateError.message}`)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[REFETCH] Error for email ${email.id}:`, errMsg)
      errors.push(`Email ${email.id}: ${errMsg}`)
    }
  }

  return NextResponse.json({
    success: true,
    refetched,
    total: emails.length,
    errors: errors.slice(0, 5),
    message: refetched > 0
      ? `Đã cập nhật nội dung cho ${refetched}/${emails.length} emails`
      : 'Không thể cập nhật nội dung. Vui lòng thử sync lại.'
  })
}
