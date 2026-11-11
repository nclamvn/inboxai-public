import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchesImapNamespace } from '@/lib/sync/imap-identity'
import { getImapPassword } from '@/lib/credential-vault/vault'

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
      emails!inner (
        id, original_uid, user_id, sync_namespace,
        source_accounts (
          id, imap_host, imap_port, imap_secure,
          username
        )
      )
    `)
    .eq('id', attachmentId)
    .single()

  if (error || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  // Verify user owns this email
  const emailData = attachment.emails as { user_id: string }
  if (emailData.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const email = attachment.emails as {
    id: string
    original_uid: string
    sync_namespace: string
    source_accounts: {
      id: string
      imap_host: string
      imap_port: number
      imap_secure: boolean
      username: string
    }
  }

  const account = email?.source_accounts

  if (!account || !email?.original_uid) {
    return NextResponse.json({ error: 'Source account not found' }, { status: 400 })
  }

  if(!email.sync_namespace?.startsWith('INBOX:') || !/^\d+$/.test(email.original_uid)) {
    return NextResponse.json({error:'Email requires synchronization'},{status:409})
  }

  // Decrypt password
  let password: string
  try {
    password = await getImapPassword(user.id, account.id)
  } catch {
    return NextResponse.json({ error: 'Credential storage unavailable' }, { status: 500 })
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
      logger: false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX',{readOnly:true})

    try {
      const status=await client.status('INBOX',{uidValidity:true})
      if(!matchesImapNamespace(email.sync_namespace,status.uidValidity))return NextResponse.json({error:'Mailbox changed; sync required'},{status:409})
      // Fetch email by UID
      const message = await client.fetchOne(email.original_uid, {
        source: true
      }, { uid: true }) as { source?: Buffer } | false

      if (!message || !message.source) {
        return NextResponse.json({ error: 'Email not found on server' }, { status: 404 })
      }

      if(!matchesImapNamespace(email.sync_namespace,(await client.status('INBOX',{uidValidity:true})).uidValidity))return NextResponse.json({error:'Mailbox changed; sync required'},{status:409})
      // Parse email
      const parsed = await simpleParser(message.source)

      // Find attachment by filename or content ID
      const partKey=attachment.sync_part_key
      const att=typeof partKey==='string' && /^\d+$/.test(partKey) ? parsed.attachments?.[Number(partKey)] : undefined

      if (!att) {
        return NextResponse.json({ error: 'Attachment not found in email' }, { status: 404 })
      }

      // Return attachment content
      const headers = new Headers()
      headers.set('Content-Type', att.contentType || 'application/octet-stream')
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename || 'attachment')}"`)
      headers.set('Content-Length', att.size?.toString() || '0')
      headers.set('Cache-Control', 'private, max-age=3600')

      // Convert Buffer to Uint8Array for NextResponse
      const content = new Uint8Array(att.content)
      return new NextResponse(content, { headers })

    } finally {
      lock.release()
      try { await client.logout() } catch {}
    }

  } catch {
    return NextResponse.json({ error: 'Attachment fetch failed' }, { status: 500 })
  }
}
