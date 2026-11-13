import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendInput, sendKey, SendError, SendOperationMissing } from '@/lib/mail-send/contracts'
import { sendFromAccount } from '@/lib/mail-send/server'

export const maxDuration = 60

async function readJson(request: NextRequest) {
  const reader = request.body?.getReader()
  if (!reader) throw new SendError(400, 'Thiếu nội dung gửi.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2 * 1024 * 1024) {
      await reader.cancel()
      throw new SendError(413, 'Nội dung gửi vượt giới hạn.')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new SendError(400, 'Nội dung gửi không hợp lệ.')
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const key = sendKey.safeParse(request.headers.get('Idempotency-Key'))
    if (!key.success) throw new SendError(400, 'Thiếu mã gửi hợp lệ. Hãy tải lại trang soạn thư.')
    const parsed = sendInput.safeParse(await readJson(request))
    if (!parsed.success) throw new SendError(400, 'Vui lòng kiểm tra tài khoản, người nhận và nội dung thư.')
    const input = parsed.data
    if (input.attachmentIds?.length) throw new SendError(400, 'Hãy duyệt bản nháp trước khi gửi tệp.')
    const scope = {
      userId: user.id,
      accountId: input.sourceAccountId,
      key: key.data,
      hash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    }
    return await sendFromAccount(scope, () => input, undefined, request.nextUrl.searchParams.get('check') === '1')
  } catch (error) {
    return NextResponse.json({
      error: error instanceof SendError ? error.message : 'Chưa thể xác nhận yêu cầu. Hãy kiểm tra lại với cùng nội dung.',
      ...(error instanceof SendOperationMissing && { code: 'send_operation_missing' }),
      ...(error instanceof SendError && error.code && { code: error.code }),
    }, { status: error instanceof SendError ? error.status : 503 })
  }
}
