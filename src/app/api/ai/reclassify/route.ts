import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyEmail } from '@/lib/ai/classifier'

export const maxDuration = 55

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { category, limit = 30 } = await request.json()

  // Get user's primary email for same-domain check
  const { data: sourceAccount } = await supabase
    .from('source_accounts')
    .select('email_address')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  const userEmail = sourceAccount?.email_address || user.email

  // Lấy emails cần re-classify
  let query = supabase
    .from('emails')
    .select('id, from_address, from_name, subject, body_text, category')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('received_at', { ascending: false })
    .limit(Math.min(limit, 50))

  if (category) {
    query = query.eq('category', category)
  }

  const { data: emails, error } = await query

  if (error || !emails) {
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }

  console.log(`[RECLASSIFY] Processing ${emails.length} emails, category filter: ${category || 'all'}`)

  let updated = 0
  const changes: Array<{
    subject: string
    from: string | null
    to: string
  }> = []

  for (const email of emails) {
    try {
      const result = await classifyEmail({
        from_address: email.from_address,
        from_name: email.from_name,
        subject: email.subject,
        body_text: email.body_text || '',
        user_id: user.id,
        user_email: userEmail
      })

      if (result.category !== email.category) {
        await supabase
          .from('emails')
          .update({
            category: result.category,
            priority: result.priority,
            needs_reply: result.needs_reply,
            summary: result.summary,
            ai_confidence: result.confidence
          })
          .eq('id', email.id)

        changes.push({
          subject: (email.subject || '').slice(0, 50),
          from: email.category,
          to: result.category
        })
        updated++

        console.log(`[RECLASSIFY] ${email.subject?.slice(0, 30)}: ${email.category} → ${result.category}`)
      }

      // Rate limit: 200ms between calls
      await new Promise(r => setTimeout(r, 200))

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      console.error(`[RECLASSIFY] Error for ${email.id}:`, errMsg)
    }
  }

  console.log(`[RECLASSIFY] Done: Updated ${updated}/${emails.length} emails`)

  return NextResponse.json({
    success: true,
    total: emails.length,
    updated,
    changes
  })
}
