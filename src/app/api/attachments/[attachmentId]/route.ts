import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptPassword } from '@/lib/email/imap-client'

export const maxDuration = 30

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get attachment with email and source account info
  const { data: attachment, error } = await supabase
    .from('attachments')
    .select(`
      *,
      emails (
        id, original_uid,
        source_accounts (
          id, imap_host, imap_port, imap_secure,
          username, password_encrypted
        )
      )
    `)
    .eq('id', attachmentId)
    .eq('user_id', user.id)
    .single()

  if (error || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const email = attachment.emails as {
    id: string
    original_uid: string
    source_accounts: {
      id: string
      imap_host: string
      imap_port: number
      imap_secure: boolean
      username: string
      password_encrypted: string
    }
  }

  const account = email?.source_accounts

  if (!account || !email?.original_uid) {
    return NextResponse.json({ error: 'Source account not found' }, { status: 400 })
  }

  // Decrypt password
  let password: string
  try {
    password = decryptPassword(account.password_encrypted)
  } catch (e) {
    return NextResponse.json({ error: 'Decrypt failed' }, { status: 500 })
  }

  // Connect IMAP and fetch attachment
  try {
    const { ImapFlow } = await import('imapflow')
    const { simpleParser } = await import('mailparser')

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure !== false,
      auth: { user: account.username, pass: password },
      logger: false
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Fetch email by UID
      const message = await client.fetchOne(email.original_uid, {
        source: true
      }, { uid: true }) as { source?: Buffer } | false

      if (!message || !message.source) {
        return NextResponse.json({ error: 'Email not found on server' }, { status: 404 })
      }

      // Parse email
      const parsed = await simpleParser(message.source)

      // Find attachment by filename or content ID
      const att = parsed.attachments?.find(a =>
        a.filename === attachment.filename ||
        a.contentId?.replace(/[<>]/g, '') === attachment.content_id
      )

      if (!att) {
        return NextResponse.json({ error: 'Attachment not found in email' }, { status: 404 })
      }

      // Return attachment content
      const headers = new Headers()
      headers.set('Content-Type', att.contentType || 'application/octet-stream')
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename || 'attachment')}"`)
      headers.set('Content-Length', att.size?.toString() || '0')
      headers.set('Cache-Control', 'private, max-age=3600')

      return new NextResponse(att.content, { headers })

    } finally {
      lock.release()
      try { await client.logout() } catch {}
    }

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[ATTACHMENT] Error:', errorMsg)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
