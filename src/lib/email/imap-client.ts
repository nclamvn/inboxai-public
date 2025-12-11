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

export async function syncEmails(account: SourceAccount, limit: number = 50): Promise<SyncResult> {
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
      logger: false
    })

    await client.connect()

    // Select INBOX
    const mailbox = await client.getMailboxLock('INBOX')

    try {
      // Fetch messages
      const messages: Array<{ uid: number; source: Buffer }> = []
      const fetchRange = account.last_sync_uid
        ? `${parseInt(account.last_sync_uid) + 1}:*`
        : '1:*'

      for await (const message of client.fetch(fetchRange, { source: true, uid: true }, { uid: true })) {
        if (message.source) {
          messages.push({
            uid: message.uid,
            source: message.source
          })
        }

        if (messages.length >= limit) break
      }

      // Process messages
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

          if (existing) continue

          // Extract from address
          const fromAddress = parsed.from?.value?.[0]?.address || ''
          const fromName = parsed.from?.value?.[0]?.name || ''

          // Extract to addresses
          const toAddresses = parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                .flatMap(t => t.value?.map(v => v.address) || [])
            : []

          // Insert email
          await supabase.from('emails').insert({
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
          })

          result.synced++
          result.lastUid = String(msg.uid)
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : 'Parse error'
          result.errors.push(`UID ${msg.uid}: ${errorMsg}`)
        }
      }

      // Update last sync UID
      if (result.lastUid) {
        await supabase
          .from('source_accounts')
          .update({
            last_sync_uid: result.lastUid,
            last_sync_at: new Date().toISOString(),
            sync_error: null
          })
          .eq('id', account.id)
      }

      result.success = true
    } finally {
      mailbox.release()
    }

    await client.logout()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Sync failed'
    result.errors.push(errorMsg)

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
