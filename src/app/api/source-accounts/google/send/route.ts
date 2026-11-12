import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSendTarget } from '@/lib/credential-vault/accounts'
import { createGoogleSendState, oauthCookieName, oauthCookieOptions } from '@/lib/oauth/state'
import { getGoogleAuthUrl } from '@/lib/oauth/google'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return NextResponse.json({ error: 'Yêu cầu phải ở định dạng JSON.' }, { status: 400 })
  }

  const input = z.object({ accountId: z.uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Tài khoản Gmail không hợp lệ.' }, { status: 400 })

  try {
    const { accountId } = input.data
    const target = await getGoogleSendTarget(user.id, accountId)
    if (!target) return NextResponse.json({ error: 'Không tìm thấy tài khoản Gmail đang hoạt động.' }, { status: 404 })

    const transaction = createGoogleSendState(user.id, { accountId, revision: target.revision })
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const callback = new URL('/api/source-accounts/google/callback', base).toString()
    const authUrl = getGoogleAuthUrl(transaction.state, callback, transaction.challenge, target.email)
    const response = NextResponse.json({ auth_url: authUrl }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(oauthCookieName('enable-send'), transaction.cookie, oauthCookieOptions())
    return response
  } catch {
    return NextResponse.json({ error: 'Chưa thể mở màn hình cấp quyền gửi Gmail.' }, { status: 503 })
  }
}
