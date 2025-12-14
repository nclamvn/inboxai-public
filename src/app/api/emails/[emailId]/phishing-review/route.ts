import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/emails/[emailId]/phishing-review
 * Mark an email as reviewed for phishing (user confirms it's safe or dangerous)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { safe } = body

  // Verify email belongs to user
  const { data: email, error: fetchError } = await supabaseAdmin
    .from('emails')
    .select('id, phishing_score, phishing_risk')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Update email
  const updates: Record<string, unknown> = {
    is_phishing_reviewed: true,
  }

  // If user marked as safe, reduce phishing score
  if (safe) {
    updates.phishing_score = 0
    updates.phishing_risk = 'safe'
    updates.phishing_reasons = []
  }

  const { error: updateError } = await supabaseAdmin
    .from('emails')
    .update(updates)
    .eq('id', emailId)

  if (updateError) {
    console.error('Failed to update email:', updateError)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: safe ? 'Đã đánh dấu email an toàn' : 'Đã xác nhận cảnh báo',
  })
}
