import 'server-only'
import { createHash } from 'node:crypto'
import type { createClient } from '@/lib/supabase/server'
import { getImapPassword } from '@/lib/credential-vault/vault'
import { connectImap } from '@/lib/email/imap-connection'
import { getValidAccessToken } from '@/lib/gmail/sync'
import { parseHeaders, type GmailMessage, type GmailMessagePart } from '@/lib/gmail/api'
import { matchesImapNamespace } from '@/lib/sync/imap-identity'
import { SendError } from '@/lib/mail-send/contracts'
import { z } from 'zod'

type Client = Awaited<ReturnType<typeof createClient>>
const sentFile = z.object({ filename: z.string(), contentType: z.string(), data: z.string(),
  sha256: z.string(), emailId: z.uuid() })

async function gmailJson(token: string, path: string, limit: number, deadline?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000)
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + path, {
    headers: { Authorization: 'Bearer ' + token }, signal: deadline ? AbortSignal.any([deadline, timeout]) : timeout,
    redirect: 'error', cache: 'no-store',
  })
  if (!response.ok) throw new SendError(response.status === 404 ? 404 : 502, 'Không tải được tệp từ Gmail.')
  const reader = response.body?.getReader()
  if (!reader) throw new SendError(502, 'Không tải được tệp từ Gmail.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > limit) {
        await reader.cancel()
        throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
      }
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally {
    reader.releaseLock()
  }
}

function gmailPart(root: GmailMessagePart, partKey: string) {
  const stack: [GmailMessagePart, string][] = [[root, '0']]
  for (let visited = 0; stack.length && visited < 1000; visited++) {
    const [part, path] = stack.pop()!
    if (part.filename && (part.partId || path) === partKey) return part
    part.parts?.forEach((child, index) => stack.push([child, path + '.' + index]))
  }
}

const maxDownload = 25 * 1024 * 1024

export type AttachmentReadBudget = { signal: AbortSignal; maxGmailEnvelope?: number }

export async function readMailAttachment(client: Client, actor: string, id: string, source?: string, limit = maxDownload,
  verifyGmailSource = false, budget?: AttachmentReadBudget) {
  const timeout = AbortSignal.timeout(10_000)
  const deadline = budget ? AbortSignal.any([budget.signal, timeout]) : timeout
  const attachmentQuery = client.from('attachments')
    .select('email_id, filename, size, sync_part_key, emails!inner(original_uid, user_id, sync_namespace, source_account_id, provider_deleted, is_deleted, subject, from_address, received_at)')
    .eq('id', id).eq('emails.user_id', actor)
  const { data: attachment, error } = await (budget ? attachmentQuery.abortSignal(deadline) : attachmentQuery).single()
  if (error || !attachment) {
    if (verifyGmailSource) throw new SendError(404, 'Không tìm thấy tệp trong email.')
    const { data, error: storedError } = await client.rpc('read_sent_mail_file', { p_id: id })
      .abortSignal(AbortSignal.timeout(10_000))
    const stored = sentFile.safeParse(data)
    if (storedError || !stored.success || (source && stored.data.emailId !== source)) {
      throw new SendError(404, 'Không tìm thấy tệp trong email.')
    }
    const content = Buffer.from(stored.data.data, 'base64')
    if (content.length > limit) throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
    if (createHash('sha256').update(content).digest('hex') !== stored.data.sha256) {
      throw new SendError(409, 'Nội dung tệp đã thay đổi.')
    }
    return { filename: stored.data.filename, contentType: stored.data.contentType, content }
  }

  const email = attachment.emails as unknown as {
    user_id: string; original_uid: string; sync_namespace: string; source_account_id: string | null
    provider_deleted?: boolean; is_deleted?: boolean
    subject: string; from_address: string; received_at: string
  }
  if (email.user_id !== actor) throw new SendError(403, 'Không có quyền truy cập tệp.')
  if ((source && source !== attachment.email_id) || email.provider_deleted || email.is_deleted) {
    throw new SendError(404, 'Không tìm thấy tệp trong email.')
  }
  if (!email.source_account_id || !email.original_uid) throw new SendError(400, 'Không tìm thấy tài khoản nguồn.')
  if (attachment.size > limit) throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
  const partKey = attachment.sync_part_key

  if (email.sync_namespace === 'gmail' && /^[A-Za-z0-9_-]{1,128}$/.test(email.original_uid)) {
    const token = await getValidAccessToken(actor, email.source_account_id, budget ? deadline : AbortSignal.timeout(10_000))
    if (!token) throw new SendError(403, 'Chưa có quyền đọc thư Gmail.')
    const path = encodeURIComponent(email.original_uid)
    const message = await gmailJson(token, path + '?format=full', budget?.maxGmailEnvelope ?? Math.ceil(maxDownload * 1.5) + 65536,
      budget?.signal) as GmailMessage
    const part = message.id === email.original_uid && message.payload && typeof partKey === 'string'
      ? gmailPart(message.payload, partKey) : undefined
    if (!part?.filename) throw new SendError(404, 'Không tìm thấy tệp trong email.')
    if (verifyGmailSource) {
      const headers = parseHeaders(message.payload.headers)
      const rawFrom = headers.from || ''
      const address = rawFrom.match(/^(.*?)\s*<([^>]+)>$/)?.[2] ?? rawFrom
      const labels = message.labelIds || []
      if (headers.subject !== email.subject || address !== email.from_address ||
        Number(message.internalDate) !== Date.parse(email.received_at) ||
        labels.includes('SENT') || labels.includes('TRASH') || part.filename !== attachment.filename ||
        part.body?.size !== attachment.size) {
        throw new SendError(409, 'Email hoặc tệp trên Gmail đã thay đổi. Hãy đồng bộ và xem lại phiếu.')
      }
    }
    if ((part.body?.size ?? 0) > limit) throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
    const data = part.body?.attachmentId
      ? z.object({ data: z.string() }).parse(await gmailJson(token,
        path + '/attachments/' + encodeURIComponent(part.body.attachmentId), Math.ceil(limit * 1.5) + 1024, budget?.signal)).data
      : part.body?.data
    if (typeof data !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(data)) {
      throw new SendError(502, 'Không đọc được nội dung tệp Gmail.')
    }
    const content = Buffer.from(data, 'base64url')
    if (content.length > limit) throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
    if (part.body?.size !== undefined && content.length !== part.body.size) {
      throw new SendError(502, 'Nội dung tệp Gmail chưa đầy đủ.')
    }
    return { filename: part.filename, contentType: part.mimeType || 'application/octet-stream', content }
  }

  if (verifyGmailSource) throw new SendError(404, 'Nguồn phiếu CSV phải là email Gmail đã đồng bộ.')
  if (!email.sync_namespace?.startsWith('INBOX:') || !/^\d+$/.test(email.original_uid)) {
    throw new SendError(409, 'Cần đồng bộ email trước khi lấy tệp.')
  }
  const { data: account } = await client.from('source_accounts')
    .select('id, imap_host, imap_port, imap_secure, username')
    .eq('id', email.source_account_id).eq('user_id', actor).single()
  if (!account) throw new SendError(400, 'Không tìm thấy tài khoản nguồn.')
  const password = await getImapPassword(actor, account.id)
  const signal = AbortSignal.timeout(20_000)
  const imap = await connectImap({ host: account.imap_host, port: account.imap_port, secure: account.imap_secure,
    username: account.username, password }, signal)
  const abort = () => imap.close()
  signal.addEventListener('abort', abort, { once: true })
  let lock: Awaited<ReturnType<typeof imap.getMailboxLock>> | undefined
  async function assertMailbox() {
    if (!matchesImapNamespace(email.sync_namespace, (await imap.status('INBOX', { uidValidity: true })).uidValidity)) {
      throw new SendError(409, 'Hộp thư đã thay đổi. Hãy đồng bộ lại.')
    }
  }
  try {
    lock = await imap.getMailboxLock('INBOX', { readOnly: true })
    await assertMailbox()
    const wireLimit = maxDownload * 2
    const message = await imap.fetchOne(email.original_uid, { source: { maxLength: wireLimit + 1 } }, { uid: true })
    if (!message || !message.source) throw new SendError(404, 'Không tìm thấy email trên máy chủ.')
    if (message.source.length > wireLimit) throw new SendError(413, 'Email vượt giới hạn dung lượng.')
    await assertMailbox()
    const { simpleParser } = await import('mailparser')
    const parsed = await simpleParser(message.source)
    const part = typeof partKey === 'string' && /^\d+$/.test(partKey) ? parsed.attachments[Number(partKey)] : undefined
    if (!part) throw new SendError(404, 'Không tìm thấy tệp trong email.')
    if (part.content.length > limit) throw new SendError(413, 'Tệp vượt giới hạn dung lượng.')
    return { filename: part.filename || 'attachment', contentType: part.contentType, content: part.content }
  } finally {
    signal.removeEventListener('abort', abort)
    lock?.release()
    imap.close()
  }
}
