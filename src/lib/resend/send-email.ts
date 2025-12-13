import { resend, DEFAULT_FROM } from './client'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseInstance
}

interface SendEmailParams {
  userId: string
  to: string | string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
  cc?: string[]
  bcc?: string[]
  attachments?: {
    filename: string
    content: Buffer | string
  }[]
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { userId, to, subject, text, html, replyTo, cc, bcc, attachments } = params

  try {
    // Get user's profile for "from" name
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('display_name, email')
      .eq('id', userId)
      .single()

    const fromName = profile?.display_name || 'InboxAI User'
    const fromEmail = DEFAULT_FROM

    // Send via Resend - use text content (required by Resend)
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || '',
      html: html || undefined,
      replyTo: replyTo || undefined,
      cc: cc && cc.length > 0 ? cc : undefined,
      bcc: bcc && bcc.length > 0 ? bcc : undefined,
      attachments: attachments && attachments.length > 0
        ? attachments.map(a => ({
            filename: a.filename,
            content: typeof a.content === 'string' ? Buffer.from(a.content) : a.content
          }))
        : undefined
    })

    if (error) {
      console.error('Resend error:', error)
      return { success: false, error: error.message }
    }

    // Save to database as sent email
    const toAddresses = Array.isArray(to) ? to : [to]

    await getSupabase().from('emails').insert({
      user_id: userId,
      message_id: data?.id,
      from_address: fromEmail,
      from_name: fromName,
      to_addresses: toAddresses,
      cc_addresses: cc || [],
      bcc_addresses: bcc || [],
      subject,
      body_text: text,
      body_html: html,
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      is_read: true,
      category: 'sent'
    })

    return { success: true, messageId: data?.id }
  } catch (error) {
    console.error('Send email error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// Send reply to an email
export async function sendReply(params: {
  userId: string
  originalEmailId: string
  body: string
  htmlBody?: string
}): Promise<SendEmailResult> {
  const { userId, originalEmailId, body, htmlBody } = params

  // Get original email
  const { data: original } = await getSupabase()
    .from('emails')
    .select('*')
    .eq('id', originalEmailId)
    .single()

  if (!original) {
    return { success: false, error: 'Original email not found' }
  }

  // Determine reply subject
  const subject = original.subject?.startsWith('Re:')
    ? original.subject
    : `Re: ${original.subject}`

  // Reply to sender
  const replyTo = original.from_address

  return sendEmail({
    userId,
    to: replyTo,
    subject,
    text: body,
    html: htmlBody,
    replyTo: original.from_address
  })
}
