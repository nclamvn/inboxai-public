import 'server-only'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { SendError } from '@/lib/mail-send/contracts'
import { composeFile, composeFileLimit } from './contracts'

export function composeService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function composeRpcError(code: string) {
  if (code === 'PT404') return new SendError(404, 'Không tìm thấy bản nháp hoặc tệp đính kèm.')
  if (code === 'PT409') return new SendError(409, 'Bản nháp hoặc tệp đã thay đổi. Hãy xem lại trước khi gửi.')
  if (code === 'PT413') return new SendError(413, 'Tổng dung lượng tệp tối đa 8 MB.')
  if (['22023', '23514', '22P05'].includes(code)) return new SendError(400, 'Dữ liệu tệp hoặc bản nháp không hợp lệ.')
  return new SendError(503, 'Chưa thể truy cập bản nháp hoặc tệp đính kèm.')
}

const storedFile = composeFile.extend({ data: z.string() })
export async function loadComposeFiles(actor: string, ids: string[]) {
  const result = await composeService().rpc('read_compose_files', { p_actor: actor, p_ids: ids })
    .abortSignal(AbortSignal.timeout(12_000))
  if (result.error) throw composeRpcError(result.error.code)
  const files = z.array(storedFile).parse(result.data)
  if (files.length !== ids.length) throw composeRpcError('PT409')
  return files.map(({ data, ...metadata }, index) => {
    const content = Buffer.from(data, 'base64')
    if (metadata.id !== ids[index] || content.length !== metadata.size || content.length > composeFileLimit ||
        createHash('sha256').update(content).digest('hex') !== metadata.sha256) throw composeRpcError('PT409')
    return { metadata, content }
  })
}
