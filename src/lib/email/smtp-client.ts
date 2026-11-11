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
  } catch {
    const errorMsg = 'SMTP connection failed'
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
  } catch {
    const errorMsg = 'SMTP send failed'
    return {
      success: false,
      error: errorMsg
    }
  }
}
