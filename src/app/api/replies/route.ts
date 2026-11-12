import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { sendFromAccount } from '@/lib/mail-send/server'
import { sendInput, sendKey, SendError } from '@/lib/mail-send/contracts'
import type { ReplyWorkbench } from '@/lib/replies/contracts'
import { composeFileIds } from '@/lib/compose/contracts'
import { composeRpcError } from '@/lib/compose/server'
import { syncAccount } from '@/lib/sync/account'

export const maxDuration = 60
const id = z.uuid()
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const revision = z.number().int().positive().max(2_147_483_647)
const actions = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('save'), source: id, id: id.nullable(), revision: revision.nullable(), fingerprint,
    fileIds: composeFileIds.optional(), to: z.string().max(4000), cc: z.string().max(4000), body: z.string().max(100_000).regex(/^[^\x00]*$/),
  }),
  z.strictObject({ action: z.literal('prepare'), source: id, id, revision }),
  z.strictObject({ action: z.enum(['send', 'check', 'track', 'stop', 'finish', 'discard']), id }),
  z.strictObject({ action: z.literal('edit'), id, fingerprint }),
  z.strictObject({ action: z.literal('schedule-followup'), id, on: z.iso.date(), expected: id.nullable() }),
  z.strictObject({ action: z.enum(['preview-followup', 'check-followup']), id }),
  z.strictObject({ action: z.literal('send-followup'), id, key: sendKey, proof: fingerprint }),
])

const followupPreview = z.object({
  key: sendKey, proof: fingerprint, accountId: id, sourceId: id, subject: z.string(), text: z.string(),
  to: z.array(z.string()), cc: z.array(z.string()),
})
const followupReceipt = z.object({ accountId: id, key: sendKey, hash: fingerprint })
const followupChanged = 'Lịch hẹn hoặc hồi đáp đã thay đổi. Hãy xem lại hội thoại.'

type Client = Awaited<ReturnType<typeof createClientForRequest>>
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}
async function rpc(client: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8000))
  if (!error) return data
  if (error.code === 'PT413') throw composeRpcError(error.code)
  if (error.code === 'PT404') throw new SendError(404, 'Không tìm thấy thư nguồn hoặc bản nháp.')
  if (error.code === 'PT409') throw new SendError(409, name === 'read_reply_followup_preview' || name === 'schedule_reply_followup'
    ? followupChanged : 'Bản nháp hoặc thư nguồn đã thay đổi. Hãy kiểm tra lại.')
  if (name === 'schedule_reply_followup' && ['22023', '22007', '22008'].includes(error.code)) {
    throw new SendError(400, 'Chọn ngày kiểm tra từ hôm nay theo giờ Việt Nam.')
  }
  if (error.code === '22023' || error.code === '23514' || error.code === '22P05') throw new SendError(400, 'Thông tin bản nháp không hợp lệ.')
  throw new SendError(503, 'Chưa thể truy cập bản nháp. Hãy thử lại.')
}
async function authenticated(request: NextRequest, handler: (client: Client, actor: string) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return json({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await handler(client, user.id)
  } catch (error) {
    return json({ error: error instanceof SendError ? error.message : 'Chưa thể xác nhận yêu cầu. Hãy kiểm tra lại.',
      ...(error instanceof SendError && error.code ? { code: error.code } : {}),
    }, error instanceof SendError ? error.status : 503)
  }
}
async function readAction(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new SendError(415, 'Nội dung phải là JSON.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new SendError(400, 'Thiếu nội dung yêu cầu.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.length
      if (length > 650_000) {
        await reader.cancel()
        throw new SendError(413, 'Bản nháp vượt giới hạn.')
      }
      chunks.push(next.value)
    }
    const result = actions.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))))
    if (!result.success) throw new SendError(400, 'Thông tin bản nháp không hợp lệ.')
    return result.data
  } catch (error) {
    if (error instanceof SendError) throw error
    throw new SendError(400, 'Nội dung bản nháp không hợp lệ.')
  } finally {
    reader.releaseLock()
  }
}
const workbench = (client: Client, source: string) => rpc(client, 'read_reply_workbench', { p_source: source }) as Promise<ReplyWorkbench>

async function sendFollowup(client: Client, actor: string, input: { id: string; key?: string; proof?: string }) {
  const receipt = await rpc(client, 'read_reply_followup_receipt', { p_id: input.id })
  const unavailable = () => { throw new SendError(409, followupChanged) }
  if (receipt) {
    const scope = followupReceipt.parse(receipt)
    if (input.key && (scope.key !== input.key || scope.hash !== input.proof)) return unavailable()
    // A status check reconciles the existing operation even if a reply has arrived.
    return sendFromAccount({ userId: actor, ...scope }, unavailable, { followupId: input.id }, true)
  }
  if (!input.key) throw new SendError(409, 'Chưa có lượt gửi để xác minh. Hãy mở lại thư nhắc.')

  async function currentPreview() {
    const preview = followupPreview.parse(await rpc(client, 'read_reply_followup_preview', { p_id: input.id }))
    if (preview.key !== input.key || preview.proof !== input.proof) return unavailable()
    return preview
  }
  const approved = await currentPreview()
  return sendFromAccount({ userId: actor, accountId: approved.accountId, key: approved.key, hash: approved.proof }, async () => {
    const { data: account, error } = await client.from('source_accounts').select('*')
      .eq('id', approved.accountId).eq('user_id', actor).eq('is_active', true).single()
    if (error || !account) throw new SendError(409, 'Tài khoản gửi không còn khả dụng.')
    const synced = await syncAccount(account, { limit: 100, timeoutMs: 10_000 })
    if (!synced.success || synced.pending) {
      throw new SendError(409, 'Chưa kiểm tra xong thư mới. Hãy thử lại sau khi đồng bộ.')
    }
    const fresh = await currentPreview()
    return sendInput.parse({ sourceAccountId: fresh.accountId, replyToEmailId: fresh.sourceId,
      subject: fresh.subject, text: fresh.text, to: fresh.to, cc: fresh.cc })
  }, { followupId: input.id })
}

export async function GET(request: NextRequest) {
  return authenticated(request, async client => {
    const params = request.nextUrl.searchParams
    if (params.has('source')) {
      const source = id.safeParse(params.get('source'))
      if (!source.success) throw new SendError(400, 'Email nguồn không hợp lệ.')
      return json(await workbench(client, source.data))
    }
    const accounts = z.array(id).max(50).safeParse(params.getAll('account'))
    if (!accounts.success) throw new SendError(400, 'Bộ lọc tài khoản không hợp lệ.')
    return json(await rpc(client, 'list_reply_work', { p_accounts: accounts.data }))
  })
}

export async function POST(request: NextRequest) {
  return authenticated(request, async (client, actor) => {
    const input = await readAction(request)
    if (input.action === 'schedule-followup') return json(await rpc(client, 'schedule_reply_followup', {
      p_id: input.id, p_on: input.on, p_expected: input.expected,
    }))
    if (input.action === 'preview-followup') {
      return json(await rpc(client, 'read_reply_followup_preview', { p_id: input.id }))
    }
    if (input.action === 'check-followup' || input.action === 'send-followup') {
      const result = await sendFollowup(client, actor, input)
      result.headers.set('Cache-Control', 'private, no-store')
      return result
    }
    if (input.action === 'save') {
      return json(await rpc(client, input.fileIds ? 'save_reply_files' : 'save_reply_draft', {
        p_source: input.source, p_id: input.id, p_revision: input.revision, p_fingerprint: input.fingerprint,
        p_to: input.to, p_cc: input.cc, p_body: input.body, ...(input.fileIds && { p_files: input.fileIds }),
      }))
    }
    const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (input.action === 'prepare') {
      const { draft, accountId, stale } = await workbench(client, input.source)
      if (stale || !draft || draft.id !== input.id || draft.revision !== input.revision) {
        throw new SendError(409, 'Bản nháp hoặc thư nguồn đã thay đổi. Hãy kiểm tra lại.')
      }
      const addresses = (value: string) => value.trim() ? value.split(',').map(address => address.trim()) : []
      const envelope = sendInput.safeParse({ sourceAccountId: accountId, replyToEmailId: draft.sourceId,
        to: addresses(draft.to), cc: addresses(draft.cc), subject: draft.subject, text: draft.body,
        ...(draft.files?.length && { attachmentIds: draft.files.map(file => file.id) }) })
      if (!envelope.success || !draft.body.trim()) throw new SendError(400, 'Kiểm tra địa chỉ người nhận và nội dung trước khi gửi.')
      const hash = createHash('sha256').update(JSON.stringify(envelope.data)).digest('hex')
      return json(await rpc(service(), 'prepare_reply_send', { p_actor: actor, p_id: draft.id,
        p_revision: draft.revision, p_input: envelope.data, p_hash: hash }))
    }
    if (input.action === 'send' || input.action === 'check') {
      const approved = z.object({ key: sendKey, hash: fingerprint, input: sendInput }).safeParse(
        await rpc(service(), 'read_reply_approval', { p_actor: actor, p_id: input.id }))
      if (!approved.success) throw new SendError(404, 'Không tìm thấy yêu cầu gửi đã duyệt.')
      const { key, hash, input: envelope } = approved.data
      const result = await sendFromAccount({ userId: actor, accountId: envelope.sourceAccountId, key, hash },
        () => envelope, { replyId: input.id }, input.action === 'check')
      result.headers.set('Cache-Control', 'private, no-store')
      return result
    }
    return json(await rpc(client, 'change_reply_draft', {
      p_id: input.id, p_action: input.action, ...('fingerprint' in input && { p_fingerprint: input.fingerprint }),
    }))
  })
}
