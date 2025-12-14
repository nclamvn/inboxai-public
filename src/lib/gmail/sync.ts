/**
 * Gmail Sync Service - OPTIMIZED
 * Sync emails from Gmail API to database with batch processing
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

// Parallel processing limit
const PARALLEL_FETCH_LIMIT = 10;

/**
 * Process items with concurrency limit
 */
async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const result = await fn(items[currentIndex]);
        results[currentIndex] = result;
      } catch (error) {
        console.error(`[Gmail Parallel] Error at index ${currentIndex}:`, error);
        results[currentIndex] = null as R;
      }
    }
  }

  const workers = Array(Math.min(limit, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
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
      .select('email_address, last_sync_at')
      .eq('id', accountId)
      .single();

    if (!account) {
      return { success: false, syncedCount: 0, error: 'Account not found' };
    }

    console.log(`[Gmail Sync] Starting for ${account.email_address}, maxResults=${options.maxResults || 50}`);

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
      console.log(`[Gmail Sync] No new messages found`);
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

    console.log(`[Gmail Sync] Found ${messageList.messages.length} messages to sync`);

    // Get existing message IDs to filter duplicates
    const messageIds = messageList.messages.map(m => m.id);
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds);

    const existingIds = new Set(existingEmails?.map(e => e.message_id) || []);
    const newMessages = messageList.messages.filter(m => !existingIds.has(m.id));

    console.log(`[Gmail Sync] ${newMessages.length} new messages (${existingIds.size} already exist)`);

    if (newMessages.length === 0) {
      await supabase
        .from('source_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', accountId);
      return { success: true, syncedCount: 0 };
    }

    // OPTIMIZED: Fetch messages in parallel
    const startTime = Date.now();
    const fetchedMessages = await parallelLimit(
      newMessages,
      PARALLEL_FETCH_LIMIT,
      async (msg) => {
        try {
          const fullMessage = await getMessage(accessToken, msg.id);
          const headers = parseHeaders(fullMessage.payload.headers);
          const body = extractBody(fullMessage);

          // Parse from address
          const fromHeader = headers['from'] || '';
          const fromMatch = fromHeader.match(/(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?/);
          const fromName = fromMatch?.[1] || '';
          const fromAddress = fromMatch?.[2] || fromHeader;

          return {
            user_id: userId,
            source_account_id: accountId,
            message_id: msg.id,
            original_uid: msg.id, // Use Gmail message ID as UID
            thread_id: fullMessage.threadId,
            subject: headers['subject'] || '(Không có tiêu đề)',
            from_name: fromName,
            from_address: fromAddress,
            to_addresses: [headers['to'] || ''],
            body_text: body.text?.slice(0, 100000) || '',
            body_html: body.html?.slice(0, 200000) || null,
            body_fetched: true,
            snippet: fullMessage.snippet,
            received_at: new Date(parseInt(fullMessage.internalDate)).toISOString(),
            is_read: !fullMessage.labelIds.includes('UNREAD'),
            is_starred: fullMessage.labelIds.includes('STARRED'),
            is_archived: false,
            is_deleted: false,
            direction: 'inbound',
          };
        } catch (err) {
          console.error(`[Gmail Sync] Error fetching message ${msg.id}:`, err);
          return null;
        }
      }
    );

    const validEmails = fetchedMessages.filter((e): e is NonNullable<typeof e> => e !== null);
    console.log(`[Gmail Sync] Fetched ${validEmails.length} messages in ${Date.now() - startTime}ms`);

    // Batch insert emails
    let syncedCount = 0;
    if (validEmails.length > 0) {
      const { error: insertError, count } = await supabase
        .from('emails')
        .upsert(validEmails, {
          onConflict: 'source_account_id,original_uid',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error(`[Gmail Sync] Insert error:`, insertError);
      } else {
        syncedCount = validEmails.length;
        console.log(`[Gmail Sync] Inserted ${syncedCount} emails`);
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
