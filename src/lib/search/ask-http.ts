import 'server-only'
import type { NextRequest } from 'next/server'
import { privateJson, readPrivateJson } from '@/lib/http/private-json'
import { askRequest } from './ask-query'

export { privateJson as askReply }

export async function readAskRequest(request: NextRequest) {
  const requestBody = await readPrivateJson(request)
  if (requestBody instanceof Response) return requestBody
  const input = askRequest.safeParse(requestBody.body)
  if (!input.success) return privateJson({ error: 'Nội dung hoặc bộ lọc tìm kiếm không hợp lệ.' }, 400)
  return input.data
}
