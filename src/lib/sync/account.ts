import 'server-only';
import { syncEmails, type SourceAccount } from '@/lib/email/imap-client';
import { syncGmailEmails } from '@/lib/gmail/sync';
export async function syncAccount(account: SourceAccount, options: {
    limit?: number;
    fullSync?: boolean;
    timeoutMs?: number;
} = {}) {
    if (account.auth_type === 'oauth_google') {
        const result = await syncGmailEmails(account.user_id, account.id, {
            maxResults: options.limit, fullSync: options.fullSync, timeoutMs: options.timeoutMs,
        });
        return { ...result, errors: result.error ? [result.error] : [] };
    }
    return syncEmails(account, options);
}
