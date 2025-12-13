import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import crypto from 'crypto'

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

// Verify Resend webhook signature
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.warn('RESEND_WEBHOOK_SECRET not set, skipping verification')
    return true // Skip verification in development
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

interface InboundEmailData {
  from: string
  to: string | string[]
  cc?: string[]
  subject?: string
  text?: string
  html?: string
  attachments?: Array<{
    filename: string
    contentType: string
    size: number
    url: string
  }>
  headers?: Record<string, string>
  date?: string
}

interface WebhookPayload {
  type: string
  data: InboundEmailData | { email_id?: string }
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers()
    const signature = headersList.get('svix-signature') || ''
    const rawBody = await request.text()

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      if (!verifyWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload: WebhookPayload = JSON.parse(rawBody)
    const { type, data } = payload

    console.log('Resend webhook received:', type)

    switch (type) {
      case 'email.received':
        await handleInboundEmail(data as InboundEmailData)
        break
      case 'email.delivered':
        await handleDeliveryStatus(data as { email_id?: string }, 'delivered')
        break
      case 'email.bounced':
        await handleDeliveryStatus(data as { email_id?: string }, 'bounced')
        break
      case 'email.complained':
        await handleDeliveryStatus(data as { email_id?: string }, 'complained')
        break
      default:
        console.log('Unhandled webhook type:', type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

async function handleInboundEmail(data: InboundEmailData) {
  const {
    from,
    to,
    cc,
    subject,
    text,
    html,
    attachments,
    headers: emailHeaders,
    date
  } = data

  // Find user by email address
  const toAddress = Array.isArray(to) ? to[0] : to
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('id')
    .eq('email', toAddress)
    .single()

  if (!profile) {
    console.log('No user found for email:', toAddress)
    return
  }

  // Parse from address
  const fromMatch = from.match(/^(.+?)\s*<(.+)>$/)
  const fromName = fromMatch ? fromMatch[1].trim() : ''
  const fromAddress = fromMatch ? fromMatch[2] : from

  // Insert email
  const { data: email, error } = await getSupabase()
    .from('emails')
    .insert({
      user_id: profile.id,
      message_id: emailHeaders?.['message-id'] || `${Date.now()}@inbound`,
      from_address: fromAddress,
      from_name: fromName,
      to_addresses: Array.isArray(to) ? to : [to],
      cc_addresses: cc || [],
      subject: subject || '(No subject)',
      body_text: text,
      body_html: html,
      direction: 'inbound',
      received_at: date || new Date().toISOString(),
      is_read: false,
      is_starred: false,
      is_archived: false,
      is_deleted: false
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving inbound email:', error)
    return
  }

  // Handle attachments
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      await getSupabase().from('attachments').insert({
        email_id: email.id,
        filename: attachment.filename,
        content_type: attachment.contentType,
        size: attachment.size,
        storage_path: attachment.url
      })
    }
  }

  // Trigger AI classification (async)
  classifyEmailAsync(email.id)

  console.log('Inbound email saved:', email.id)
}

async function handleDeliveryStatus(data: { email_id?: string }, status: string) {
  const { email_id } = data

  if (email_id) {
    await getSupabase()
      .from('emails')
      .update({ delivery_status: status })
      .eq('message_id', email_id)
  }
}

// Async classification (non-blocking)
async function classifyEmailAsync(emailId: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId })
    })
  } catch (error) {
    console.error('Classification trigger failed:', error)
  }
}
