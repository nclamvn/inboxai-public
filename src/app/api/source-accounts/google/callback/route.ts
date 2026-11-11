import { oauthCookieName, oauthCookieOptions, validateOAuthState } from '@/lib/oauth/state'
/**
 * GET /api/source-accounts/google/callback
 * Handle Google OAuth callback for adding new account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/oauth/google'

// Account colors for multiple accounts
const ACCOUNT_COLORS = [
  '#2563EB', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
]

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

    // Check if account already exists
    const { data: existingAccount, error: lookupError } = await supabase
      .from('source_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('email_address', googleUser.email)
      .maybeSingle()
    if (lookupError) throw new Error('Account lookup failed')

    if (existingAccount) {
      // Update existing account with new tokens
      const { error: saveError } = await supabase
        .from('source_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
          sync_status: 'idle',
          sync_error: null,
        })
        .eq('id', existingAccount.id)
        .eq('user_id', user.id)
      if (saveError) throw new Error('Account update failed')

      return redirect(
        `${baseUrl}/settings/accounts?success=${encodeURIComponent('Account reconnected successfully')}`
      )
    }

    // Get existing accounts count for color assignment
    const { count: existingCount } = await supabase
      .from('source_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // Assign color based on account count
    const colorIndex = (existingCount || 0) % ACCOUNT_COLORS.length
    const accountColor = ACCOUNT_COLORS[colorIndex]

    // Check if this is the first account (will be primary)
    const isFirstAccount = (existingCount || 0) === 0

    // Create new account
    const { error: insertError } = await supabase
      .from('source_accounts')
      .insert({
        user_id: user.id,
        email_address: googleUser.email,
        display_name: googleUser.name || googleUser.email,
        provider: 'google',
        auth_type: 'oauth',
        avatar_url: googleUser.picture,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        is_active: true,
        is_primary: isFirstAccount,
        color: accountColor,
        sync_status: 'idle',
      })

    if (insertError) {
      console.error('[Google OAuth Callback] Insert error:', insertError)
      return redirect(
        `${baseUrl}/settings?error=account_save_failed`
      )
    }

    return redirect(
      `${baseUrl}/settings/accounts?success=${encodeURIComponent('Account added successfully')}`
    )
  } catch (error) {
    console.error('[Google OAuth Callback] Error:', error)
    return redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent('Failed to add account')}`
    )
  }
}
