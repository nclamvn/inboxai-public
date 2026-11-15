import type { NextRequest } from 'next/server'
import { commitmentId, requestKey } from '@/lib/commitments/contracts'
import { purchaseCsvService, readPurchaseCsv } from '@/lib/commitments/purchase-csv-server'
import { handoffCommand, handoffReceipt } from '@/lib/commitments/purchase-handoff'
import { CommitmentRequestError, ledgerJson, ledgerRpc, readCommitmentJson, withLedgerSession } from '@/lib/commitments/http'

export const maxDuration = 60

type ScopedFile = { emailId: string; attachmentId: string; digest: string; filename: string }

async function resolveFiles(actor: string, handoffId: string) {
  return ledgerRpc(purchaseCsvService(), 'resolve_purchase_handoff_files', {
    p_actor: actor, p_handoff: handoffId,
  }) as Promise<{ ownerId: string; files: ScopedFile[] }>
}

async function loadVerifiedFile(owner: string, file: ScopedFile) {
  const source = await readPurchaseCsv(purchaseCsvService(), owner, file.emailId, file.attachmentId)
  if (source.digest !== file.digest) throw new CommitmentRequestError(409, 'Tệp nguồn đã đổi. Cần bàn giao lại hồ sơ.')
  return source.content
}

async function resolveDueFile(actor: string, handoffId: string, attachmentId: string) {
  return ledgerRpc(purchaseCsvService(), 'resolve_purchase_due_file', {
    p_actor: actor, p_handoff: handoffId, p_file: attachmentId,
  }) as Promise<ScopedFile & { ownerId: string }>
}

function fileResponse(file: ScopedFile, bytes: Uint8Array) {
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + encodeURIComponent(file.filename) + '"',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
  } })
}

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const { searchParams: params } = request.nextUrl
    if (params.size === 0) return ledgerJson(await ledgerRpc(client, 'list_purchase_handoffs', {}))

    if (params.has('commitment')) {
      const commitment = commitmentId.safeParse(params.get('commitment'))
      const invoice = commitmentId.safeParse(params.get('invoice'))
      if (!commitment.success || !invoice.success) return ledgerJson({ error: 'Mã hồ sơ không hợp lệ.' }, 400)
      return ledgerJson(await ledgerRpc(client, 'read_purchase_handoff_owner', {
        p_id: commitment.data, p_invoice: invoice.data,
      }))
    }

    const id = commitmentId.safeParse(params.get('id'))
    if (!id.success) return ledgerJson({ error: 'Mã bàn giao không hợp lệ.' }, 400)
    if (!params.has('file')) return ledgerJson(await ledgerRpc(client, 'read_purchase_handoff', { p_handoff: id.data }))

    const attachment = commitmentId.safeParse(params.get('file'))
    if (!attachment.success) return ledgerJson({ error: 'Mã tệp không hợp lệ.' }, 400)
    if (params.get('evidence') === 'payment-due') {
      const file = await resolveDueFile(actor, id.data, attachment.data)
      const bytes = await loadVerifiedFile(file.ownerId, file)
      const current = await resolveDueFile(actor, id.data, attachment.data)
      if (current.digest !== file.digest || current.emailId !== file.emailId || current.ownerId !== file.ownerId) {
        return ledgerJson({ error: 'Chứng từ đã đổi.' }, 409)
      }
      return fileResponse(file, bytes)
    }
    const before = await resolveFiles(actor, id.data)
    const file = before.files.find(entry => entry.attachmentId === attachment.data)
    if (!file) return ledgerJson({ error: 'Tệp không thuộc hồ sơ được giao.' }, 404)
    const bytes = await loadVerifiedFile(before.ownerId, file)
    const after = await resolveFiles(actor, id.data)
    if (!after.files.some(entry => entry.attachmentId === file.attachmentId && entry.digest === file.digest)) {
      return ledgerJson({ error: 'Chứng từ đã đổi.' }, 409)
    }
    return fileResponse(file, bytes)
  })
}

export async function POST(request: NextRequest) {
  return withLedgerSession(request, async (client, actor) => {
    const key = requestKey.safeParse(request.headers.get('Idempotency-Key'))
    const command = handoffCommand.safeParse(await readCommitmentJson(request))
    if (!key.success || !command.success) return ledgerJson({ error: 'Yêu cầu bàn giao không hợp lệ.' }, 400)
    const args = { p_key: key.data, p_command: command.data }
    const existing = await ledgerRpc(client, 'read_purchase_handoff_receipt', args)
    if (existing.replayed) return ledgerJson(handoffReceipt.parse(existing))

    if (command.data.action === 'approve') {
      try {
        const { ownerId, files } = await resolveFiles(actor, command.data.handoffId)
        for (let offset = 0; offset < files.length; offset += 4) {
          await Promise.all(files.slice(offset, offset + 4).map(file => loadVerifiedFile(ownerId, file)))
        }
      } catch (error) {
        // Another delivery of the same request may have completed during verification.
        const replay = await ledgerRpc(client, 'read_purchase_handoff_receipt', args)
        if (replay.replayed) return ledgerJson(handoffReceipt.parse(replay))
        throw error
      }
    }
    return ledgerJson(handoffReceipt.parse(await ledgerRpc(purchaseCsvService(), 'confirm_purchase_handoff', {
      p_actor: actor, ...args,
    })))
  })
}
