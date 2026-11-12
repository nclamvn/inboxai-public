import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { ReminderPreview } from '@/lib/commitments/attention'
import { commitmentId } from '@/lib/commitments/contracts'
import { CommitmentRequestError, ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession, type LedgerSession } from '@/lib/commitments/http'
import { sendInput, SendError } from '@/lib/mail-send/contracts'
import { sendFromAccount } from '@/lib/mail-send/server'

export const maxDuration = 60

type Context = { params: Promise<{ commitmentId: string }> }

const command = z.strictObject({
  accountId: z.uuid().transform(id => id.toLowerCase()),
  version: z.number().int().min(1).max(2_147_483_647),
  proof: z.string().regex(/^[0-9a-f]{64}$/),
})

async function readPreview(client: LedgerSession, id: string): Promise<ReminderPreview> {
  try {
    return await ledgerRpc(client, 'read_commitment_reminder', { p_id: id })
  } catch (error) {
    if (error instanceof CommitmentRequestError && error.status === 409) {
      throw new CommitmentRequestError(409, 'Cam kết chưa đủ điều kiện gửi lời nhắc. Hãy kiểm tra người phụ trách, hạn và phản hồi mới.')
    }
    throw error
  }
}

function reminderKey(userId: string, id: string, version: number) {
  // Match private.commitment_reminder_key so the inbox and send store read the same receipt.
  const hex = createHash('sha256').update(`commitment-reminder:v1:${userId}:${id}:${version}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export async function GET(request: NextRequest, { params }: Context) {
  return withLedgerSession(request, async client => {
    const id = commitmentId.safeParse((await params).commitmentId)
    if (!id.success) return ledgerJson({ error: 'Cam kết không hợp lệ.' }, 400)
    return ledgerJson(await readPreview(client, id.data))
  })
}

export async function POST(request: NextRequest, { params }: Context) {
  return withLedgerSession(request, async (client, userId) => {
    const id = commitmentId.safeParse((await params).commitmentId)
    const parsed = command.safeParse(await readCommitmentJson(request))
    if (!id.success || !parsed.success) return ledgerJson({ error: 'Bản xem trước lời nhắc không hợp lệ.' }, 400)

    const { version, accountId, proof } = parsed.data
    const commitment = id.data.toLowerCase()
    try {
      const response = await sendFromAccount({
        userId, accountId, key: reminderKey(userId, commitment, version), hash: proof,
      }, async () => {
        const preview = await readPreview(client, commitment)
        if (preview.version !== version || preview.accountId !== accountId || preview.proof !== proof) {
          throw new CommitmentRequestError(409, 'Cam kết hoặc email nguồn đã thay đổi. Hãy mở bản xem trước mới.')
        }
        const input = sendInput.safeParse({
          sourceAccountId: accountId, to: preview.to, subject: preview.subject, text: preview.text, replyToEmailId: preview.source.emailId,
        })
        if (!input.success) throw new CommitmentRequestError(422, 'Địa chỉ hoặc nội dung lời nhắc không hợp lệ.')
        return input.data
      }, { commitmentId: commitment, version })
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    } catch (error) {
      if (error instanceof SendError) return ledgerJson({ error: error.message, code: error.code }, error.status)
      throw error
    }
  })
}
