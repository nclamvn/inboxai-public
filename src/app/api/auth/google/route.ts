/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/oauth/google';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', request.url));
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
      new URL('/settings?error=oauth_failed', request.url)
    );
  }
}
