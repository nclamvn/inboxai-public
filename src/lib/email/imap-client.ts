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

// Timeout constants
const MAX_SYNC_DURATION = 50000 // 50 seconds (Render has 60s timeout)
const BATCH_SIZE = 20

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

export async function syncEmails(account: SourceAccount, options: SyncOptions = {}): Promise<SyncResult> {
  const { limit = 50, fullSync = false } = options // Reduced default limit
  const startTime = Date.now()

  const { createClient } = await import('@supabase/supabase-js')

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

  console.log(`[SYNC] Starting sync for: ${account.email_address}`)
  console.log(`[SYNC] Options: limit=${limit}, fullSync=${fullSync}`)
  console.log(`[SYNC] Last sync UID: ${account.last_sync_uid || 'none'}`)

  try {
    const { ImapFlow } = await import('imapflow')
    const { simpleParser } = await import('mailparser')

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
        console.log(`[SYNC] Full sync mode - fetching all messages`)
      } else if (account.last_sync_uid) {
        const lastUid = parseInt(account.last_sync_uid)
        fetchRange = `${lastUid + 1}:*`
        console.log(`[SYNC] Incremental sync - fetching UID > ${lastUid}`)
      } else {
        const startSeq = Math.max(1, totalMessages - limit + 1)
        fetchRange = `${startSeq}:*`
        console.log(`[SYNC] First sync - fetching sequences ${startSeq} to ${totalMessages}`)
      }

      // PHASE 1: Fetch all messages first (fast)
      const messages: Array<{ uid: number; source: Buffer; flags: Set<string> }> = []

      for await (const message of client.fetch(fetchRange, { source: true, uid: true, flags: true }, { uid: true })) {
        // Check timeout
        if (Date.now() - startTime > MAX_SYNC_DURATION) {
          console.log('[SYNC] Approaching timeout, stopping fetch...')
          break
        }

        if (message.source) {
          messages.push({
            uid: message.uid,
            source: message.source,
            flags: message.flags || new Set()
          })
        }

        if (messages.length >= limit) {
          console.log(`[SYNC] Reached limit: ${limit}`)
          break
        }

        if (messages.length % 20 === 0) {
          console.log(`[SYNC] Fetched ${messages.length} messages...`)
        }
      }

      console.log(`[SYNC] Fetch completed: ${messages.length} messages in ${Date.now() - startTime}ms`)

      // PHASE 2: Parse and collect emails for batch insert
      const emailsToInsert: Array<Record<string, unknown>> = []
      let lastUid: string | null = null

      for (const msg of messages) {
        // Check timeout
        if (Date.now() - startTime > MAX_SYNC_DURATION) {
          console.log('[SYNC] Approaching timeout, stopping parse...')
          break
        }

        try {
          // Lightweight parse - skip unnecessary processing
          const parsed = await simpleParser(msg.source, {
            skipHtmlToText: false,
            skipTextToHtml: true,
            skipImageLinks: true
          })

          const fromAddress = parsed.from?.value?.[0]?.address || ''
          const fromName = parsed.from?.value?.[0]?.name || ''

          const toAddresses = parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                .flatMap(t => t.value?.map(v => v.address) || [])
            : []

          const ccAddresses = parsed.cc
            ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
                .flatMap(c => c.value?.map(v => v.address) || [])
            : []

          // Limit body size to prevent large payload issues
          const bodyText = (parsed.text || '').slice(0, 50000)
          const bodyHtml = parsed.html ? (parsed.html as string).slice(0, 100000) : null

          emailsToInsert.push({
            user_id: account.user_id,
            source_account_id: account.id,
            original_uid: String(msg.uid),
            message_id: parsed.messageId || `${msg.uid}@${account.imap_host}`,
            from_address: fromAddress,
            from_name: fromName,
            to_addresses: toAddresses,
            cc_addresses: ccAddresses,
            subject: parsed.subject || '(No subject)',
            body_text: bodyText,
            body_html: bodyHtml,
            received_at: parsed.date?.toISOString() || new Date().toISOString(),
            is_read: msg.flags.has('\\Seen'),
            is_starred: msg.flags.has('\\Flagged'),
            is_archived: false,
            is_deleted: false,
            direction: 'inbound'
          })

          lastUid = String(msg.uid)

        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : 'Parse error'
          result.errors.push(`UID ${msg.uid}: ${errorMsg}`)
          console.error(`[SYNC] Parse error UID ${msg.uid}:`, errorMsg)
        }
      }

      console.log(`[SYNC] Parsed ${emailsToInsert.length} emails in ${Date.now() - startTime}ms`)

      // PHASE 3: Batch insert with upsert (ignore duplicates)
      if (emailsToInsert.length > 0) {
        for (let i = 0; i < emailsToInsert.length; i += BATCH_SIZE) {
          // Check timeout
          if (Date.now() - startTime > MAX_SYNC_DURATION) {
            console.log('[SYNC] Approaching timeout, stopping insert...')
            break
          }

          const batch = emailsToInsert.slice(i, i + BATCH_SIZE)

          const { error: insertError } = await supabase
            .from('emails')
            .upsert(batch, {
              onConflict: 'source_account_id,original_uid',
              ignoreDuplicates: true
            })

          if (insertError) {
            console.error(`[SYNC] Batch insert error:`, insertError.message)
            result.errors.push(insertError.message)
          } else {
            result.synced += batch.length
          }

          if ((i + BATCH_SIZE) % 50 === 0) {
            console.log(`[SYNC] Inserted ${Math.min(i + BATCH_SIZE, emailsToInsert.length)} emails...`)
          }
        }
      }

      console.log(`[SYNC] Insert completed: ${result.synced} emails in ${Date.now() - startTime}ms`)

      // PHASE 4: Update account sync status
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

        console.log(`[SYNC] Updated account: last_sync_uid=${lastUid}, total_synced=${updateData.total_emails_synced}`)
      }

      result.success = true

    } finally {
      mailbox.release()
    }

    await client.logout()
    console.log(`[SYNC] Completed in ${Date.now() - startTime}ms: ${result.synced} synced, ${result.errors.length} errors`)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Sync failed'
    result.errors.push(errorMsg)
    console.error(`[SYNC] Fatal error:`, errorMsg)

    // Update sync error
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
