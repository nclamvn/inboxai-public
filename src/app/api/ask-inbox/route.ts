import { NextResponse, type NextRequest } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { AskQueryError, askRequest, parseAskQuery } from '@/lib/search/ask-query'
import type { AskResults } from '@/lib/search/ask-contracts'
import { embedTexts } from '@/lib/search/ask-embeddings'

export const runtime = 'nodejs'

let inferenceBusy = false

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

type Pending = { id: string; fingerprint: string; subject: string; passages: string[] }

export async function POST(request: NextRequest) {
  const client = await createClientForRequest(request)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return reply({ error: 'Yêu cầu đăng nhập.' }, 401)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json') {
    return reply({ error: 'Nội dung phải là JSON.' }, 415)
  }
  let body: unknown
  const reader = request.body?.getReader()
  if (!reader) return reply({ error: 'Thiếu nội dung tìm kiếm.' }, 400)
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
        return reply({ error: 'Nội dung tìm kiếm vượt quá giới hạn.' }, 413)
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
    body = JSON.parse(raw + decoder.decode())
  } catch {
    return reply({ error: 'JSON không hợp lệ.' }, 400)
  } finally {
    reader.releaseLock()
  }
  const input = askRequest.safeParse(body)
  if (!input.success) return reply({ error: 'Nội dung hoặc bộ lọc tìm kiếm không hợp lệ.' }, 400)
  try {
    const { query, filters, keywords } = parseAskQuery(input.data)
    let semantic: AskResults['semantic'] = 'off'
    let vector: number[] | null = null

    if (query && input.data.mode === 'hybrid') {
      if (inferenceBusy) {
        semantic = 'busy'
      } else {
        inferenceBusy = true
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(18_000)])
        try {
          const pending = await client.rpc('ask_inbox_pending', { p_filters: filters }).abortSignal(signal)
          if (pending.error?.code === 'PT404') return reply({ error: 'Tài khoản email không khả dụng.' }, 404)
          if (pending.error || !Array.isArray(pending.data)) throw new Error('Search index read failed')
          const documents = pending.data as Pending[]
          const texts = documents.flatMap(doc => doc.passages.map(passage => 'passage: ' + doc.subject + '\n' + passage))
          const [embedding, ...passages] = await embedTexts(['query: ' + query, ...texts], signal)
          if (documents.length) {
            let offset = 0
            const entries = documents.map(doc => {
              const vectors = passages.slice(offset, offset + doc.passages.length)
              offset += doc.passages.length
              return { id: doc.id, fingerprint: doc.fingerprint, vectors }
            })
            const indexWriter = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
              auth: { persistSession: false, autoRefreshToken: false },
            })
            const { error } = await indexWriter.rpc('ask_inbox_store', {
              p_user_id: user.id, p_documents: entries,
            }).abortSignal(signal)
            if (error) throw new Error('Search index update failed')
          }
          vector = embedding
          semantic = 'active'
        } catch {
          semantic = 'unavailable'
        } finally {
          inferenceBusy = false
        }
      }
    }

    const { data, error } = await client.rpc('ask_inbox_search', {
      p_text: keywords, p_filters: filters, p_vector: vector, p_limit: 50,
    }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
    if (error?.code === 'PT404') return reply({ error: 'Tài khoản email không khả dụng.' }, 404)
    if (error || !data) return reply({ error: 'Chưa tìm được thư. Hãy thử lại.' }, 503)
    return reply({ ...data, semantic })
  } catch (error) {
    if (error instanceof AskQueryError) return reply({ error: error.message }, 400)
    return reply({ error: 'Chưa tìm được thư. Hãy thử lại.' }, 503)
  }
}
