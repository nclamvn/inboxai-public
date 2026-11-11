import { saveGoogleConnection } from '@/lib/credential-vault/accounts';
import { oauthCookieName, oauthCookieOptions, validateOAuthState } from '@/lib/oauth/state';
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

  const redirect = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.cookies.set(oauthCookieName('connect'), '', { ...oauthCookieOptions(), maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return redirect(
      new URL('/settings?error=oauth_denied', baseUrl)
    );
  }

  if (!code) {
    return redirect(
      new URL('/settings?error=no_code', baseUrl)
    );
  }

  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return redirect(new URL('/login', baseUrl));
    }

    const verifier = validateOAuthState(state, request.cookies.get(oauthCookieName('connect'))?.value, user.id, 'connect');
    if (!verifier) return redirect(new URL('/settings?error=invalid_state', baseUrl));

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, undefined, verifier);

    // Get user info
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    await saveGoogleConnection(user.id, googleUser, tokens);

    // Redirect to settings with success
    return redirect(
      new URL('/settings?success=gmail_connected', baseUrl)
    );

  } catch {
    console.error('OAuth callback failed');
    return redirect(
      new URL('/settings?error=callback_failed', getBaseUrl())
    );
  }
}
