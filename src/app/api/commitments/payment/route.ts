import type { NextRequest } from 'next/server'
import { commitmentId, requestKey } from '@/lib/commitments/contracts'
import { purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { purchaseCsvProof, purchaseCsvService, readPurchaseCsv } from '@/lib/commitments/purchase-csv-server'
import { paymentCommand, paymentReceipt, type PaymentSnapshot } from '@/lib/commitments/purchase-payment'
import { supplementSelection } from '@/lib/commitments/purchase-supplement'
import { inspectSupplement } from '@/lib/commitments/purchase-supplement-server'
import { CommitmentRequestError, ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession, type LedgerSession } from '@/lib/commitments/http'

export const maxDuration = 60

async function verifyFiles(client: LedgerSession, actor: string, snapshot: PaymentSnapshot) {
  const attachments = new Map<string, () => Promise<{ emailId: string; attachmentId: string; digest: string }>>()
  for (const document of [snapshot.price, snapshot.invoice, ...(snapshot.allocations ?? [])]) {
    if (document) attachments.set(document.evidence.attachmentId, async () => document.evidence)
  }
  for (const source of snapshot.sources ?? []) {
    if (source.attachment && !attachments.has(source.attachment.id)) {
      const { id, proofId } = source.attachment
      attachments.set(id, () => purchaseCsvProof(client, proofId))
    }
  }
  // Limit the number of concurrent Gmail downloads.
  const remaining = [...attachments.values()]
  while (remaining.length) {
    await Promise.all(remaining.splice(0, 4).map(async resolve => {
      const source = await resolve()
      const file = await readPurchaseCsv(client, actor, source.emailId, source.attachmentId)
      if (file.digest !== source.digest) {
        throw new CommitmentRequestError(409, 'Nội dung chứng từ đã thay đổi. Hãy kiểm tra lại nguồn.')
      }
    }))
  }
}

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const params = request.nextUrl.searchParams
    if (params.has('id')) {
      const id = commitmentId.safeParse(params.get('id'))
      if (!id.success) return ledgerJson({ error: 'Mã cam kết không hợp lệ.' }, 400)
      const invoice = params.has('invoice') ? commitmentId.safeParse(params.get('invoice')) : null
      if (invoice && !invoice.success) return ledgerJson({ error: 'Mã hóa đơn không hợp lệ.' }, 400)
      const snapshot: PaymentSnapshot = await ledgerRpc(client, 'read_purchase_payment', {
        p_id: id.data, p_invoice: invoice?.data ?? null,
      })
      const handoff = snapshot.invoice && await ledgerRpc(client, 'read_purchase_handoff_owner', {
        p_id: id.data, p_invoice: snapshot.invoice.id,
      })
      return ledgerJson({ ...snapshot, handoffManaged: Boolean(handoff?.managed) })
    }
    const scope = purchaseCsvSelection.safeParse({ emailId: params.get('email'), attachmentId: params.get('file') })
    if (!scope.success) return ledgerJson({ error: 'Chọn tệp CSV trong email nguồn.' }, 400)
    const { emailId, attachmentId } = scope.data
    const binding = await ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
    const file = await readPurchaseCsv(client, actor, emailId, attachmentId)
    if (params.has('supplement') || params.has('digest')) {
      const selected = supplementSelection.safeParse({ supplementId: params.get('supplement'), expectedDigest: params.get('digest') })
      if (!selected.success) return ledgerJson({ error: 'Liên kết chứng từ không hợp lệ.' }, 400)
      const result = await inspectSupplement(purchaseCsvService(), actor, selected.data.supplementId, emailId, attachmentId, binding, file.source)
      if (result.status !== 'match' || file.digest !== selected.data.expectedDigest || result.preview.command.digest !== file.digest) {
        return ledgerJson({ error: 'Hồ sơ hoặc chứng từ đã đổi. Hãy xem lại từ Inbox.' }, 409)
      }
      return ledgerJson(result.preview)
    }
    return ledgerJson(await ledgerRpc(purchaseCsvService(), 'preview_purchase_payment', {
      p_actor: actor, p_email: emailId, p_attachment: attachmentId, p_binding: binding, p_text: file.source,
    }))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const parsed = paymentCommand.safeParse(await readCommitmentJson(request))
    if (!key.success || !parsed.success) return ledgerJson({ error: 'Yêu cầu đối soát không hợp lệ.' }, 400)
    const command = parsed.data
    const context = request.nextUrl.searchParams.get('supplement')
    const supplement = context === null ? null : commitmentId.safeParse(context)
    if (supplement && (!supplement.success || command.action !== 'register')) {
      return ledgerJson({ error: 'Hồ sơ bổ sung không hợp lệ.' }, 400)
    }
    const args = { p_key: key.data, p_command: command }
    const receipt = await ledgerRpc(client, 'read_purchase_payment_receipt', args)
    if (receipt.replayed) return ledgerJson(paymentReceipt.parse(receipt))

    let csv: string | null = null
    if (command.action === 'register') {
      const { emailId, attachmentId, digest } = command
      const binding = await ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
      if (binding !== command.binding) return ledgerJson({ error: 'Nguồn đã thay đổi. Hãy mở lại chứng từ.' }, 409)
      const file = await readPurchaseCsv(client, actor, emailId, attachmentId)
      if (file.digest !== digest) return ledgerJson({ error: 'Tệp đã thay đổi. Hãy mở lại chứng từ.' }, 409)
      csv = file.source
    } else {
      const snapshot: PaymentSnapshot = await ledgerRpc(client, 'read_purchase_payment', { p_id: command.id, p_invoice: command.invoiceId })
      if (snapshot.status !== 'ready' || snapshot.command?.proof !== command.proof) {
        const prior = await ledgerRpc(client, 'read_purchase_payment_receipt', args)
        if (prior.replayed) return ledgerJson(paymentReceipt.parse(prior))
        return ledgerJson({ error: 'Bộ chứng từ chưa khớp hoặc đã thay đổi. Hãy xem lại trước khi duyệt.' }, 409)
      }
      const handoff = await ledgerRpc(client, 'read_purchase_handoff_owner', { p_id: command.id, p_invoice: command.invoiceId })
      if (handoff.managed) return ledgerJson({ error: 'PO đã tách quyền duyệt. Kế toán được giao mới có thể duyệt.' }, 403)
      await verifyFiles(client, actor, snapshot)
    }
    const rpcArgs = { p_actor: actor, ...args, p_text: csv }
    const service = purchaseCsvService()
    const result = supplement?.success
      ? await ledgerRpc(service, 'confirm_purchase_supplement', { ...rpcArgs, p_case: supplement.data })
      : await ledgerRpc(service, 'confirm_purchase_payment', rpcArgs)
    return ledgerJson(paymentReceipt.parse(result))
  })
}
