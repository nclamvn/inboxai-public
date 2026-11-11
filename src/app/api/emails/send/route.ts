import { createHash } from 'node:crypto'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getImapPassword } from '@/lib/credential-vault/vault'
import { getGoogleCredential } from '@/lib/gmail/credentials'
import { sendEmailViaSMTP } from '@/lib/email/smtp-client'
import { EMAIL_PROVIDERS } from '@/lib/email/imap-client'
import { markSenderAsTrusted } from '@/lib/ai/sender-trust'
import { sendInput, sendKey, SendError, type MailPayload, type SendReceipt } from '@/lib/mail-send/contracts'
import { MailSendStore } from '@/lib/mail-send/store'
import { executeMailSend } from '@/lib/mail-send/execute'
import { findGmailSent, gmailReplyThread, sendViaGmail } from '@/lib/mail-send/gmail'

export const maxDuration = 60

function response(receipt: SendReceipt) {
  const info = { state: receipt.state, operationId: receipt.id, messageId: receipt.messageId }
  switch (receipt.state) {
    case 'accepted':
      return NextResponse.json({ ...info, success: true })
    case 'partial':
      return NextResponse.json({ ...info, success: false, error: 'Máy chủ chỉ chấp nhận một phần người nhận. Hãy kiểm tra trước khi gửi thư mới.' }, { status: 409 })
    case 'rejected':
      return NextResponse.json({ ...info, success: false, error: 'Thư chưa được gửi. Hãy kiểm tra cấu hình tài khoản và người nhận.' }, { status: 422 })
    case 'dispatching':
      return NextResponse.json({ ...info, success: false, error: 'Yêu cầu đang được xử lý. Hãy kiểm tra lại trạng thái.' }, { status: 202 })
    case 'unknown':
      return NextResponse.json({ ...info, success: false, error: 'Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái hoặc thư đã gửi trước khi gửi thư mới.' }, { status: 202 })
  }
}

async function readJson(request: NextRequest) {
  const reader = request.body?.getReader()
  if (!reader) throw new SendError(400, 'Thiếu nội dung gửi.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2 * 1024 * 1024) {
      await reader.cancel()
      throw new SendError(413, 'Nội dung gửi vượt giới hạn.')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new SendError(400, 'Nội dung gửi không hợp lệ.')
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const key = sendKey.safeParse(request.headers.get('Idempotency-Key'))
    if (!key.success) throw new SendError(400, 'Thiếu mã gửi hợp lệ. Hãy tải lại trang soạn thư.')
    const parsed = sendInput.safeParse(await readJson(request))
    if (!parsed.success) throw new SendError(400, 'Vui lòng kiểm tra tài khoản, người nhận và nội dung thư.')
    const input = parsed.data
    const scope = {
      userId: user.id,
      accountId: input.sourceAccountId,
      key: key.data,
      hash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    }
    const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8_000) }) },
    })

    const result = await executeMailSend(new MailSendStore(admin), scope, async () => {
      const { data: account } = await admin.from('source_accounts')
        .select('id, email_address, display_name, provider, auth_type, username, smtp_host, smtp_port, smtp_secure, is_active')
        .eq('id', scope.accountId).eq('user_id', user.id).single()
      if (!account || !account.is_active) throw new SendError(404, 'Không tìm thấy tài khoản gửi đang hoạt động.')

      const payload: MailPayload = {
        from: { address: account.email_address, name: account.display_name || account.email_address.split('@')[0] },
        to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text, html: input.html,
      }
      let replyUid: string | undefined
      if (input.replyToEmailId) {
        const { data: original } = await admin.from('emails')
          .select('subject, message_id, source_account_id, original_uid, sync_namespace')
          .eq('id', input.replyToEmailId).eq('user_id', user.id).single()
        if (!original) throw new SendError(404, 'Không tìm thấy thư gốc.')
        if (!/^re:/i.test(input.subject) && original.subject && !/[\r\n\x00]/.test(original.subject)) {
          payload.subject = `Re: ${original.subject.slice(0, 496)}`
        }
        if (typeof original.message_id === 'string' && /^<[^<>\s@]+@[^<>\s@]+>$/.test(original.message_id) &&
            original.message_id.length <= 998) {
          payload.inReplyTo = original.message_id
          if (original.source_account_id === account.id && original.sync_namespace === 'gmail') replyUid = original.original_uid
        }
      }

      const provider = account.auth_type === 'oauth_google' ? 'gmail' : 'smtp'
      const preset = EMAIL_PROVIDERS[account.provider as keyof typeof EMAIL_PROVIDERS]
      const host = account.smtp_host || preset?.smtp_host
      if (provider === 'smtp' && !host) throw new SendError(400, 'Tài khoản chưa cấu hình SMTP.')

      return { payload, async dispatch(receipt) {
        if (receipt.provider !== provider) return { state: 'rejected' }
        if (provider === 'gmail') {
          const signal = AbortSignal.timeout(25_000)
          const credential = await getGoogleCredential(user.id, account.id, signal)
          if (!credential || signal.aborted) return { state: 'rejected' }
          const scopes = credential.scope?.split(/\s+/)
          if (scopes?.length && !scopes.some(scope => [
            'https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send',
          ].includes(scope))) return { state: 'rejected' }

          let threadId: string | undefined
          if (replyUid && payload.inReplyTo) {
            try {
              threadId = await gmailReplyThread(credential.accessToken, replyUid, payload.inReplyTo, payload.subject,
                AbortSignal.any([signal, AbortSignal.timeout(5_000)]))
            } catch { /* The RFC reply headers still identify the original message. */ }
          }
          return sendViaGmail(credential.accessToken, payload, receipt.messageId, signal, threadId)
        }

        let password: string
        try {
          password = await getImapPassword(user.id, account.id)
        } catch {
          return { state: 'rejected' }
        }
        const result = await sendEmailViaSMTP({
          host, port: (account.smtp_host ? account.smtp_port : preset?.smtp_port) || 587,
          secure: (account.smtp_host ? account.smtp_secure : preset?.smtp_secure) ?? false,
          username: account.username || account.email_address, password,
        }, { ...payload, messageId: receipt.messageId })
        return { state: result.state ?? (result.success ? 'accepted' : 'unknown') }
      } }
    }, async receipt => {
      const signal = AbortSignal.timeout(20_000)
      const credential = await getGoogleCredential(user.id, scope.accountId, signal)
      return credential ? findGmailSent(credential.accessToken, receipt.messageId, signal) : null
    }, async () => {
      // The send receipt is durable before this optional reputation update.
      await Promise.allSettled([...new Set(input.to)].map(email => markSenderAsTrusted(user.id, email, 'replied')))
    })

    return response(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof SendError ? error.message : 'Chưa thể xác nhận yêu cầu. Hãy kiểm tra lại với cùng nội dung.',
    }, { status: error instanceof SendError ? error.status : 503 })
  }
}
