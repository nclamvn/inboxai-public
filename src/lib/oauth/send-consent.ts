import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSendTarget, GoogleGrantError, saveGoogleSendGrant } from '@/lib/credential-vault/accounts'
import { CredentialError } from '@/lib/credential-vault/crypto'
import { exchangeCodeForTokens, getGoogleUserInfo } from './google'
import { oauthCookieName, oauthCookieOptions, validateGoogleSendState } from './state'

/** The add-account redirect URI serves both flows. Their signed states remain separate. */
export async function handleGoogleSendConsent(request: NextRequest, base: string) {
  const cookieName = oauthCookieName('enable-send')
  const cookie = request.cookies.get(cookieName)?.value
  if (!cookie) return null

  function finish(result: string) {
    const destination = new URL('/settings', base)
    destination.searchParams.set('gmail_send', result)
    destination.hash = 'email-accounts'
    const response = NextResponse.redirect(destination)
    response.cookies.set(cookieName, '', { ...oauthCookieOptions(), maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  try {
    const params = request.nextUrl.searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const transaction = user && validateGoogleSendState(params.get('state'), cookie, user.id)
    if (!transaction || !user) {
      return request.cookies.get(oauthCookieName('add-account'))?.value ? null : finish('invalid_state')
    }
    if (params.has('error')) return finish('denied')
    const code = params.get('code')
    if (!code) return finish('invalid_state')

    const target = await getGoogleSendTarget(user.id, transaction.accountId)
    if (!target || target.revision !== transaction.revision) return finish('stale')

    const callback = new URL('/api/source-accounts/google/callback', base).toString()
    const tokens = await exchangeCodeForTokens(code, callback, transaction.verifier)
    const profile = await getGoogleUserInfo(tokens.access_token)
    await saveGoogleSendGrant(target, profile, tokens)
    return finish('enabled')
  } catch (error) {
    if (error instanceof CredentialError && error.code === 'conflict') return finish('stale')
    return finish(error instanceof GoogleGrantError ? error.reason : 'failed')
  }
}
