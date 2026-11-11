import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const edit = z.strictObject({
  query: z.string().trim().min(1).max(300).refine(value => !value.includes('\0')),
  save: z.boolean().optional(),
})

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return reply({ error: 'Yêu cầu đăng nhập.' }, 401)
  const { data, error } = await client.from('user_preferences').select('recent_searches,saved_searches')
    .eq('user_id', user.id).maybeSingle()
  if (error) return reply({ error: 'Chưa tải được lịch sử tìm kiếm.' }, 503)
  return reply({ recent: data?.recent_searches ?? [], saved: data?.saved_searches ?? [] })
}

async function change(request: NextRequest, remove: boolean) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return reply({ error: 'Yêu cầu đăng nhập.' }, 401)
  const input = edit.safeParse(await request.json().catch(() => null))
  if (!input.success) return reply({ error: 'Cụm tìm kiếm không hợp lệ.' }, 400)
  const { data, error } = await client.rpc('update_search_history', {
    p_query: input.data.query, p_action: remove ? 'remove' : input.data.save ? 'save' : 'recent',
  })
  if (error || data !== true) return reply({ error: 'Chưa lưu được lịch sử tìm kiếm.' }, 503)
  return reply({ success: true })
}

export async function POST(request: NextRequest) {
  return change(request, false)
}

export async function DELETE(request: NextRequest) {
  return change(request, true)
}
