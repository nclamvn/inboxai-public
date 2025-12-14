/**
 * POST /api/email/sync/gmail
 * Trigger Gmail sync for an account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncGmailEmails } from '@/lib/gmail/sync';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    // Verify account belongs to user
    const { data: account } = await supabase
      .from('source_accounts')
      .select('id, auth_type')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.auth_type !== 'oauth_google') {
      return NextResponse.json({ error: 'Not a Gmail OAuth account' }, { status: 400 });
    }

    // Sync emails
    const result = await syncGmailEmails(user.id, accountId);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Gmail sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
