import 'server-only'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getImapPassword } from '@/lib/credential-vault/vault'
import { disableGoogleSending, getGoogleCredential, requireGmailReconnect, resolveGoogleCredential } from '@/lib/gmail/credentials'
import { canSendGmail, canReadGmail, gmailSendPermissionRequired } from '@/lib/gmail/scopes'
import { sendEmailViaSMTP } from '@/lib/email/smtp-client'
import { EMAIL_PROVIDERS } from '@/lib/email/imap-client'
import { markSenderAsTrusted } from '@/lib/ai/sender-trust'
import { SendError, type MailPayload, type SendInput, type SendReceipt, type SendScope } from './contracts'
import { MailSendStore, type SendApproval } from './store'
import { executeMailSend } from './execute'
import { loadComposeFiles } from '@/lib/compose/server'
import { findGmailSent, gmailReplyThread, sendViaGmail } from './gmail'

const gmailPermissionMessage = 'Gmail chưa cho phép gửi từ tài khoản này. Hãy cấp quyền gửi trong Cài đặt.'

function sendResponse(receipt: SendReceipt, needsGmailPermission: boolean) {
  const info = { state: receipt.state, operationId: receipt.id, messageId: receipt.messageId }
  switch (receipt.state) {
    case 'accepted':
      return NextResponse.json({ ...info, success: true })
    case 'partial':
      return NextResponse.json({ ...info, success: false, error: 'Máy chủ chỉ chấp nhận một phần người nhận. Hãy kiểm tra trước khi gửi thư mới.' }, { status: 409 })
    case 'rejected':
      if (needsGmailPermission) return NextResponse.json({ ...info, success: false, error: gmailPermissionMessage,
        code: gmailSendPermissionRequired }, { status: 422 })
      return NextResponse.json({ ...info, success: false, error: 'Thư chưa được gửi. Hãy kiểm tra cấu hình tài khoản và người nhận.' }, { status: 422 })
    case 'dispatching':
      return NextResponse.json({ ...info, success: false, error: 'Yêu cầu đang được xử lý. Hãy kiểm tra lại trạng thái.' }, { status: 202 })
    case 'unknown':
      return NextResponse.json({ ...info, success: false, error: 'Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái hoặc thư đã gửi trước khi gửi thư mới.' }, { status: 202 })
  }
}

export async function sendFromAccount(
  scope: SendScope, resolveInput: () => SendInput | Promise<SendInput>, approval?: SendApproval, checkOnly = false,
) {
  const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8_000) }) },
  })

  let needsGmailPermission = false
  let recipients: string[] = []
  const result = await executeMailSend(new MailSendStore(admin, approval), scope, async () => {
    const input = await resolveInput()
    recipients = input.to
    const { data: account, error: accountError } = await admin.from('source_accounts')
      .select('id, email_address, display_name, provider, auth_type, username, smtp_host, smtp_port, smtp_secure, is_active')
      .eq('id', scope.accountId).eq('user_id', scope.userId).single()
    const scheduled = approval && 'scheduledId' in approval
    if (scheduled && accountError && accountError.code !== 'PGRST116') {
      throw new SendError(503, 'Chưa thể kiểm tra tài khoản gửi.')
    }
    if (!account || !account.is_active) throw new SendError(404, 'Không tìm thấy tài khoản gửi đang hoạt động.')
    if (scheduled && account.auth_type !== 'oauth_google') {
      throw new SendError(403, 'Lịch gửi yêu cầu tài khoản Gmail đang hoạt động.')
    }

    const files = input.attachmentIds?.length ? await loadComposeFiles(scope.userId, input.attachmentIds) : []
    const mimeAttachments = files.length ? files.map(({ metadata, content }) => ({
      filename: metadata.filename, contentType: metadata.contentType, content,
    })) : undefined
    const payload: MailPayload = {
      from: { address: account.email_address, name: account.display_name || account.email_address.split('@')[0] },
      to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text, html: input.html,
    }
    if (files.length) payload.attachments = files.map(file => file.metadata)
    let replyUid: string | undefined
    if (input.replyToEmailId) {
      const { data: original, error: sourceError } = await admin.from('emails')
        .select('subject, message_id, source_account_id, original_uid, sync_namespace')
        .eq('id', input.replyToEmailId).eq('user_id', scope.userId).single()
      if (scheduled && sourceError && sourceError.code !== 'PGRST116') {
        throw new SendError(503, 'Chưa thể kiểm tra thư gốc.')
      }
      if (!original) throw new SendError(404, 'Không tìm thấy thư gốc.')
      if (original.source_account_id !== scope.accountId) {
        throw new SendError(409, 'Tài khoản gửi phải là tài khoản của thư gốc.')
      }
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
    const google = provider === 'gmail'
      ? await resolveGoogleCredential(scope.userId, account.id, AbortSignal.timeout(10_000)).catch(error => {
        if (scheduled) throw error
        return null
      }) : null
    const gmailCredential = google?.credential
    if (scheduled && google && google.credential.scope !== undefined && !canReadGmail(google.credential.scope)) {
      await requireGmailReconnect(scope.userId, account.id, google.revision)
    }
    if (provider === 'gmail' && (!gmailCredential || !canSendGmail(gmailCredential))) {
      throw new SendError(403, gmailPermissionMessage, gmailSendPermissionRequired)
    }

    return { payload, async dispatch(receipt) {
      if (receipt.provider !== provider) return { state: 'rejected' }
      if (gmailCredential) {
        const signal = AbortSignal.timeout(25_000)
        let threadId: string | undefined
        if (replyUid && payload.inReplyTo && canReadGmail(gmailCredential.scope)) {
          try {
            threadId = await gmailReplyThread(gmailCredential.accessToken, replyUid, payload.inReplyTo, payload.subject,
              AbortSignal.any([signal, AbortSignal.timeout(5_000)]))
          } catch { /* The RFC reply headers still identify the original message. */ }
        }
        const outcome = await sendViaGmail(gmailCredential.accessToken, payload, receipt.messageId, signal, threadId, mimeAttachments)
        if (outcome.state === 'rejected' && outcome.reason === 'gmail_access_rejected') {
          // Check the grant without repeating the rejected send.
          await resolveGoogleCredential(scope.userId, account.id, AbortSignal.timeout(10_000), true).catch(() => {})
        }
        if (outcome.state === 'rejected' && outcome.reason === gmailSendPermissionRequired) {
          needsGmailPermission = true
          await disableGoogleSending(scope.userId, account.id, gmailCredential.accessToken)
        }
        return outcome
      }

      let password: string
      try {
        password = await getImapPassword(scope.userId, account.id)
      } catch {
        return { state: 'rejected' }
      }
      const result = await sendEmailViaSMTP({
        host, port: (account.smtp_host ? account.smtp_port : preset?.smtp_port) ?? 587,
        secure: (account.smtp_host ? account.smtp_secure : preset?.smtp_secure) ?? false,
        username: account.username || account.email_address, password,
      }, { ...payload, attachments: mimeAttachments, messageId: receipt.messageId })
      return { state: result.state ?? (result.success ? 'accepted' : 'unknown') }
    } }
  }, async receipt => {
    const signal = AbortSignal.timeout(20_000)
    const credential = await getGoogleCredential(scope.userId, scope.accountId, signal)
    return credential && (credential.scope === undefined || canReadGmail(credential.scope))
      ? findGmailSent(credential.accessToken, receipt.messageId, signal) : null
  }, async () => {
    // The send receipt is durable before this optional reputation update.
    await Promise.allSettled([...new Set(recipients)].map(email => markSenderAsTrusted(scope.userId, email, 'replied')))
  }, checkOnly)

  return sendResponse(result, needsGmailPermission)
}
