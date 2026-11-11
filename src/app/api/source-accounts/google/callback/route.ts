import { saveGoogleConnection } from '@/lib/credential-vault/accounts'
import { oauthCookieName, oauthCookieOptions, validateOAuthState } from '@/lib/oauth/state'
/**
 * GET /api/source-accounts/google/callback
 * Handle Google OAuth callback for adding new account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/oauth/google'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Base URL for redirects
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const redirect = (url: string) => {
    const response = NextResponse.redirect(url)
    response.cookies.set(oauthCookieName('add-account'), '', { ...oauthCookieOptions(), maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  // Handle OAuth errors
  if (error) {
    console.error('[Google OAuth Callback] Error:', error)
    return redirect(
      `${baseUrl}/settings?error=oauth_denied`
    )
  }

  if (!code) {
    return redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent('No authorization code received')}`
    )
  }

  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Please login first')}`
      )
    }

    const verifier = validateOAuthState(state, request.cookies.get(oauthCookieName('add-account'))?.value, user.id, 'add-account')
    if (!verifier) return redirect(`${baseUrl}/settings?error=invalid_state`)

    // Build the same redirect URI used in the initial request
    const redirectUri = `${baseUrl}/api/source-accounts/google/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri, verifier)

    // Get user info from Google
    const googleUser = await getGoogleUserInfo(tokens.access_token)

    await saveGoogleConnection(user.id, googleUser, tokens)

    return redirect(
      `${baseUrl}/settings/accounts?success=${encodeURIComponent('Account added successfully')}`
    )
  } catch {
    console.error('[Google OAuth Callback] Failed')
    return redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent('Failed to add account')}`
    )
  }
}
