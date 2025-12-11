import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, sendReply } from '@/lib/resend/send-email'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { to, subject, text, html, replyToEmailId, cc, bcc } = body

  if (!to || !subject) {
    return NextResponse.json(
      { error: 'Missing required fields: to, subject' },
      { status: 400 }
    )
  }

  try {
    let result

    if (replyToEmailId) {
      // This is a reply
      result = await sendReply({
        userId: user.id,
        originalEmailId: replyToEmailId,
        body: text,
        htmlBody: html
      })
    } else {
      // This is a new email
      result = await sendEmail({
        userId: user.id,
        to,
        subject,
        text,
        html,
        cc,
        bcc
      })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId
    })
  } catch (error) {
    console.error('Send email API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
