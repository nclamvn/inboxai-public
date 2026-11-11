/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/oauth/google';
import { createOAuthState, oauthCookieName, oauthCookieOptions } from '@/lib/oauth/state';

// Get base URL for redirects (Render uses internal proxy URLs)
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://www.inboxai.vn';
}

export async function GET() {
  const baseUrl = getBaseUrl();

  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', baseUrl));
    }

    // Generate state for CSRF protection
    const transaction = createOAuthState(user.id, 'connect');

    // Get authorization URL
    const authUrl = getGoogleAuthUrl(transaction.state, undefined, transaction.challenge);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(oauthCookieName('connect'), transaction.cookie, oauthCookieOptions());
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return NextResponse.redirect(
      new URL('/settings?error=oauth_failed', baseUrl)
    );
  }
}
