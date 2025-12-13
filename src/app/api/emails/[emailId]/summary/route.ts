import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { summarizeEmail, needsSummary } from '@/lib/ai/summarizer'

export const maxDuration = 30

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

  // Fetch email with existing summary
  const { data: email, error } = await supabase
    .from('emails')
    .select('id, from_address, from_name, subject, body_text, received_at, ai_summary, ai_summary_generated_at')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Check if summary already exists and is recent (7 days)
  if (email.ai_summary) {
    const generatedAt = new Date(email.ai_summary_generated_at || 0)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    if (generatedAt > sevenDaysAgo) {
      try {
        const cached = JSON.parse(email.ai_summary)
        return NextResponse.json({
          summary: cached,
          cached: true
        })
      } catch {
        // Invalid cached data, regenerate
      }
    }
  }

  // Check if email needs summary
  if (!needsSummary(email.body_text)) {
    return NextResponse.json({
      summary: null,
      reason: 'Email too short'
    })
  }

  // Generate new summary
  const result = await summarizeEmail({
    from_address: email.from_address,
    from_name: email.from_name,
    subject: email.subject,
    body_text: email.body_text,
    received_at: email.received_at
  })

  if (!result) {
    return NextResponse.json({
      summary: null,
      reason: 'Failed to generate summary'
    })
  }

  // Cache summary in database
  await supabase
    .from('emails')
    .update({
      ai_summary: JSON.stringify(result),
      ai_summary_generated_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', user.id)

  return NextResponse.json({
    summary: result,
    cached: false
  })
}

// POST to force regenerate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId } = await params

  // Clear existing summary
  await supabase
    .from('emails')
    .update({
      ai_summary: null,
      ai_summary_generated_at: null
    })
    .eq('id', emailId)
    .eq('user_id', user.id)

  // Regenerate by calling GET logic
  const { data: email, error } = await supabase
    .from('emails')
    .select('id, from_address, from_name, subject, body_text, received_at')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  if (!needsSummary(email.body_text)) {
    return NextResponse.json({
      summary: null,
      reason: 'Email too short'
    })
  }

  const result = await summarizeEmail({
    from_address: email.from_address,
    from_name: email.from_name,
    subject: email.subject,
    body_text: email.body_text,
    received_at: email.received_at
  })

  if (!result) {
    return NextResponse.json({
      summary: null,
      reason: 'Failed to generate summary'
    })
  }

  // Cache new summary
  await supabase
    .from('emails')
    .update({
      ai_summary: JSON.stringify(result),
      ai_summary_generated_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', user.id)

  return NextResponse.json({
    summary: result,
    cached: false,
    regenerated: true
  })
}
