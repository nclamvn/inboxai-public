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
}

interface SyncResult {
  success: boolean
  synced: number
  errors: string[]
  lastUid?: string
}

interface SyncOptions {
  limit?: number
  fullSync?: boolean  // Sync all emails, not just new ones
}

export async function testImapConnection(config: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Dynamic import to avoid build-time issues
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
  const { limit = 200, fullSync = false } = options

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

  const password = decryptPassword(account.password_encrypted)

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

    // Select INBOX
    const mailbox = await client.getMailboxLock('INBOX')

    try {
      // Get mailbox status to know total messages
      const status = await client.status('INBOX', { messages: true, uidNext: true })
      const totalMessages = status.messages || 0
      console.log(`[SYNC] Total messages in INBOX: ${totalMessages}`)

      // Determine fetch range
      let fetchRange: string

      if (fullSync) {
        // Full sync: fetch all (newest first by using reverse order later)
        fetchRange = '1:*'
        console.log(`[SYNC] Full sync mode - fetching all messages`)
      } else if (account.last_sync_uid) {
        // Incremental sync: only new emails since last sync
        const lastUid = parseInt(account.last_sync_uid)
        fetchRange = `${lastUid + 1}:*`
        console.log(`[SYNC] Incremental sync - fetching UID > ${lastUid}`)
      } else {
        // First sync: fetch most recent emails (last N based on sequence number)
        const startSeq = Math.max(1, totalMessages - limit + 1)
        fetchRange = `${startSeq}:*`
        console.log(`[SYNC] First sync - fetching sequences ${startSeq} to ${totalMessages}`)
      }

      // Fetch messages
      const messages: Array<{ uid: number; source: Buffer }> = []

      for await (const message of client.fetch(fetchRange, { source: true, uid: true }, { uid: true })) {
        if (message.source) {
          messages.push({
            uid: message.uid,
            source: message.source
          })
        }

        if (messages.length >= limit) {
          console.log(`[SYNC] Reached limit: ${limit}`)
          break
        }

        // Log progress every 50 messages
        if (messages.length % 50 === 0) {
          console.log(`[SYNC] Fetched ${messages.length} messages...`)
        }
      }

      console.log(`[SYNC] Total fetched: ${messages.length} messages`)

      // Process messages
      let processedCount = 0
      let skippedCount = 0

      for (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source)

          // Check if email already exists
          const { data: existing } = await supabase
            .from('emails')
            .select('id')
            .eq('source_account_id', account.id)
            .eq('original_uid', String(msg.uid))
            .single()

          if (existing) {
            skippedCount++
            continue
          }

          // Extract from address
          const fromAddress = parsed.from?.value?.[0]?.address || ''
          const fromName = parsed.from?.value?.[0]?.name || ''

          // Extract to addresses
          const toAddresses = parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                .flatMap(t => t.value?.map(v => v.address) || [])
            : []

          // Insert email
          const { data: insertedEmail, error: insertError } = await supabase.from('emails').insert({
            user_id: account.user_id,
            source_account_id: account.id,
            original_uid: String(msg.uid),
            message_id: parsed.messageId || `${msg.uid}@${account.imap_host}`,
            from_address: fromAddress,
            from_name: fromName,
            to_addresses: toAddresses,
            cc_addresses: parsed.cc
              ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
                  .flatMap(c => c.value?.map(v => v.address) || [])
              : [],
            subject: parsed.subject || '(No subject)',
            body_text: parsed.text || '',
            body_html: parsed.html || null,
            received_at: parsed.date?.toISOString() || new Date().toISOString(),
            is_read: false,
            is_starred: false,
            is_archived: false,
            is_deleted: false,
            direction: 'inbound'
          }).select('id').single()

          if (insertError) {
            // Handle duplicate key error gracefully
            if (insertError.code === '23505') {
              skippedCount++
              continue
            }
            throw insertError
          }

          result.synced++
          result.lastUid = String(msg.uid)
          processedCount++

          // Trigger auto-classify (non-blocking)
          if (insertedEmail?.id) {
            classifyEmailAsync(insertedEmail.id).catch(() => {})
          }

          // Log progress every 20 emails saved
          if (processedCount % 20 === 0) {
            console.log(`[SYNC] Saved ${processedCount} emails...`)
          }
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : 'Parse error'
          result.errors.push(`UID ${msg.uid}: ${errorMsg}`)
          console.error(`[SYNC] Error processing UID ${msg.uid}:`, errorMsg)
        }
      }

      console.log(`[SYNC] Completed: ${result.synced} saved, ${skippedCount} skipped (duplicates)`)

      // Update last sync UID and stats
      const updateData: Record<string, unknown> = {
        last_sync_at: new Date().toISOString(),
        sync_error: result.errors.length > 0 ? result.errors.slice(0, 3).join('; ') : null
      }

      if (result.lastUid) {
        updateData.last_sync_uid = result.lastUid
      }

      // Update total_emails_synced
      if (result.synced > 0) {
        const { data: currentAccount } = await supabase
          .from('source_accounts')
          .select('total_emails_synced')
          .eq('id', account.id)
          .single()

        updateData.total_emails_synced = (currentAccount?.total_emails_synced || 0) + result.synced
      }

      await supabase
        .from('source_accounts')
        .update(updateData)
        .eq('id', account.id)

      result.success = true
    } finally {
      mailbox.release()
    }

    await client.logout()
    console.log(`[SYNC] Disconnected from ${account.imap_host}`)
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

// Helper: classify email async (fire and forget)
async function classifyEmailAsync(emailId: string): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    if (!baseUrl) {
      console.log('[CLASSIFY] No base URL configured, skipping auto-classify')
      return
    }

    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

    // Fire and forget - don't await
    fetch(`${url}/api/ai/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId })
    }).catch((err) => {
      console.log(`[CLASSIFY] Failed for ${emailId}:`, err.message)
    })
  } catch {
    // Ignore errors - non-critical
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
