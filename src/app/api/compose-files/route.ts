import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'
import { SendError } from '@/lib/mail-send/contracts'
import { composeFileLimit } from '@/lib/compose/contracts'
import { composeRpcError, composeService, loadComposeFiles } from '@/lib/compose/server'
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
    const deviceId = z.uuidv4().nullable().safeParse(request.headers.get('X-Draft-File-Id'))
    if (!deviceId.success) throw composeRpcError('22023')
    if (deviceId.data && request.headers.get('X-Draft-Owner') !== user.id) {
      throw new SendError(403, 'Phiên đăng nhập đã thay đổi.')
    }
    const encodedName = request.headers.get('X-File-Name')
    if (deviceId.data && !encodedName) throw composeRpcError('22023')
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
    const input = { p_actor: user.id, p_filename: filename, p_content_type: contentType, p_data: file.content.toString('base64') }
    const service = composeService()
    const result = await (deviceId.data
      ? service.rpc('store_device_compose_file', { ...input, p_id: deviceId.data })
      : service.rpc('store_compose_file', { ...input, p_source_attachment: sourceAttachmentId ?? null }))
      .abortSignal(AbortSignal.timeout(12_000))
    if (result.error) throw composeRpcError(result.error.code)
    return Response.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const failure = error instanceof SendError ? error
      : error instanceof URIError || error instanceof SyntaxError ? new SendError(400, 'Thông tin tệp không hợp lệ.')
      : new SendError(503, 'Chưa thể lưu tệp. Hãy thử lại.')
    return Response.json({ error: failure.message }, { status: failure.status })
  }
}

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401, headers })
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get('id'))
  if (!id.success) return Response.json({ error: 'Mã tệp không hợp lệ.' }, { status: 400, headers })
  try {
    const [file] = await loadComposeFiles(user.id, [id.data])
    return new Response(new Uint8Array(file.content), { headers: { ...headers, 'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment', 'Content-Length': String(file.metadata.size) } })
  } catch (reason) {
    const failure = reason instanceof SendError ? reason : composeRpcError('unavailable')
    return Response.json({ error: failure.message }, { status: failure.status, headers })
  }
}
