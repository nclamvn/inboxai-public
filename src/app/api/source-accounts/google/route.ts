/**
 * POST /api/source-accounts/google
 * Initiate Google OAuth for adding new account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAuthUrl } from '@/lib/oauth/google'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create state with user info for callback
    const state = Buffer.from(JSON.stringify({
      user_id: user.id,
      action: 'add_account',
      timestamp: Date.now(),
    })).toString('base64')

    // Build custom redirect URI for add account flow
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/source-accounts/google/callback`

    // Generate OAuth URL with custom redirect
    const authUrl = getGoogleAuthUrl(state, redirectUri)

    return NextResponse.json({
      auth_url: authUrl,
      provider: 'google',
    })
  } catch (error: any) {
    console.error('[Google OAuth] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
