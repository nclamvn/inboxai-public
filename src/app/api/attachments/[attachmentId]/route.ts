import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchesImapNamespace } from '@/lib/sync/imap-identity'
import { getImapPassword } from '@/lib/credential-vault/vault'
import { connectImap } from '@/lib/email/imap-connection'
import { isRasterPreviewType, type RasterPreviewType } from '@/lib/email/attachment-preview'

export const maxDuration = 30

function matchesRasterSignature(type: RasterPreviewType, content: Buffer) {
  switch (type) {
    case 'image/gif': return ['GIF87a', 'GIF89a'].includes(content.toString('ascii', 0, 6))
    case 'image/jpeg': return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
    case 'image/png': return content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    case 'image/webp': return content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP'
  }
}

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

  // The email's source_account_id is not a PostgREST relationship.
  const { data: attachment, error } = await supabase
    .from('attachments')
    .select(`
      *,
      emails!inner (
        original_uid, user_id, sync_namespace, source_account_id
      )
    `)
    .eq('id', attachmentId)
    .single()

  if (error || !attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  const email = attachment.emails as {
    user_id: string
    original_uid: string
    sync_namespace: string
    source_account_id: string | null
  }
  if (email.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (!email.source_account_id || !email.original_uid) {
    return NextResponse.json({ error: 'Source account not found' }, { status: 400 })
  }

  if(!email.sync_namespace?.startsWith('INBOX:') || !/^\d+$/.test(email.original_uid)) {
    return NextResponse.json({error:'Email requires synchronization'},{status:409})
  }

  const { data: account } = await supabase.from('source_accounts')
    .select('id, imap_host, imap_port, imap_secure, username')
    .eq('id', email.source_account_id)
    .eq('user_id', user.id)
    .single()
  if (!account) {
    return NextResponse.json({ error: 'Source account not found' }, { status: 400 })
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
    const { simpleParser } = await import('mailparser')

    const client = await connectImap({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      username: account.username,
      password,
    })

    let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | undefined
    try {
      lock = await client.getMailboxLock('INBOX',{readOnly:true})
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

      const content = new Uint8Array(att.content)
      const type = att.contentType.toLowerCase()
      const preview = request.nextUrl.searchParams.get('preview') === '1' &&
        isRasterPreviewType(type) && matchesRasterSignature(type, att.content)
      const headers = new Headers({
        'Content-Type': preview ? type : 'application/octet-stream',
        'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${encodeURIComponent(att.filename || 'attachment')}"`,
        'Content-Length': String(content.byteLength),
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      return new NextResponse(content, { headers })

    } finally {
      lock?.release()
      client.close()
    }

  } catch {
    return NextResponse.json({ error: 'Attachment fetch failed' }, { status: 500 })
  }
}
