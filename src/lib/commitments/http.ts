import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { commitmentReceipt } from './contracts'

type Session = Awaited<ReturnType<typeof createClientForRequest>>

export class CommitmentRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function ledgerJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function withLedgerSession(request: NextRequest, handle: (client: Session) => Promise<Response>) {
  try {
    const client = await createClientForRequest(request)
    const { data: { user } } = await client.auth.getUser()
    if (!user) return ledgerJson({ error: 'Yêu cầu đăng nhập.' }, 401)
    return await handle(client)
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

export async function ledgerRpc(client: Session, name: 'save_commitment' | 'list_commitments' | 'read_commitment', args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10_000))
  if (!error && data != null) return data
  switch (error?.code) {
    case '42501':
      throw new CommitmentRequestError(401, 'Yêu cầu đăng nhập.')
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

export async function saveCommitment(client: Session, args: Record<string, unknown>, creating = false) {
  const data = await ledgerRpc(client, 'save_commitment', args)
  const receipt = commitmentReceipt.parse(data)
  return ledgerJson(receipt, creating && !receipt.replayed ? 201 : 200)
}
