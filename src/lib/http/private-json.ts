import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function readPrivateJson(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json') {
    return privateJson({ error: 'Nội dung phải là JSON.' }, 415)
  }
  const reader = request.body?.getReader()
  if (!reader) return privateJson({ error: 'Thiếu nội dung yêu cầu.' }, 400)
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
        return privateJson({ error: 'Nội dung vượt quá giới hạn.' }, 413)
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
    return { body: JSON.parse(raw + decoder.decode()) as unknown }
  } catch {
    return privateJson({ error: 'JSON không hợp lệ.' }, 400)
  } finally {
    reader.releaseLock()
  }
}
