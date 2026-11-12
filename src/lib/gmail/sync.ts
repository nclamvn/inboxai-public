import 'server-only';
import { getGoogleCredential } from './credentials';
import { runSync } from '@/lib/sync/engine';
import { getSyncStore } from '@/lib/sync/store';
import { gmailProvider } from '@/lib/sync/gmail-provider';
import { gmailReader } from '@/lib/sync/gmail-reader';
import { SyncError } from '@/lib/sync/contracts';
import { canReadGmail } from './scopes';
export async function getValidAccessToken(userId: string, accountId: string, signal?: AbortSignal): Promise<string | null> {
    const credential = await getGoogleCredential(userId, accountId, signal);
    // A legacy grant without recorded scopes still has to pass Google's read authorization.
    return credential && (credential.scope === undefined || canReadGmail(credential.scope)) ? credential.accessToken : null;
}
export async function syncGmailEmails(userId: string, accountId: string, options: {
    maxResults?: number;
    fullSync?: boolean;
} = {}) {
    const result = await runSync(getSyncStore(), { userId, accountId, provider: 'gmail' }, async signal => {
        const token = await getValidAccessToken(userId, accountId, signal);
        if (!token)
            throw new SyncError('credentials');
        return gmailProvider(gmailReader(token));
    }, { limit: options.maxResults, fullSync: options.fullSync });
    return { ...result, syncedCount: result.synced };
}
