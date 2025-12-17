/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  exchangeCodeForTokens,
  getGoogleUserInfo
} from '@/lib/oauth/google';

// Get base URL for redirects (Render uses internal proxy URLs)
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://www.inboxai.vn';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const baseUrl = getBaseUrl();

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/settings?error=${error}`, baseUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?error=no_code', baseUrl)
    );
  }

  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', baseUrl));
    }

    // Verify state (CSRF protection)
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (stateData.userId !== user.id) {
          throw new Error('State mismatch');
        }
        // Check timestamp (5 minute expiry)
        if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
          throw new Error('State expired');
        }
      } catch (e) {
        console.error('State verification failed:', e);
        return NextResponse.redirect(
          new URL('/settings?error=invalid_state', baseUrl)
        );
      }
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user info
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('source_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('email_address', googleUser.email)
      .single();

    if (existingAccount) {
      // Update existing account
      await supabase
        .from('source_accounts')
        .update({
          auth_type: 'oauth_google',
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token,
          oauth_expires_at: expiresAt.toISOString(),
          oauth_scope: tokens.scope,
          is_connected: true,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id);
    } else {
      // Create new account
      await supabase
        .from('source_accounts')
        .insert({
          user_id: user.id,
          email_address: googleUser.email,
          provider: 'gmail',
          auth_type: 'oauth_google',
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token,
          oauth_expires_at: expiresAt.toISOString(),
          oauth_scope: tokens.scope,
          is_connected: true,
          is_active: true,
          display_name: googleUser.name,
        });
    }

    // Redirect to settings with success
    return NextResponse.redirect(
      new URL('/settings?success=gmail_connected', baseUrl)
    );

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/settings?error=callback_failed', getBaseUrl())
    );
  }
}
