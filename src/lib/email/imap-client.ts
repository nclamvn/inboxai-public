import crypto from 'crypto'

// Encryption helpers
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-key-for-dev-!!'
const IV_LENGTH = 16

export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv)
  let encrypted = cipher.update(password)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptPassword(encryptedPassword: string): string {
  const textParts = encryptedPassword.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

interface SourceAccount {
  id: string
  user_id: string
  email_address: string
  display_name?: string
  provider: string
  imap_host: string
  imap_port: number
  imap_secure: boolean
  username: string
  password_encrypted: string
  last_sync_uid?: string
  total_emails_synced?: number
}

interface SyncResult {
  success: boolean
  synced: number
  errors: string[]
  lastUid?: string
}

interface SyncOptions {
  limit?: number
  fullSync?: boolean
}

interface AttachmentMeta {
  filename: string
  contentType: string
  size: number
  contentId?: string
  isInline: boolean
}

// Extract attachments metadata from parsed email
function extractAttachments(parsed: { attachments?: Array<{ filename?: string; contentType?: string; size?: number; contentId?: string; contentDisposition?: string }> }): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = []

  if (parsed.attachments && parsed.attachments.length > 0) {
    for (const att of parsed.attachments) {
      attachments.push({
        filename: att.filename || 'unknown',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        contentId: att.contentId?.replace(/[<>]/g, '') || undefined,
        isInline: att.contentDisposition === 'inline' || !!att.contentId
      })
    }
  }

  return attachments
}

// Timeout constants
const MAX_SYNC_DURATION = 50000 // 50 seconds
const DEFAULT_LIMIT = 25 // Giảm limit vì fetch full body

export async function testImapConnection(config: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { ImapFlow } = await import('imapflow')

    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      logger: false
    })

    await client.connect()
    await client.logout()
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Connection failed'
    return { success: false, error: errorMsg }
  }
}

// FULL SYNC - Fetch emails with body content
export async function syncEmails(account: SourceAccount, options: SyncOptions = {}): Promise<SyncResult> {
  const { limit = DEFAULT_LIMIT, fullSync = false } = options
  const startTime = Date.now()

  const { createClient } = await import('@supabase/supabase-js')
  const { simpleParser } = await import('mailparser')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const result: SyncResult = {
    success: false,
    synced: 0,
    errors: []
  }

  let password: string
  try {
    password = decryptPassword(account.password_encrypted)
  } catch (e) {
    result.errors.push('Lỗi giải mã mật khẩu')
    return result
  }

  console.log(`[SYNC] Starting FULL sync for: ${account.email_address}`)
  console.log(`[SYNC] Options: limit=${limit}, fullSync=${fullSync}`)
  console.log(`[SYNC] Last sync UID: ${account.last_sync_uid || 'none'}`)

  try {
    const { ImapFlow } = await import('imapflow')

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      auth: {
        user: account.username,
        pass: password
      },
      logger: false,
      emitLogs: false
    })

    await client.connect()
    console.log(`[SYNC] Connected to ${account.imap_host}`)

    const mailbox = await client.getMailboxLock('INBOX')

    try {
      const status = await client.status('INBOX', { messages: true, uidNext: true })
      const totalMessages = status.messages || 0
      console.log(`[SYNC] Total messages in INBOX: ${totalMessages}`)

      // Determine fetch range
      let fetchRange: string

      if (fullSync) {
        fetchRange = '1:*'
        console.log(`[SYNC] Full sync mode`)
      } else if (account.last_sync_uid) {
        const lastUid = parseInt(account.last_sync_uid)
        fetchRange = `${lastUid + 1}:*`
        console.log(`[SYNC] Incremental sync - UID > ${lastUid}`)
      } else {
        const startSeq = Math.max(1, totalMessages - limit + 1)
        fetchRange = `${startSeq}:*`
        console.log(`[SYNC] First sync - sequences ${startSeq} to ${totalMessages}`)
      }

      let lastUid: string | null = null
      let count = 0

      // FULL FETCH: envelope + flags + SOURCE (body)
      for await (const message of client.fetch(fetchRange, {
        envelope: true,
        uid: true,
        flags: true,
        source: true  // QUAN TRỌNG: Fetch full email source để có body
      }, { uid: true })) {

        // Timeout check
        if (Date.now() - startTime > MAX_SYNC_DURATION) {
          console.log(`[SYNC] Timeout at ${count} messages, stopping`)
          break
        }

        const uid = String(message.uid)
        const env = message.envelope

        if (!env) continue

        try {
          // Parse full email to get body
          let bodyText = ''
          let bodyHtml: string | null = null

          let attachments: AttachmentMeta[] = []

          if (message.source) {
            const parsed = await simpleParser(message.source as Buffer, {
              skipHtmlToText: false,
              skipTextToHtml: true,
              skipImageLinks: true,
              maxHtmlLengthToParse: 300000
            })

            bodyText = (parsed.text || '').slice(0, 100000)
            bodyHtml = parsed.html ? (parsed.html as string).slice(0, 200000) : null

            // Extract attachments metadata
            attachments = extractAttachments(parsed)
          }

          // Upsert email với body và attachment_count
          const { data: savedEmail, error: upsertError } = await supabase
            .from('emails')
            .upsert({
              user_id: account.user_id,
              source_account_id: account.id,
              original_uid: uid,
              message_id: env.messageId || `${uid}@${account.imap_host}`,
              from_address: env.from?.[0]?.address || '',
              from_name: env.from?.[0]?.name || '',
              to_addresses: env.to?.map((t: { address?: string }) => t.address).filter(Boolean) || [],
              cc_addresses: env.cc?.map((c: { address?: string }) => c.address).filter(Boolean) || [],
              subject: env.subject || '(No subject)',
              body_text: bodyText,
              body_html: bodyHtml,
              body_fetched: true,
              received_at: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
              is_read: message.flags?.has('\\Seen') || false,
              is_starred: message.flags?.has('\\Flagged') || false,
              is_archived: false,
              is_deleted: false,
              direction: 'inbound',
              attachment_count: attachments.length
            }, {
              onConflict: 'source_account_id,original_uid'
            })
            .select('id')
            .single()

          if (upsertError) {
            console.error(`[SYNC] Upsert error for UID ${uid}:`, upsertError.message)
            result.errors.push(`UID ${uid}: ${upsertError.message}`)
          } else {
            result.synced++
            lastUid = uid

            // Save attachments metadata
            if (savedEmail && attachments.length > 0) {
              const attachmentRows = attachments.map(att => ({
                email_id: savedEmail.id,
                filename: att.filename,
                content_type: att.contentType,
                size: att.size,
                content_id: att.contentId || null,
                is_inline: att.isInline
              }))

              const { error: attError } = await supabase
                .from('attachments')
                .upsert(attachmentRows, {
                  onConflict: 'email_id,filename',
                  ignoreDuplicates: true
                })

              if (attError && attError.code !== '42P01') {
                console.error(`[SYNC] Attachment error for UID ${uid}:`, attError.message)
              } else if (attachments.length > 0) {
                console.log(`[SYNC] Saved ${attachments.length} attachments for UID ${uid}`)
              }
            }
          }

          count++

          // Progress log
          if (count % 5 === 0) {
            console.log(`[SYNC] Progress: ${count} emails in ${Date.now() - startTime}ms`)
          }

          if (count >= limit) {
            console.log(`[SYNC] Reached limit: ${limit}`)
            break
          }

        } catch (parseError) {
          const errMsg = parseError instanceof Error ? parseError.message : 'Parse error'
          console.error(`[SYNC] Parse error for UID ${uid}:`, errMsg)
          result.errors.push(`UID ${uid}: ${errMsg}`)
        }
      }

      console.log(`[SYNC] Synced ${result.synced} emails in ${Date.now() - startTime}ms`)

      // Update account sync status
      if (lastUid || result.synced > 0) {
        const updateData: Record<string, unknown> = {
          last_sync_at: new Date().toISOString(),
          sync_error: result.errors.length > 0 ? result.errors.slice(0, 3).join('; ') : null
        }

        if (lastUid) {
          updateData.last_sync_uid = lastUid
          result.lastUid = lastUid
        }

        if (result.synced > 0) {
          updateData.total_emails_synced = (account.total_emails_synced || 0) + result.synced
        }

        await supabase
          .from('source_accounts')
          .update(updateData)
          .eq('id', account.id)

        console.log(`[SYNC] Updated: last_sync_uid=${lastUid}`)
      }

      result.success = true

    } finally {
      mailbox.release()
    }

    await client.logout()
    console.log(`[SYNC] DONE in ${Date.now() - startTime}ms: ${result.synced} synced`)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Sync failed'
    result.errors.push(errorMsg)
    console.error(`[SYNC] Error:`, errorMsg)

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase
      .from('source_accounts')
      .update({
        sync_error: errorMsg,
        last_sync_at: new Date().toISOString()
      })
      .eq('id', account.id)
  }

  return result
}

// PHASE 2: Fetch body for a single email (lazy load)
export async function fetchEmailBody(
  account: SourceAccount,
  originalUid: string
): Promise<{ body_text: string; body_html: string | null } | null> {
  let password: string
  try {
    password = decryptPassword(account.password_encrypted)
  } catch (e) {
    console.error('[FETCH_BODY] Decrypt error')
    return null
  }

  console.log(`[FETCH_BODY] Fetching UID ${originalUid} from ${account.email_address}`)

  try {
    const { ImapFlow } = await import('imapflow')

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      auth: {
        user: account.username,
        pass: password
      },
      logger: false
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Fetch single email by UID
      const message = await client.fetchOne(originalUid, {
        source: true
      }, { uid: true }) as { source?: Buffer } | false

      if (!message || !message.source) {
        console.log(`[FETCH_BODY] No source for UID ${originalUid}`)
        return null
      }

      // Parse with simpleParser
      const { simpleParser } = await import('mailparser')
      const parsed = await simpleParser(message.source, {
        skipHtmlToText: false,
        skipTextToHtml: true,
        skipImageLinks: true
      })

      console.log(`[FETCH_BODY] Parsed UID ${originalUid}`)

      return {
        body_text: (parsed.text || '').slice(0, 50000),
        body_html: parsed.html ? (parsed.html as string).slice(0, 100000) : null
      }

    } finally {
      lock.release()
      await client.logout()
    }

  } catch (error) {
    console.error('[FETCH_BODY] Error:', error)
    return null
  }
}

// Provider presets
export const EMAIL_PROVIDERS = {
  gmail: {
    name: 'Gmail',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_secure: false,
    instructions: 'Use App Password from Google Account settings'
  },
  outlook: {
    name: 'Outlook/Hotmail',
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_secure: false,
    instructions: 'Use your regular password or App Password'
  },
  yahoo: {
    name: 'Yahoo Mail',
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    smtp_secure: false,
    instructions: 'Use App Password from Yahoo Account settings'
  },
  custom: {
    name: 'Custom IMAP',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    instructions: 'Enter your email server settings'
  }
}
