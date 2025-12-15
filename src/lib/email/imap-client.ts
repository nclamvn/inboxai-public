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

// Timeout constants - OPTIMIZED
const MAX_SYNC_DURATION = 120000 // 120 seconds (increased)
const DEFAULT_LIMIT = 100 // Tăng limit nhờ batch processing
const BATCH_SIZE = 50 // Emails per batch
const PARALLEL_PARSE_LIMIT = 20 // Concurrent parsing
const DB_BATCH_SIZE = 50 // Rows per DB insert

/**
 * Chunk array into batches
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Process items with concurrency limit
 */
async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++
      try {
        const result = await fn(items[currentIndex])
        results[currentIndex] = result
      } catch (error) {
        console.error(`[Parallel] Error at index ${currentIndex}:`, error)
        results[currentIndex] = null as R
      }
    }
  }

  const workers = Array(Math.min(limit, items.length)).fill(null).map(() => worker())
  await Promise.all(workers)
  return results
}

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

// Interface for parsed email data
interface ParsedEmailData {
  uid: number
  messageId: string
  fromAddress: string
  fromName: string
  toAddresses: string[]
  ccAddresses: string[]
  subject: string
  bodyText: string
  bodyHtml: string | null
  receivedAt: string
  isRead: boolean
  isStarred: boolean
  attachments: AttachmentMeta[]
}

// OPTIMIZED SYNC - Batch fetch, parallel parse, batch DB insert
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

  console.log(`[SYNC] Starting OPTIMIZED sync for: ${account.email_address}`)
  console.log(`[SYNC] Options: limit=${limit}, fullSync=${fullSync}, batchSize=${BATCH_SIZE}`)
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

      const highestUid: number = Math.max(...uidsToFetch)

      // ========================================
      // OPTIMIZED: Process in batches
      // ========================================
      const batches = chunkArray(uidsToFetch, BATCH_SIZE)
      console.log(`[SYNC] Processing ${batches.length} batches of up to ${BATCH_SIZE} emails`)

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        const batchStartTime = Date.now()

        // Timeout check
        if (Date.now() - startTime > MAX_SYNC_DURATION) {
          console.log(`[SYNC] Timeout after ${result.synced} emails, stopping`)
          result.errors.push(`Timeout after ${result.synced} emails`)
          break
        }

        console.log(`[SYNC] Batch ${batchIndex + 1}/${batches.length}: fetching ${batch.length} emails`)

        try {
          // ========================================
          // STEP 1: Batch IMAP fetch
          // ========================================
          const uidRange = batch.join(',')
          const rawMessages: Array<{
            uid: number
            envelope: { messageId?: string; from?: Array<{ address?: string; name?: string }>; to?: Array<{ address?: string }>; cc?: Array<{ address?: string }>; subject?: string; date?: Date }
            flags: Set<string>
            source: Buffer
          }> = []

          for await (const msg of client.fetch(uidRange, {
            envelope: true,
            uid: true,
            flags: true,
            source: true
          }, { uid: true })) {
            if (msg.envelope && msg.source) {
              rawMessages.push({
                uid: msg.uid,
                envelope: msg.envelope,
                flags: msg.flags || new Set(),
                source: msg.source as Buffer
              })
            }
          }

          console.log(`[SYNC] Batch ${batchIndex + 1}: fetched ${rawMessages.length} raw messages in ${Date.now() - batchStartTime}ms`)

          // ========================================
          // STEP 2: Parallel parse emails
          // ========================================
          const parseStartTime = Date.now()
          const parsedEmails = await parallelLimit(
            rawMessages,
            PARALLEL_PARSE_LIMIT,
            async (msg): Promise<ParsedEmailData | null> => {
              try {
                const parsed = await simpleParser(msg.source, {
                  skipHtmlToText: false,
                  skipTextToHtml: true,
                  skipImageLinks: true,
                  maxHtmlLengthToParse: 300000
                })

                return {
                  uid: msg.uid,
                  messageId: msg.envelope.messageId || `${msg.uid}@${account.imap_host}`,
                  fromAddress: msg.envelope.from?.[0]?.address || '',
                  fromName: msg.envelope.from?.[0]?.name || '',
                  toAddresses: msg.envelope.to?.map(t => t.address).filter(Boolean) as string[] || [],
                  ccAddresses: msg.envelope.cc?.map(c => c.address).filter(Boolean) as string[] || [],
                  subject: msg.envelope.subject || '(No subject)',
                  bodyText: (parsed.text || '').slice(0, 100000),
                  bodyHtml: parsed.html ? (parsed.html as string).slice(0, 200000) : null,
                  receivedAt: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
                  isRead: msg.flags.has('\\Seen'),
                  isStarred: msg.flags.has('\\Flagged'),
                  attachments: extractAttachments(parsed)
                }
              } catch (parseErr) {
                console.error(`[SYNC] Parse error for UID ${msg.uid}:`, parseErr)
                return null
              }
            }
          )

          const validEmails = parsedEmails.filter((e): e is ParsedEmailData => e !== null)
          console.log(`[SYNC] Batch ${batchIndex + 1}: parsed ${validEmails.length} emails in ${Date.now() - parseStartTime}ms`)

          if (validEmails.length === 0) continue

          // ========================================
          // STEP 3: Batch DB insert
          // ========================================
          const dbStartTime = Date.now()
          const emailRecords = validEmails.map(email => ({
            user_id: account.user_id,
            source_account_id: account.id,
            original_uid: String(email.uid),
            message_id: email.messageId,
            from_address: email.fromAddress,
            from_name: email.fromName,
            to_addresses: email.toAddresses,
            cc_addresses: email.ccAddresses,
            subject: email.subject,
            body_text: email.bodyText,
            body_html: email.bodyHtml,
            body_fetched: true,
            received_at: email.receivedAt,
            is_read: email.isRead,
            is_starred: email.isStarred,
            is_archived: false,
            is_deleted: false,
            direction: 'inbound',
            attachment_count: email.attachments.length
          }))

          // Batch upsert emails
          const { data: savedEmails, error: batchError } = await supabase
            .from('emails')
            .upsert(emailRecords, {
              onConflict: 'source_account_id,original_uid'
            })
            .select('id, original_uid')

          if (batchError) {
            console.error(`[SYNC] Batch ${batchIndex + 1} DB error:`, batchError.message)
            result.errors.push(`Batch ${batchIndex + 1}: ${batchError.message}`)
          } else {
            const insertedCount = savedEmails?.length || 0
            result.synced += insertedCount

            // Batch insert attachments
            if (savedEmails && savedEmails.length > 0) {
              const allAttachments: Array<{
                email_id: string
                filename: string
                content_type: string
                size: number
                content_id: string | null
                is_inline: boolean
              }> = []

              for (const savedEmail of savedEmails) {
                const originalEmail = validEmails.find(e => String(e.uid) === savedEmail.original_uid)
                if (originalEmail && originalEmail.attachments.length > 0) {
                  for (const att of originalEmail.attachments) {
                    allAttachments.push({
                      email_id: savedEmail.id,
                      filename: att.filename,
                      content_type: att.contentType,
                      size: att.size,
                      content_id: att.contentId || null,
                      is_inline: att.isInline
                    })
                  }
                }
              }

              if (allAttachments.length > 0) {
                await supabase
                  .from('attachments')
                  .upsert(allAttachments, {
                    onConflict: 'email_id,filename',
                    ignoreDuplicates: true
                  })
                console.log(`[SYNC] Batch ${batchIndex + 1}: saved ${allAttachments.length} attachments`)
              }
            }

            console.log(`[SYNC] Batch ${batchIndex + 1}: inserted ${insertedCount} emails in ${Date.now() - dbStartTime}ms`)
          }

          const batchTime = Date.now() - batchStartTime
          console.log(`[SYNC] Batch ${batchIndex + 1}/${batches.length} completed in ${batchTime}ms (${Math.round(batchTime / batch.length)}ms/email)`)

        } catch (batchError) {
          const errMsg = batchError instanceof Error ? batchError.message : 'Batch error'
          console.error(`[SYNC] Batch ${batchIndex + 1} error:`, errMsg)
          result.errors.push(`Batch ${batchIndex + 1}: ${errMsg}`)
          // Continue with next batch
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
