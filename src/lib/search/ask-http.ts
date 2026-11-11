import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { askRequest } from './ask-query'

export function askReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function readAskRequest(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json') {
    return askReply({ error: 'Nội dung phải là JSON.' }, 415)
  }
  let body: unknown
  const reader = request.body?.getReader()
  if (!reader) return askReply({ error: 'Thiếu nội dung tìm kiếm.' }, 400)
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let size = 0
    let raw = ''
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 8192) {
        await reader.cancel().catch(() => {})
        return askReply({ error: 'Nội dung tìm kiếm vượt quá giới hạn.' }, 413)
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
    body = JSON.parse(raw + decoder.decode())
  } catch {
    return askReply({ error: 'JSON không hợp lệ.' }, 400)
  } finally {
    reader.releaseLock()
  }
  const input = askRequest.safeParse(body)
  if (!input.success) return askReply({ error: 'Nội dung hoặc bộ lọc tìm kiếm không hợp lệ.' }, 400)
  return input.data
}
