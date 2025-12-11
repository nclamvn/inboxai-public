import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { classifyEmail } from '@/lib/ai/classifier'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all unclassified emails (ai_confidence is null or low)
  const { data: emails, error } = await supabaseService
    .from('emails')
    .select('*')
    .eq('user_id', user.id)
    .or('ai_confidence.is.null,ai_confidence.lt.0.5')
    .limit(20)

  if (error || !emails) {
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }

  if (emails.length === 0) {
    return NextResponse.json({
      message: 'No emails to classify',
      total: 0,
      results: []
    })
  }

  const results = []

  for (const email of emails) {
    try {
      const classification = await classifyEmail({
        from_address: email.from_address,
        from_name: email.from_name,
        subject: email.subject,
        body_text: email.body_text,
        body_html: email.body_html
      })

      await supabaseService
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

      results.push({
        id: email.id,
        subject: email.subject,
        status: 'success',
        classification: {
          priority: classification.priority,
          category: classification.category,
          summary: classification.summary
        }
      })
    } catch (err) {
      results.push({
        id: email.id,
        subject: email.subject,
        status: 'error',
        error: String(err)
      })
    }
  }

  return NextResponse.json({
    total: emails.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    results
  })
}
