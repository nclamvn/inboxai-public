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

  // Handle OAuth errors
  if (error) {
    console.error('[Google OAuth Callback] Error:', error)
    return NextResponse.redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent('No authorization code received')}`
    )
  }

  try {
    // Parse state to get user info
    let stateData: { user_id: string; action: string; timestamp: number } | null = null
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      } catch (e) {
        console.error('[Google OAuth Callback] Invalid state:', e)
      }
    }

    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Please login first')}`
      )
    }

    // Verify state matches user (security check)
    if (stateData && stateData.user_id !== user.id) {
      return NextResponse.redirect(
        `${baseUrl}/settings/accounts?error=${encodeURIComponent('Invalid state')}`
      )
    }

    // Build the same redirect URI used in the initial request
    const redirectUri = `${baseUrl}/api/source-accounts/google/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Get user info from Google
    const googleUser = await getGoogleUserInfo(tokens.access_token)

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('source_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('email_address', googleUser.email)
      .single()

    if (existingAccount) {
      // Update existing account with new tokens
      await supabase
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

      return NextResponse.redirect(
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
      return NextResponse.redirect(
        `${baseUrl}/settings/accounts?error=${encodeURIComponent(insertError.message)}`
      )
    }

    return NextResponse.redirect(
      `${baseUrl}/settings/accounts?success=${encodeURIComponent('Account added successfully')}`
    )
  } catch (error: any) {
    console.error('[Google OAuth Callback] Error:', error)
    return NextResponse.redirect(
      `${baseUrl}/settings/accounts?error=${encodeURIComponent(error.message || 'Failed to add account')}`
    )
  }
}
