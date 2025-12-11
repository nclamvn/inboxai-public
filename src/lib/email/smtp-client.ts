import nodemailer from 'nodemailer'
import { decryptPassword } from './imap-client'

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

interface SendEmailParams {
  from: {
    name: string
    address: string
  }
  to: string | string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password
    }
  })

  try {
    await transporter.verify()
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Connection failed'
    return { success: false, error: errorMsg }
  }
}

export async function sendEmailViaSMTP(
  config: SmtpConfig,
  params: SendEmailParams
): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password
    }
  })

  try {
    const info = await transporter.sendMail({
      from: `"${params.from.name}" <${params.from.address}>`,
      to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
      cc: params.cc?.join(', '),
      bcc: params.bcc?.join(', '),
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    })

    return {
      success: true,
      messageId: info.messageId
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Send failed'
    return {
      success: false,
      error: errorMsg
    }
  }
}

// Helper to create SMTP config from source account
export function createSmtpConfigFromAccount(account: {
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  username: string
  password_encrypted: string
}): SmtpConfig {
  return {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    username: account.username,
    password: decryptPassword(account.password_encrypted)
  }
}
