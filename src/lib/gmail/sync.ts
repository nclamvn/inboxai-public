import { getCredentialVault } from '@/lib/credential-vault/vault';
/**
 * Gmail Sync Service - OPTIMIZED
 * Sync emails from Gmail API to database with batch processing
 */

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
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
import { gmailLogger } from '@/lib/logger';

// Create admin client lazily to avoid edge runtime issues
function getSupabaseAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
      } catch {
        results[currentIndex] = null as R;
      }
    }
  }

  const workers = Array(Math.min(limit, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

/** Read and refresh only the credentials bound to this tenant/account. */
export async function getValidAccessToken(userId: string, accountId: string): Promise<string | null> {
  try {
    const vault = getCredentialVault();
    const scope = { userId, accountId };
    const { credentials, revision } = await vault.read(scope);
    if (credentials.kind !== 'google') return null;
    if (!isTokenExpired(new Date(credentials.expiresAt))) return credentials.accessToken;
    if (!credentials.refreshToken) return null;
    const refreshed = await refreshAccessToken(credentials.refreshToken);
    await vault.write(scope, {
      ...credentials, accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || credentials.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }, revision);
    return refreshed.access_token;
  } catch {
    // Failed refresh/persistence/CAS never returns a transient or foreign token.
    return null;
  }
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
  const supabase = getSupabaseAdmin();

  const { data: ownedAccount } = await supabase.from('source_accounts').select('id')
    .eq('id', accountId).eq('user_id', userId).maybeSingle();
  if (!ownedAccount) return { success: false, syncedCount: 0, error: 'Account not found' };

  // Set sync status to syncing
  await supabase
    .from('source_accounts')
    .update({ sync_status: 'syncing', sync_error: null })
    .eq('id', accountId)
    .eq('user_id', userId);

  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(userId, accountId);
    if (!accessToken) {
      await supabase
        .from('source_accounts')
        .update({ sync_status: 'error', sync_error: 'Invalid access token' })
        .eq('id', accountId)
        .eq('user_id', userId);
      return { success: false, syncedCount: 0, error: 'Invalid access token' };
    }

    // Get account info
    const { data: account } = await supabase
      .from('source_accounts')
      .select('email_address, last_sync_at')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (!account) {
      return { success: false, syncedCount: 0, error: 'Account not found' };
    }

    gmailLogger.info(`Starting sync for ${account.email_address}, maxResults=${options.maxResults || 50}`);

    // Build query for new emails - only use 'after:' filter, not 'in:inbox' since we use labelIds
    let query = '';
    if (!options.fullSync && account.last_sync_at) {
      const afterDate = new Date(account.last_sync_at);
      query = `after:${Math.floor(afterDate.getTime() / 1000)}`;
    }

    gmailLogger.debug(`Query: "${query}", labelIds: INBOX`);

    // List messages
    const messageList = await listMessages(accessToken, {
      maxResults: options.maxResults || 50,
      q: query || undefined, // Don't send empty query
      labelIds: ['INBOX'],
    });

    if (!messageList.messages || messageList.messages.length === 0) {
      gmailLogger.debug('No new messages found');
      // Update last sync time even if no new messages
      await supabase
        .from('source_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'idle',
          sync_error: null,
        })
        .eq('id', accountId)
        .eq('user_id', userId);

      return { success: true, syncedCount: 0 };
    }

    gmailLogger.info(`Found ${messageList.messages.length} messages to sync`);

    // Get existing message IDs to filter duplicates
    const messageIds = messageList.messages.map(m => m.id);
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds);

    const existingIds = new Set(existingEmails?.map(e => e.message_id) || []);
    const newMessages = messageList.messages.filter(m => !existingIds.has(m.id));

    gmailLogger.debug(`${newMessages.length} new messages (${existingIds.size} already exist)`);

    if (newMessages.length === 0) {
      await supabase
        .from('source_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'idle',
          sync_error: null,
        })
        .eq('id', accountId)
        .eq('user_id', userId);
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
            // Note: Gmail threadId is hex string, not UUID. Store in original_uid for grouping
            // thread_id column in DB expects UUID, so we skip it
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
        } catch {
          return null;
        }
      }
    );

    const validEmails = fetchedMessages.filter((e): e is NonNullable<typeof e> => e !== null);
    gmailLogger.debug(`Fetched ${validEmails.length} messages in ${Date.now() - startTime}ms`);

    // Batch insert emails
    let syncedCount = 0;
    if (validEmails.length > 0) {
      const { error: insertError, count } = await supabase
        .from('emails')
        .upsert(validEmails, {
          onConflict: 'source_account_id,original_uid',
          ignoreDuplicates: true
        });

      if (!insertError) {
        syncedCount = validEmails.length;
      }
    }

    // Update last sync time, sync status and increment total count
    const { error: updateError } = await supabase
      .from('source_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'idle',
        sync_error: null,
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      gmailLogger.error('Failed to update source_account:', updateError);
    }

    // Increment total_emails_synced using raw SQL for atomic increment
    if (syncedCount > 0) {
      await supabase.rpc('increment_total_emails_synced', {
        account_id: accountId,
        count: syncedCount
      }).then(({ error }) => {
        if (error) {
          // Fallback: Get current count and update
          supabase
            .from('source_accounts')
            .select('total_emails_synced')
            .eq('id', accountId)
            .eq('user_id', userId)
            .single()
            .then(({ data }) => {
              const currentCount = data?.total_emails_synced || 0;
              supabase
                .from('source_accounts')
                .update({ total_emails_synced: currentCount + syncedCount })
                .eq('id', accountId)
                .eq('user_id', userId);
            });
        }
      });
    }

    gmailLogger.info(`Sync complete: ${syncedCount} emails synced`);
    return { success: true, syncedCount };

  } catch {
    gmailLogger.error('Gmail sync failed');

    // Update error status
    await supabase
      .from('source_accounts')
      .update({
        sync_status: 'error',
        sync_error: 'Gmail sync failed',
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    return {
      success: false,
      syncedCount: 0,
      error: 'Gmail sync failed'
    };
  }
}
