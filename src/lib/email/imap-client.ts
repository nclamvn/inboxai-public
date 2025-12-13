import crypto from 'crypto'

// Encryption helpers
const IV_LENGTH = 16

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for password encryption')
  }
  return key
}

export function encryptPassword(password: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv)
  let encrypted = cipher.update(password)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptPassword(encryptedPassword: string): string {
  const key = getEncryptionKey()
  const textParts = encryptedPassword.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv)
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

// Helper to fetch UIDs and sort them descending (newest first)
async function getNewestUIDs(
  client: InstanceType<typeof import('imapflow').ImapFlow>,
  limit: number,
  sinceDate?: Date
): Promise<number[]> {
  let searchCriteria: { uid?: string; since?: Date } | string = { uid: '1:*' }

  if (sinceDate) {
    searchCriteria = { since: sinceDate }
  }

  // Search for all UIDs
  const uids: number[] = []
  for await (const msg of client.fetch(searchCriteria, { uid: true }, { uid: true })) {
    uids.push(msg.uid)
  }

  // Sort descending (newest/highest UID first)
  uids.sort((a, b) => b - a)

  // Return only the newest N
  return uids.slice(0, limit)
}

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

      // ========================================
      // KEY FIX: Fetch emails với UID cao nhất (mới nhất) trước
      // ========================================

      let uidsToFetch: number[] = []

      if (fullSync) {
        // Full sync: lấy N email mới nhất
        console.log(`[SYNC] Full sync mode - getting ${limit} newest emails`)
        uidsToFetch = await getNewestUIDs(client, limit)
      } else if (account.last_sync_uid) {
        // Incremental sync: chỉ lấy email mới hơn last_sync_uid
        const lastUid = parseInt(account.last_sync_uid)
        console.log(`[SYNC] Incremental sync - fetching UIDs > ${lastUid}`)

        // Fetch all UIDs greater than lastUid
        const newUids: number[] = []
        for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true }, { uid: true })) {
          newUids.push(msg.uid)
        }

        // Sort descending (newest first) and limit
        newUids.sort((a, b) => b - a)
        uidsToFetch = newUids.slice(0, limit)
        console.log(`[SYNC] Found ${newUids.length} new emails, fetching ${uidsToFetch.length}`)
      } else {
        // First sync: lấy N email mới nhất
        console.log(`[SYNC] First sync - getting ${limit} newest emails`)
        uidsToFetch = await getNewestUIDs(client, limit)
      }

      if (uidsToFetch.length === 0) {
        console.log(`[SYNC] No emails to sync`)
        result.success = true
        mailbox.release()
        await client.logout()
        return result
      }

      console.log(`[SYNC] UIDs to fetch: ${uidsToFetch.slice(0, 5).join(', ')}${uidsToFetch.length > 5 ? '...' : ''} (${uidsToFetch.length} total)`)
      console.log(`[SYNC] UID range: ${Math.min(...uidsToFetch)} to ${Math.max(...uidsToFetch)}`)

      let highestUid: number = 0
      let count = 0

      // Fetch từng UID theo thứ tự mới nhất trước
      for (const uid of uidsToFetch) {
        // Timeout check
        if (Date.now() - startTime > MAX_SYNC_DURATION) {
          console.log(`[SYNC] Timeout at ${count} messages, stopping`)
          break
        }

        // Fetch single message by UID
        const message = await client.fetchOne(String(uid), {
          envelope: true,
          uid: true,
          flags: true,
          source: true  // QUAN TRỌNG: Fetch full email source để có body
        }, { uid: true }) as { uid: number; envelope?: { messageId?: string; from?: Array<{ address?: string; name?: string }>; to?: Array<{ address?: string }>; cc?: Array<{ address?: string }>; subject?: string; date?: Date }; flags?: Set<string>; source?: Buffer } | false

        if (!message || !message.envelope) continue

        const msgUid = message.uid
        const env = message.envelope

        // Track highest UID for last_sync_uid
        if (msgUid > highestUid) {
          highestUid = msgUid
        }

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
          const uidStr = String(msgUid)
          const { data: savedEmail, error: upsertError } = await supabase
            .from('emails')
            .upsert({
              user_id: account.user_id,
              source_account_id: account.id,
              original_uid: uidStr,
              message_id: env.messageId || `${uidStr}@${account.imap_host}`,
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
            console.error(`[SYNC] Upsert error for UID ${uidStr}:`, upsertError.message)
            result.errors.push(`UID ${uidStr}: ${upsertError.message}`)
          } else {
            result.synced++

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
                console.error(`[SYNC] Attachment error for UID ${uidStr}:`, attError.message)
              } else if (attachments.length > 0) {
                console.log(`[SYNC] Saved ${attachments.length} attachments for UID ${uidStr}`)
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
          console.error(`[SYNC] Parse error for UID ${msgUid}:`, errMsg)
          result.errors.push(`UID ${msgUid}: ${errMsg}`)
        }
      }

      console.log(`[SYNC] Synced ${result.synced} emails in ${Date.now() - startTime}ms`)

      // Update account sync status - use highestUid to track progress
      if (highestUid > 0 || result.synced > 0) {
        const updateData: Record<string, unknown> = {
          last_sync_at: new Date().toISOString(),
          sync_error: result.errors.length > 0 ? result.errors.slice(0, 3).join('; ') : null
        }

        if (highestUid > 0) {
          updateData.last_sync_uid = String(highestUid)
          result.lastUid = String(highestUid)
        }

        if (result.synced > 0) {
          updateData.total_emails_synced = (account.total_emails_synced || 0) + result.synced
        }

        await supabase
          .from('source_accounts')
          .update(updateData)
          .eq('id', account.id)

        console.log(`[SYNC] Updated: last_sync_uid=${highestUid}`)
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
