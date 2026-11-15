import type { NextRequest } from 'next/server'
import { commitmentId, requestKey } from '@/lib/commitments/contracts'
import { CommitmentRequestError, ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession, type LedgerSession } from '@/lib/commitments/http'
import { purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { purchaseCsvService, readPurchaseCsv } from '@/lib/commitments/purchase-csv-server'
import { settlementCommand, settlementReceipt } from '@/lib/commitments/purchase-settlement'

export const maxDuration = 60

function sourceBinding(client: LedgerSession, emailId: string, attachmentId: string) {
  return ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
}

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const params = request.nextUrl.searchParams
    if (params.has('handoffId') || params.has('orderId')) {
      const handoff = commitmentId.safeParse(params.get('handoffId'))
      const order = commitmentId.safeParse(params.get('orderId'))
      const invoice = commitmentId.safeParse(params.get('invoiceId'))
      if (!handoff.success && (!order.success || !invoice.success)) return ledgerJson({ error: 'Chọn hồ sơ cần đối soát.' }, 400)
      const summary = await ledgerRpc(client, 'read_purchase_settlement', {
        p_handoff: handoff.data ?? null, p_order: order.data ?? null, p_invoice: invoice.data ?? null,
      })
      return ledgerJson(summary)
    }

    const selection = purchaseCsvSelection.safeParse({ emailId: params.get('email'), attachmentId: params.get('file') })
    if (!selection.success) return ledgerJson({ error: 'Chọn tệp CSV trong email nguồn.' }, 400)
    const { emailId, attachmentId } = selection.data
    const binding = await sourceBinding(client, emailId, attachmentId)
    const file = await readPurchaseCsv(client, actor, emailId, attachmentId)
    const preview = await ledgerRpc(purchaseCsvService(), 'preview_purchase_settlement', {
      p_actor: actor, p_email: emailId, p_file: attachmentId, p_text: file.source,
    })
    if (preview.command.binding !== binding || preview.command.digest !== file.digest) {
      return ledgerJson({ error: 'Chứng từ đã thay đổi. Hãy mở lại từ email nguồn.' }, 409)
    }
    return ledgerJson(preview)
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const parsed = settlementCommand.safeParse(await readCommitmentJson(request))
    if (!key.success || !parsed.success) return ledgerJson({ error: 'Yêu cầu ghi thanh toán không hợp lệ.' }, 400)
    const command = parsed.data
    const args = { p_key: key.data, p_command: command }
    const receipt = await ledgerRpc(client, 'read_purchase_settlement_receipt', args)
    if (receipt.replayed) return ledgerJson(settlementReceipt.parse(receipt))

    try {
      if (await sourceBinding(client, command.emailId, command.attachmentId) !== command.binding) {
        throw new CommitmentRequestError(409, 'Email hoặc tệp nguồn đã đổi. Hãy xem lại chứng từ.')
      }
      const file = await readPurchaseCsv(client, actor, command.emailId, command.attachmentId)
      if (file.digest !== command.digest) throw new CommitmentRequestError(409, 'Tệp nguồn đã đổi. Hãy xem lại chứng từ.')
      const saved = await ledgerRpc(purchaseCsvService(), 'confirm_purchase_settlement', {
        p_actor: actor, ...args, p_text: file.source,
      })
      return ledgerJson(settlementReceipt.parse(saved))
    } catch (error) {
      const replay = await ledgerRpc(client, 'read_purchase_settlement_receipt', args)
      if (replay.replayed) return ledgerJson(settlementReceipt.parse(replay))
      throw error
    }
  })
}
