import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleSendTarget, GoogleGrantError, saveGoogleReconnectGrant } from '@/lib/credential-vault/accounts'
import { CredentialError } from '@/lib/credential-vault/crypto'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getGoogleUserInfo } from './google'
import { oauthCookieName, oauthCookieOptions, validateGoogleReconnectState } from './state'

export async function handleGoogleReconnect(request: NextRequest, base: string) {
  const name = oauthCookieName('reconnect')
  const cookie = request.cookies.get(name)?.value
  if (!cookie) return null
  let surface = 'inbox'

  function finish(result: string) {
    const destination = new URL('/' + surface, base)
    destination.searchParams.set('gmail_reconnect', result)
    const response = NextResponse.redirect(destination)
    response.cookies.set(name, '', { ...oauthCookieOptions(), maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  try {
    const params = request.nextUrl.searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const transaction = user && validateGoogleReconnectState(params.get('state'), cookie, user.id)
    if (!transaction || !user) {
      const otherFlow = request.cookies.has(oauthCookieName('add-account')) || request.cookies.has(oauthCookieName('enable-send'))
      return otherFlow ? null : finish('invalid_state')
    }
    surface = transaction.surface
    if (params.has('error')) return finish('denied')
    const code = params.get('code')
    if (!code) return finish('invalid_state')

    const target = await getGoogleSendTarget(user.id, transaction.accountId)
    if (!target || target.revision !== transaction.revision) return finish('stale')
    const callback = new URL('/api/source-accounts/google/callback', base).toString()
    const tokens = await exchangeCodeForTokens(code, callback, transaction.verifier)
    const profile = await getGoogleUserInfo(tokens.access_token)
    await saveGoogleReconnectGrant(target, profile, tokens, transaction)
    return finish('connected')
  } catch (error) {
    if (error instanceof CredentialError && error.code === 'conflict') return finish('stale')
    return finish(error instanceof GoogleGrantError ? error.reason : 'failed')
  }
}
