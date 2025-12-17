/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/oauth/google';

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
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    })).toString('base64');

    // Get authorization URL
    const authUrl = getGoogleAuthUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return NextResponse.redirect(
      new URL('/settings?error=oauth_failed', baseUrl)
    );
  }
}
