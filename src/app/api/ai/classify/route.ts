import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyEmail } from '@/lib/ai/classifier'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { emailId } = await request.json()

    if (!emailId) {
      return NextResponse.json({ error: 'Missing emailId' }, { status: 400 })
    }

    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (fetchError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    console.log(`Classifying email: ${emailId}`)
    const classification = await classifyEmail({
      from_address: email.from_address,
      from_name: email.from_name,
      subject: email.subject,
      body_text: email.body_text,
      body_html: email.body_html
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
      .eq('id', emailId)

    if (updateError) {
      console.error('Failed to update email:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, classification })

  } catch (error) {
    console.error('Classification error:', error)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
