/**
 * Gmail Sync Service
 * Sync emails from Gmail API to database
 */

import { createClient } from '@/lib/supabase/server';
import {
  refreshAccessToken,
  isTokenExpired
} from '@/lib/oauth/google';
import {
  listMessages,
  getMessage,
  parseHeaders,
  extractBody,
} from '@/lib/gmail/api';

interface SyncResult {
  success: boolean;
  syncedCount: number;
  error?: string;
}

/**
 * Get valid access token (refresh if expired)
 */
export async function getValidAccessToken(
  accountId: string
): Promise<string | null> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from('source_accounts')
    .select('oauth_access_token, oauth_refresh_token, oauth_expires_at')
    .eq('id', accountId)
    .single();

  if (!account) return null;

  // Check if token is expired
  if (account.oauth_expires_at && isTokenExpired(new Date(account.oauth_expires_at))) {
    if (!account.oauth_refresh_token) {
      console.error('No refresh token available');
      return null;
    }

    try {
      // Refresh the token
      const newTokens = await refreshAccessToken(account.oauth_refresh_token);
      const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      // Update in database
      await supabase
        .from('source_accounts')
        .update({
          oauth_access_token: newTokens.access_token,
          oauth_expires_at: expiresAt.toISOString(),
          ...(newTokens.refresh_token && {
            oauth_refresh_token: newTokens.refresh_token
          }),
        })
        .eq('id', accountId);

      return newTokens.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  return account.oauth_access_token;
}

/**
 * Sync emails from Gmail
 */
export async function syncGmailEmails(
  userId: string,
  accountId: string,
  options: {
    maxResults?: number;
    fullSync?: boolean;
  } = {}
): Promise<SyncResult> {
  const supabase = await createClient();

  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(accountId);
    if (!accessToken) {
      return { success: false, syncedCount: 0, error: 'Invalid access token' };
    }

    // Get account info
    const { data: account } = await supabase
      .from('source_accounts')
      .select('email, last_sync_at')
      .eq('id', accountId)
      .single();

    if (!account) {
      return { success: false, syncedCount: 0, error: 'Account not found' };
    }

    // Build query for new emails
    let query = 'in:inbox';
    if (!options.fullSync && account.last_sync_at) {
      const afterDate = new Date(account.last_sync_at);
      query += ` after:${Math.floor(afterDate.getTime() / 1000)}`;
    }

    // List messages
    const messageList = await listMessages(accessToken, {
      maxResults: options.maxResults || 50,
      q: query,
      labelIds: ['INBOX'],
    });

    if (!messageList.messages || messageList.messages.length === 0) {
      // Update last sync time even if no new messages
      await supabase
        .from('source_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', accountId);

      return { success: true, syncedCount: 0 };
    }

    let syncedCount = 0;

    // Fetch and save each message
    for (const msg of messageList.messages) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('emails')
          .select('id')
          .eq('message_id', msg.id)
          .eq('user_id', userId)
          .single();

        if (existing) continue;

        // Get full message
        const fullMessage = await getMessage(accessToken, msg.id);
        const headers = parseHeaders(fullMessage.payload.headers);
        const body = extractBody(fullMessage);

        // Parse from address
        const fromHeader = headers['from'] || '';
        const fromMatch = fromHeader.match(/(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?/);
        const fromName = fromMatch?.[1] || '';
        const fromAddress = fromMatch?.[2] || fromHeader;

        // Insert email
        await supabase.from('emails').insert({
          user_id: userId,
          source_account_id: accountId,
          message_id: msg.id,
          thread_id: fullMessage.threadId,
          subject: headers['subject'] || '(Không có tiêu đề)',
          from_name: fromName,
          from_address: fromAddress,
          to_address: headers['to'] || '',
          body_text: body.text,
          body_html: body.html,
          snippet: fullMessage.snippet,
          received_at: new Date(parseInt(fullMessage.internalDate)).toISOString(),
          is_read: !fullMessage.labelIds.includes('UNREAD'),
          is_starred: fullMessage.labelIds.includes('STARRED'),
          labels: fullMessage.labelIds,
        });

        syncedCount++;
      } catch (msgError) {
        console.error(`Error syncing message ${msg.id}:`, msgError);
      }
    }

    // Update last sync time
    await supabase
      .from('source_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', accountId);

    return { success: true, syncedCount };

  } catch (error) {
    console.error('Gmail sync error:', error);

    // Update error status
    await supabase
      .from('source_accounts')
      .update({
        last_error: error instanceof Error ? error.message : 'Sync failed',
      })
      .eq('id', accountId);

    return {
      success: false,
      syncedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
