import type { NextRequest } from 'next/server'
import { commitmentId, requestKey } from '@/lib/commitments/contracts'
import { CommitmentRequestError, ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'
import { batchCommand, batchDetail, batchList, batchPreview, batchReceipt, batchTargets } from '@/lib/commitments/purchase-batch'
import { purchaseCsvService, readPurchaseCsv } from '@/lib/commitments/purchase-csv-server'

export const maxDuration = 60

type ScopedFile = { ownerId: string; emailId: string; attachmentId: string; digest: string; filename: string }

async function resolveFiles(actor: string, id: string, handoffId?: string): Promise<ScopedFile[]> {
  return ledgerRpc(purchaseCsvService(), 'resolve_purchase_batch_files', {
    p_actor: actor, p_id: id, p_handoff: handoffId ?? null,
  })
}

async function verifyFile(file: ScopedFile) {
  const source = await readPurchaseCsv(purchaseCsvService(), file.ownerId, file.emailId, file.attachmentId)
  if (source.digest !== file.digest) throw new CommitmentRequestError(409, 'Tệp hóa đơn đã đổi. Hãy lập lại đề nghị.')
  return source.content
}

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const params = request.nextUrl.searchParams
    if (!params.size) return ledgerJson(batchList.parse(await ledgerRpc(client, 'list_purchase_batches', {})))
    if (params.has('selected')) {
      const targets = batchTargets.safeParse(params.getAll('selected'))
      if (!targets.success) return ledgerJson({ error: 'Chọn từ 1 đến 8 hóa đơn khác nhau.' }, 400)
      const result = await ledgerRpc(client, 'preview_purchase_batch', { p_targets: targets.data })
      return ledgerJson(batchPreview.parse(result))
    }
    const id = commitmentId.safeParse(params.get('id'))
    if (!id.success) return ledgerJson({ error: 'Mã đợt không hợp lệ.' }, 400)
    if (!params.has('file')) return ledgerJson(batchDetail.parse(await ledgerRpc(client, 'read_purchase_batch', { p_id: id.data })))

    const handoff = commitmentId.safeParse(params.get('file'))
    if (!handoff.success) return ledgerJson({ error: 'Chọn hóa đơn trong đợt.' }, 400)
    const [file] = await resolveFiles(actor, id.data, handoff.data)
    const bytes = await verifyFile(file)
    const [current] = await resolveFiles(actor, id.data, handoff.data)
    if (current.ownerId !== file.ownerId || current.emailId !== file.emailId
      || current.attachmentId !== file.attachmentId || current.digest !== file.digest) {
      return ledgerJson({ error: 'Chứng từ đã thay đổi.' }, 409)
    }
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(file.filename) + '"',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    } })
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const command = batchCommand.safeParse(await readCommitmentJson(request))
    if (!key.success || !command.success) return ledgerJson({ error: 'Yêu cầu đợt thanh toán không hợp lệ.' }, 400)
    const args = { p_key: key.data, p_command: command.data }
    const existing = await ledgerRpc(client, 'read_purchase_batch_receipt', args)
    if (existing.replayed) return ledgerJson(batchReceipt.parse(existing))

    if (command.data.action === 'approve') {
      try {
        const files = await resolveFiles(actor, command.data.id)
        for (let offset = 0; offset < files.length; offset += 4) {
          await Promise.all(files.slice(offset, offset + 4).map(verifyFile))
        }
      } catch (error) {
        const replay = await ledgerRpc(client, 'read_purchase_batch_receipt', args)
        if (replay.replayed) return ledgerJson(batchReceipt.parse(replay))
        throw error
      }
    }
    const result = await ledgerRpc(purchaseCsvService(), 'confirm_purchase_batch', { p_actor: actor, ...args })
    return ledgerJson(batchReceipt.parse(result))
  })
}
