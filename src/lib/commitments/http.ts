import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { commitmentReceipt } from './contracts'

export type LedgerSession = Awaited<ReturnType<typeof createClientForRequest>>

export class CommitmentRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export class PurchaseReviewChangedError extends CommitmentRequestError {
  constructor(message: string) { super(409, message) }
}

export function ledgerJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function withLedgerSession(request: NextRequest, handle: (client: LedgerSession, userId: string) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return ledgerJson({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await handle(client, user.id)
  } catch (error) {
    if (error instanceof CommitmentRequestError) return ledgerJson({ error: error.message }, error.status)
    return ledgerJson({ error: 'Chưa thể truy cập sổ cam kết. Hãy thử lại.' }, 503)
  }
}

export async function readCommitmentJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new CommitmentRequestError(415, 'Nội dung phải là JSON.')
  }
  const maxBytes = 16 * 1024
  const reader = request.body?.getReader()
  if (!reader) throw new CommitmentRequestError(400, 'Thiếu nội dung yêu cầu.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new CommitmentRequestError(413, 'Nội dung vượt quá giới hạn.')
      }
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch (error) {
    if (error instanceof CommitmentRequestError) throw error
    throw new CommitmentRequestError(400, 'JSON không hợp lệ.')
  } finally {
    reader.releaseLock()
  }
}

export async function ledgerRpc(client: LedgerSession, name: 'save_commitment' | 'list_commitments' | 'list_commitment_board' | 'read_commitment'
  | 'scan_commitment_mail' | 'read_commitment_lifecycle_targets' | 'confirm_commitment_detection'
  | 'read_purchase_handoff' | 'list_purchase_handoffs' | 'read_purchase_handoff_owner' | 'read_purchase_handoff_receipt'
  | 'resolve_purchase_handoff_files' | 'confirm_purchase_handoff' | 'read_purchase_approval_scan'
  | 'read_purchase_settlement' | 'preview_purchase_settlement' | 'read_purchase_settlement_receipt' | 'confirm_purchase_settlement'
  | 'list_purchase_dues' | 'resolve_purchase_due_file'
  | 'preview_purchase_batch' | 'list_purchase_batches' | 'read_purchase_batch' | 'read_purchase_batch_receipt'
  | 'confirm_purchase_batch' | 'resolve_purchase_batch_files'
  | 'list_purchase_focus'
  | 'list_purchase_supplement_sources' | 'inspect_purchase_supplement' | 'confirm_purchase_supplement'
  | 'read_purchase_payment' | 'list_purchase_payment_attention' | 'read_purchase_payment_receipt' | 'preview_purchase_payment' | 'confirm_purchase_payment'
  | 'read_purchase_csv_proof' | 'check_purchase_csv_source' | 'preview_purchase_csv' | 'read_purchase_csv_receipt' | 'confirm_purchase_csv'
  | 'preview_purchase_orders' | 'confirm_purchase_order' | 'confirm_commitment_receiving' | 'confirm_commitment_warehouse_correction' | 'read_warehouse_correction_evidence' | 'list_commitment_attention' | 'read_commitment_reminder'
  | 'read_commitment_catchup' | 'read_commitment_catchup_status' | 'dismiss_commitment_catchup', args: Record<string, unknown>, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000)
  const { data, error } = await client.rpc(name, args).abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout)
  if (!error && data != null) return data
  switch (error?.code) {
    case '42501':
      throw new CommitmentRequestError(401, 'Yêu cầu đăng nhập.')
    case 'PT413':
      throw new CommitmentRequestError(413, 'Tệp CSV vượt giới hạn dung lượng.')
    case 'PT431':
      throw new CommitmentRequestError(422, error.message)
    case 'PT432':
      throw new CommitmentRequestError(409, error.message)
    case 'PT433':
      throw new PurchaseReviewChangedError(error.message)
    case 'PT403':
      throw new CommitmentRequestError(403, error.message)
    case 'PT404':
      throw new CommitmentRequestError(404, 'Không tìm thấy cam kết, trang hoặc email nguồn.')
    case 'PT409':
      throw new CommitmentRequestError(409, 'Mã cam kết, mã yêu cầu hoặc phiên bản đã thay đổi. Hãy kiểm tra sổ cam kết.')
    case 'PT422':
      throw new CommitmentRequestError(422, 'Bằng chứng không khớp, chưa đủ hoặc bản ghi không có thay đổi.')
    case '22023':
    case '22007':
    case '22008':
    case '22009':
    case '22P02':
    case '22P05':
      throw new CommitmentRequestError(400, 'Thông tin cam kết không hợp lệ.')
    default:
      throw new CommitmentRequestError(503, 'Chưa xác nhận được kết quả. Hãy thử lại cùng mã yêu cầu.')
  }
}

export async function saveCommitment(client: LedgerSession, args: Record<string, unknown>, creating = false) {
  const data = await ledgerRpc(client, 'save_commitment', args)
  const receipt = commitmentReceipt.parse(data)
  return ledgerJson(receipt, creating && !receipt.replayed ? 201 : 200)
}
