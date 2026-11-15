import type { NextRequest } from 'next/server'
import { commitmentReceipt, requestKey } from '@/lib/commitments/contracts'
import { purchaseCsvApproval, purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { purchaseCsvProof, purchaseCsvService, readPurchaseCsv } from '@/lib/commitments/purchase-csv-server'
import { ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

export const maxDuration = 45

function downloadCsv(content: Buffer, filename: string) {
  return new Response(new Uint8Array(content), { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
  } })
}

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const proof = request.nextUrl.searchParams.get('proof')
    if (proof !== null) {
      const id = purchaseCsvSelection.shape.attachmentId.safeParse(proof)
      if (!id.success) return ledgerJson({ error: 'Mã nguồn CSV không hợp lệ.' }, 400)
      const source = await purchaseCsvProof(client, id.data)
      const file = await readPurchaseCsv(client, actor, source.emailId, source.attachmentId)
      if (file.digest !== source.digest) return ledgerJson({ error: 'Nội dung tệp đã thay đổi.' }, 409)
      // Check the mailbox and attachment metadata after the provider request as well.
      await purchaseCsvProof(client, id.data)
      return downloadCsv(file.content, source.filename)
    }
    const scope = purchaseCsvSelection.safeParse({
      emailId: request.nextUrl.searchParams.get('email'), attachmentId: request.nextUrl.searchParams.get('file'),
    })
    if (!scope.success) return ledgerJson({ error: 'Chọn email và tệp CSV nguồn.' }, 400)
    const { emailId, attachmentId } = scope.data
    const binding = await ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
    const file = await readPurchaseCsv(client, actor, emailId, attachmentId)
    const requestedDigest = request.nextUrl.searchParams.get('digest')
    if (requestedDigest !== null) {
      const currentBinding = await ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
      if (file.digest !== requestedDigest || currentBinding !== binding) {
        return ledgerJson({ error: 'Tệp đã thay đổi. Hãy xem lại phiếu.' }, 409)
      }
      return downloadCsv(file.content, file.filename)
    }
    return ledgerJson(await ledgerRpc(purchaseCsvService(), 'preview_purchase_csv', {
      p_actor: actor, p_email: emailId, p_attachment: attachmentId, p_binding: binding, p_text: file.source,
    }))
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const approval = purchaseCsvApproval.safeParse(await readCommitmentJson(request))
    if (!key.success || !approval.success) return ledgerJson({ error: 'Thông tin duyệt phiếu CSV không hợp lệ.' }, 400)
    const { emailId, attachmentId, digest } = approval.data
    const args = { p_key: key.data, p_command: approval.data }
    const existing = await ledgerRpc(client, 'read_purchase_csv_receipt', args)
    if (existing.replayed) return ledgerJson(commitmentReceipt.parse(existing))
    const binding = await ledgerRpc(client, 'check_purchase_csv_source', { p_email: emailId, p_attachment: attachmentId })
    if (binding !== approval.data.binding) return ledgerJson({ error: 'Nguồn đã thay đổi. Hãy xem lại phiếu.' }, 409)
    const file = await readPurchaseCsv(client, actor, emailId, attachmentId)
    if (file.digest !== digest) return ledgerJson({ error: 'Tệp đã thay đổi. Hãy xem lại phiếu.' }, 409)
    return ledgerJson(commitmentReceipt.parse(await ledgerRpc(purchaseCsvService(), 'confirm_purchase_csv', {
      p_actor: actor, ...args, p_text: file.source,
    })))
  })
}
