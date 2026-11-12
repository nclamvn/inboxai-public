import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { composeFields, composeFileIds, type FileComposeDraft } from '@/lib/compose/contracts'
import { composeRpcError, composeService } from '@/lib/compose/server'
import { SendError, sendInput, sendKey } from '@/lib/mail-send/contracts'
import { sendFromAccount } from '@/lib/mail-send/server'

import { approveSchedule } from '@/lib/scheduled-mail/server'

export const maxDuration = 60
const id = z.uuid()
const revision = z.number().int().positive().max(2_147_483_647)
const actions = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('save'), id: id.nullable(), sourceId: id.nullable(), revision: revision.nullable(),
    accountId: id, fields: composeFields, fileIds: composeFileIds }),
  z.strictObject({ action: z.literal('prepare'), id, revision }),
  z.strictObject({ action: z.literal('schedule'), id, revision, at: z.iso.datetime(), requestId: z.uuidv4() }),
  z.strictObject({ action: z.enum(['send', 'check', 'edit', 'discard']), id }),
])
const approval = z.object({ key: sendKey, hash: z.string().regex(/^[a-f0-9]{64}$/), input: sendInput })
type Client = Awaited<ReturnType<typeof createClientForRequest>>

async function rpc(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8000))
  if (result.error) throw composeRpcError(result.error.code)
  return result.data
}
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

async function authenticated(request: NextRequest, run: (client: Client, actor: string) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return json({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await run(client, user.id)
  } catch (error) {
    const failure = error instanceof SendError ? error : composeRpcError('unavailable')
    return json({ error: failure.message, ...(failure.code && { code: failure.code }) }, failure.status)
  }
}

async function readAction(request: NextRequest) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new SendError(415, 'Nội dung phải là JSON.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw composeRpcError('22023')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.length
      if (bytes > 650_000) {
        await reader.cancel()
        throw new SendError(413, 'Nội dung bản nháp vượt giới hạn.')
      }
      chunks.push(next.value)
    }
    const result = actions.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))))
    if (!result.success) throw composeRpcError('22023')
    return result.data
  } catch (error) {
    if (error instanceof SendError) throw error
    throw composeRpcError('22023')
  } finally {
    reader.releaseLock()
  }
}
const addresses = (value: string) => value.split(',').map(address => address.trim()).filter(Boolean)
const readDraft = (client: Client, draftId: string) =>
  rpc(client, 'read_file_compose', { p_id: draftId }) as Promise<FileComposeDraft>

export async function GET(request: NextRequest) {
  return authenticated(request, async client => {
    const target = id.nullable().safeParse(request.nextUrl.searchParams.get('id'))
    if (!target.success) throw composeRpcError('22023')
    return json(await rpc(client, 'read_file_compose', { p_id: target.data }))
  })
}

export async function POST(request: NextRequest) {
  return authenticated(request, async (client, actor) => {
    const action = await readAction(request)
    if (action.action === 'save') {
      const fields = { ...action.fields, to: addresses(action.fields.to).join(', '), cc: addresses(action.fields.cc).join(', ') }
      return json(await rpc(client, 'save_file_compose', { p_id: action.id, p_revision: action.revision,
        p_account: action.accountId, p_source: action.sourceId, p_fields: fields, p_files: action.fileIds }))
    }
    if (action.action === 'prepare' || action.action === 'schedule') {
      const draft = await readDraft(client, action.id)
      if (draft.revision !== action.revision) throw composeRpcError('PT409')
      const input = sendInput.safeParse({ sourceAccountId: draft.accountId, subject: draft.fields.subject,
        text: draft.fields.body, to: addresses(draft.fields.to), cc: addresses(draft.fields.cc),
        ...(draft.files.length > 0 && { attachmentIds: draft.files.map(file => file.id) }) })
      if (!input.success) throw new SendError(400, 'Kiểm tra người nhận và tiêu đề trước khi gửi.')
      const hash = createHash('sha256').update(JSON.stringify(input.data)).digest('hex')
      if (action.action === 'schedule') return json(await approveSchedule(actor, 'compose', action, input.data, hash))
      return json(await rpc(composeService(), 'prepare_file_compose', { p_actor: actor, p_id: action.id,
        p_revision: action.revision, p_input: input.data, p_hash: hash }))
    }
    if (action.action === 'send' || action.action === 'check') {
      const prepared = approval.safeParse(await rpc(composeService(), 'read_file_compose_approval', {
        p_actor: actor, p_id: action.id,
      }))
      if (!prepared.success) throw composeRpcError('PT404')
      const { key, hash, input } = prepared.data
      const response = await sendFromAccount({ userId: actor, accountId: input.sourceAccountId, key, hash },
        () => input, { fileComposeId: action.id }, action.action === 'check')
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    return json(await rpc(client, 'change_file_compose', { p_id: action.id, p_action: action.action }))
  })
}
