/**
 * POST /api/source-accounts/google
 * Initiate Google OAuth for adding new account
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAuthUrl } from '@/lib/oauth/google'
import { createOAuthState, oauthCookieName, oauthCookieOptions } from '@/lib/oauth/state'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create state with user info for callback
    const transaction = createOAuthState(user.id, 'add-account')

    // Build custom redirect URI for add account flow
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/source-accounts/google/callback`

    // Generate OAuth URL with custom redirect
    const authUrl = getGoogleAuthUrl(transaction.state, redirectUri, transaction.challenge)

    const response = NextResponse.json({
      auth_url: authUrl,
      provider: 'google',
    })
    response.cookies.set(oauthCookieName('add-account'), transaction.cookie, oauthCookieOptions())
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('[Google OAuth] Error:', error)
    return NextResponse.json({ error: 'OAuth initiation failed' }, { status: 500 })
  }
}
