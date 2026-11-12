import 'server-only'
import { z } from 'zod'
import { composeService, composeRpcError } from '@/lib/compose/server'
import { SendError, sendInput, sendKey, type SendInput } from '@/lib/mail-send/contracts'
import { sendFromAccount } from '@/lib/mail-send/server'
import { canSendGmail, canReadGmail } from '@/lib/gmail/scopes'
import { getGoogleCredential } from '@/lib/gmail/credentials'

const scopeSchema = z.object({
  accountId: z.uuid(), key: sendKey, hash: z.string().regex(/^[a-f0-9]{64}$/),
})
const claimSchema = scopeSchema.extend({
  id: z.uuid(), actor: z.uuid(), lease: z.uuid(), input: sendInput,
})

export function scheduledError(code: string) {
  if (code === 'PT403') return new SendError(403, 'Lên lịch gửi cần tài khoản Gmail có quyền đọc và gửi.')
  if (code === 'PT404') return new SendError(404, 'Không tìm thấy lịch gửi.')
  if (code === 'PT409') return new SendError(409, 'Lịch gửi hoặc bản nháp đã thay đổi. Hãy tải lại để kiểm tra.')
  if (code === 'PT422') return new SendError(422, 'Chọn thời điểm gửi trong tương lai.')
  return composeRpcError(code)
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const result = await composeService().rpc(name, args).abortSignal(AbortSignal.timeout(8_000))
  if (result.error) throw scheduledError(result.error.code)
  return result.data
}

export async function approveSchedule(actor: string, kind: 'compose' | 'reply',
  action: { id: string; revision: number; at: string; requestId: string }, input: SendInput, hash: string) {
  const credential = await getGoogleCredential(actor, input.sourceAccountId, AbortSignal.timeout(10_000))
  if (!credential || !canSendGmail(credential) || (credential.scope !== undefined && !canReadGmail(credential.scope))) {
    throw scheduledError('PT403')
  }
  const id = await rpc('create_scheduled_mail', { p_actor: actor, p_kind: kind, p_id: action.id,
    p_revision: action.revision, p_at: action.at, p_schedule: action.requestId, p_input: input, p_hash: hash })
  return { id: z.uuid().parse(id) }
}

export async function runScheduledMail() {
  const claims = z.array(claimSchema).parse(await rpc('claim_scheduled_mail'))
  const results = await Promise.allSettled(claims.map(async ({ actor, id, lease, input, ...scope }) => {
    let permanent = false
    try {
      await sendFromAccount({ ...scope, userId: actor }, () => input, { scheduledId: id, lease })
    } catch (error) {
      permanent = error instanceof SendError && [400, 403, 404, 409, 413].includes(error.status)
    }
    await rpc('finish_scheduled_attempt', { p_actor: actor, p_id: id, p_lease: lease, p_permanent: permanent })
  }))
  return { claimed: claims.length, unrecorded: results.filter(result => result.status === 'rejected').length }
}

export async function checkScheduledMail(actor: string, id: string) {
  const parsed = scopeSchema.safeParse(await rpc('read_scheduled_receipt_scope', { p_actor: actor, p_id: id }))
  if (!parsed.success) throw scheduledError('PT404')
  return sendFromAccount({ ...parsed.data, userId: actor }, () => { throw scheduledError('PT409') }, undefined, true)
}
