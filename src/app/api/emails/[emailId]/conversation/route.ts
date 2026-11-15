import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientForRequest } from '@/lib/supabase/server'

const id = z.uuid()
const cursor = z.object({ at: z.iso.datetime({ offset: true }), id })
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params
  const search = request.nextUrl.searchParams
  const at = search.get('beforeAt')
  const beforeId = search.get('beforeId')
  const before = at === null && beforeId === null ? null : cursor.safeParse({ at, id: beforeId })
  if (!id.safeParse(emailId).success || before?.success === false) {
    return NextResponse.json({ error: 'Yêu cầu hội thoại không hợp lệ.' }, { status: 400, headers })
  }

  const supabase = await createClientForRequest(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401, headers })

  const { data, error } = await supabase.rpc('read_email_conversation', {
    p_email_id: emailId, p_before_at: before?.data.at ?? null, p_before_id: before?.data.id ?? null,
  }).abortSignal(AbortSignal.timeout(8_000))
  if (error?.code === 'PT404') return NextResponse.json({ error: 'Không tìm thấy email.' }, { status: 404, headers })
  if (error || !data) return NextResponse.json({ error: 'Chưa thể mở hội thoại.' }, { status: 503, headers })
  return NextResponse.json(data, { headers })
}
