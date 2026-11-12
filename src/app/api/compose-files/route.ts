import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { SendError } from '@/lib/mail-send/contracts'
import { composeFileLimit } from '@/lib/compose/contracts'
import { composeRpcError, composeService } from '@/lib/compose/server'
import { readMailAttachment } from '@/lib/compose/attachment-source'

export const maxDuration = 40
const selection = z.strictObject({ sourceId: z.uuid(), attachmentId: z.uuid() })

async function readBytes(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) throw new SendError(400, 'Chưa chọn tệp.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > limit) {
        await reader.cancel()
        throw composeRpcError('PT413')
      }
      chunks.push(next.value)
    }
    return Buffer.concat(chunks)
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401 })
  try {
    let file: { filename: string; contentType: string; content: Buffer }
    let sourceAttachmentId: string | undefined
    const encodedName = request.headers.get('X-File-Name')
    if (encodedName) {
      file = { filename: decodeURIComponent(encodedName), contentType: request.headers.get('Content-Type') || '',
        content: await readBytes(request, composeFileLimit) }
    } else {
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
        throw new SendError(400, 'Chưa chọn tệp.')
      }
      const parsed = selection.safeParse(JSON.parse((await readBytes(request, 1024)).toString('utf8')))
      if (!parsed.success) throw new SendError(400, 'Thông tin tệp nguồn không hợp lệ.')
      sourceAttachmentId = parsed.data.attachmentId
      file = await readMailAttachment(client, user.id, parsed.data.attachmentId, parsed.data.sourceId, composeFileLimit)
    }
    const filename = Array.from(file.filename.replace(/[\x00-\x1f\x7f/\\]/g, '_').trim()).slice(0, 255).join('')
    if (!filename || !file.content.length) throw new SendError(400, 'Tệp cần có tên và nội dung.')
    const mime = file.contentType.split(';')[0].trim().toLowerCase()
    const contentType = mime.length <= 120 && /^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(mime)
      ? mime : 'application/octet-stream'
    const result = await composeService().rpc('store_compose_file', { p_actor: user.id, p_filename: filename,
      p_content_type: contentType, p_source_attachment: sourceAttachmentId ?? null, p_data: file.content.toString('base64') }).abortSignal(AbortSignal.timeout(12_000))
    if (result.error) throw composeRpcError(result.error.code)
    return Response.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const failure = error instanceof SendError ? error
      : error instanceof URIError || error instanceof SyntaxError ? new SendError(400, 'Thông tin tệp không hợp lệ.')
      : new SendError(503, 'Chưa thể lưu tệp. Hãy thử lại.')
    return Response.json({ error: failure.message }, { status: failure.status })
  }
}
