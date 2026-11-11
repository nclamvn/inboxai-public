import nodemailer from 'nodemailer'
import 'server-only'

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
  messageId?: string
  inReplyTo?: string
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
  state?: 'accepted' | 'partial' | 'unknown' | 'rejected'
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
  } catch {
    const errorMsg = 'SMTP connection failed'
    return { success: false, error: errorMsg }
  }
}

export async function sendEmailViaSMTP(
  config: SmtpConfig,
  params: SendEmailParams,
  signal = AbortSignal.timeout(25_000),
): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
    auth: {
      user: config.username,
      pass: config.password
    }
  })

  try {
    const info = await transporter.sendMail({
      signal,
      from: params.from,
      to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
      cc: params.cc?.join(', '),
      bcc: params.bcc?.join(', '),
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      messageId: params.messageId,
      inReplyTo: params.inReplyTo,
      references: params.inReplyTo,
      disableFileAccess: true,
      disableUrlAccess: true,
      attachments: params.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    })

    return {
      success: true,
      messageId: info.messageId,
      state: info.rejected?.length ? 'partial' : 'accepted'
    }
  } catch (error) {
    const smtpError = error as { code?: string; command?: string; responseCode?: number } | null
    const explicitRejection = smtpError?.code === 'EAUTH' ||
      (typeof smtpError?.responseCode === 'number' && smtpError.responseCode >= 400 &&
        smtpError.responseCode < 600 && ['MAIL FROM', 'RCPT TO', 'DATA'].includes(smtpError.command ?? ''))
    const errorMsg = 'SMTP send failed'
    return {
      success: false,
      error: errorMsg,
      state: explicitRejection ? 'rejected' : 'unknown'
    }
  }
}
