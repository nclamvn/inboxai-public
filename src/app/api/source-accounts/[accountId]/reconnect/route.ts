import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleSendTarget } from '@/lib/credential-vault/accounts'
import { canModifyGmail, canSendGmail } from '@/lib/gmail/scopes'
import { getGoogleAuthUrl } from '@/lib/oauth/google'
import { createGoogleReconnectState, oauthCookieName, oauthCookieOptions } from '@/lib/oauth/state'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params
    const surface = z.enum(['inbox', 'outbox']).safeParse(request.nextUrl.searchParams.get('surface'))
    if (!z.uuid().safeParse(accountId).success || !surface.success) {
      return NextResponse.json({ error: 'Yêu cầu kết nối không hợp lệ.' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401 })
    const target = await getGoogleSendTarget(user.id, accountId)
    if (!target) return NextResponse.json({ error: 'Không tìm thấy tài khoản Gmail.' }, { status: 404 })

    const includeSend = surface.data === 'outbox' || canSendGmail(target.credentials)
    const includeModify = canModifyGmail(target.credentials.scope)
    const binding = { accountId, revision: target.revision, surface: surface.data, includeSend, includeModify }
    const transaction = createGoogleReconnectState(user.id, binding)
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const callback = new URL('/api/source-accounts/google/callback', base).toString()
    const authUrl = getGoogleAuthUrl(transaction.state, callback, transaction.challenge, undefined,
      { email: target.email, includeSend, includeModify })
    const response = NextResponse.json({ auth_url: authUrl }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(oauthCookieName('reconnect'), transaction.cookie, oauthCookieOptions())
    return response
  } catch {
    return NextResponse.json({ error: 'Chưa thể mở kết nối Gmail.' }, { status: 503 })
  }
}
