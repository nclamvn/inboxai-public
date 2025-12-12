import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyEmail } from '@/lib/ai/classifier'
import { updateSenderOnReceive } from '@/lib/ai/sender-trust'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's primary email for same-domain check
  const { data: sourceAccount } = await supabase
    .from('source_accounts')
    .select('email_address')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  const userEmail = sourceAccount?.email_address || user.email

  // Get emails without category or with 'uncategorized'
  const { data: emails, error } = await supabase
    .from('emails')
    .select('id, from_address, from_name, subject, body_text, body_html')
    .eq('user_id', user.id)
    .or('category.is.null,category.eq.uncategorized')
    .order('received_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ message: 'Không có email cần phân loại', classified: 0, total: 0 })
  }

  let classified = 0
  const errors: string[] = []

  for (const email of emails) {
    try {
      // Update sender trust data
      await updateSenderOnReceive(user.id, email.from_address, email.from_name)

      // Classify with full context (user_id for sender trust lookup)
      const classification = await classifyEmail({
        from_address: email.from_address,
        from_name: email.from_name,
        subject: email.subject,
        body_text: email.body_text,
        body_html: email.body_html,
        user_id: user.id,
        user_email: userEmail
      })

      const { error: updateError } = await supabase
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

      if (updateError) {
        errors.push(`${email.id}: ${updateError.message}`)
      } else {
        classified++
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${email.id}: ${errorMsg}`)
    }

    // Rate limiting - wait 300ms between requests
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  return NextResponse.json({
    total: emails.length,
    classified,
    errors: errors.slice(0, 5),
    message: `Đã phân loại ${classified}/${emails.length} email`
  })
}
