import { boundedText } from '@/lib/sync/text'
import 'server-only'
import { getImapPassword } from '@/lib/credential-vault/vault'
import { runSync } from '@/lib/sync/engine'
import { getSyncStore } from '@/lib/sync/store'
import { imapProvider } from '@/lib/sync/imap-provider'
import { openImapReader,type ImapAccount } from '@/lib/sync/imap-reader'
import { matchesImapNamespace } from '@/lib/sync/imap-identity'
import { SyncError } from '@/lib/sync/contracts'
import { connectImap } from './imap-connection'
import type { MailCredentials } from './mail-destination'
export type SourceAccount=ImapAccount & {email_address:string;provider:string;auth_type?:string}

export async function testImapConnection(config: MailCredentials): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await connectImap(config)
    try { await client.logout() } finally { client.close() }
    return { success: true }
  } catch {
    const errorMsg = 'IMAP connection failed'
    return { success: false, error: errorMsg }
  }
}


export async function syncEmails(account:SourceAccount,options:{limit?:number;fullSync?:boolean}={}){
 const result=await runSync(getSyncStore(),{userId:account.user_id,accountId:account.id,provider:'imap'},async signal=>{
  let password:string
  try{password=await getImapPassword(account.user_id,account.id)}catch{throw new SyncError('credentials')}
  return imapProvider(await openImapReader(account,password,signal))
 },options)
 return {...result,errors:result.error?[result.error]:[]}
}

// PHASE 2: Fetch body for a single email (lazy load)
export async function fetchEmailBody(
  account: SourceAccount,
  originalUid: string,
  namespace?: string
): Promise<{ body_text: string; body_html: string | null } | null> {
  if(!namespace?.startsWith('INBOX:') || !/^\d+$/.test(originalUid))return null
  let password: string
  try {
    password = await getImapPassword(account.user_id, account.id)
  } catch {
    return null
  }

  try {
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
      if(!matchesImapNamespace(namespace,status.uidValidity))return null
      // Fetch single email by UID
      const message = await client.fetchOne(originalUid, {
        source: true
      }, { uid: true }) as { source?: Buffer } | false

      if (!message || !message.source) {
        return null
      }

      if(!matchesImapNamespace(namespace,(await client.status('INBOX',{uidValidity:true})).uidValidity))return null
      // Parse with simpleParser
      const { simpleParser } = await import('mailparser')
      const parsed = await simpleParser(message.source, {
        skipHtmlToText: false,
        skipTextToHtml: true,
        skipImageLinks: true
      })

      return {
        body_text: boundedText(parsed.text||'',50000),
        body_html: parsed.html ? boundedText(parsed.html as string,100000) : null
      }

    } finally {
      lock?.release()
      client.close()
    }

  } catch {
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
