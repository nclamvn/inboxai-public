import 'server-only';
import { getGoogleCredential, requireGmailReconnect, resolveGoogleCredential } from './credentials';
import { runSync } from '@/lib/sync/engine';
import { getSyncStore } from '@/lib/sync/store';
import { GmailReadError, gmailProvider } from '@/lib/sync/gmail-provider';
import { gmailReader } from '@/lib/sync/gmail-reader';
import { canReadGmail } from './scopes';
export async function getValidAccessToken(userId: string, accountId: string, signal?: AbortSignal): Promise<string | null> {
    const credential = await getGoogleCredential(userId, accountId, signal);
    // A legacy grant without recorded scopes still has to pass Google's read authorization.
    return credential && (credential.scope === undefined || canReadGmail(credential.scope)) ? credential.accessToken : null;
}
export async function syncGmailEmails(userId: string, accountId: string, options: {
    maxResults?: number;
    fullSync?: boolean;
    timeoutMs?: number;
} = {}) {
    const result = await runSync(getSyncStore(), { userId, accountId, provider: 'gmail' }, async signal => {
        async function prepare(force = false) {
            const { credential, revision } = await resolveGoogleCredential(userId, accountId, signal, force);
            if (credential.scope !== undefined && !canReadGmail(credential.scope))
                return requireGmailReconnect(userId, accountId, revision);
            return { provider: gmailProvider(gmailReader(credential.accessToken)), revision };
        }
        let active = await prepare();
        let refreshed = false;
        async function page(...args: Parameters<typeof active.provider.page>) {
            try {
                return await active.provider.page(...args);
            } catch (error) {
                if (!(error instanceof GmailReadError)) throw error;
                if (error.scopeDenied) return requireGmailReconnect(userId, accountId, active.revision);
                if (error.status !== 401 || refreshed) throw error;
                refreshed = true;
                active = await prepare(true);
                try {
                    return await active.provider.page(...args);
                } catch (retryError) {
                    if (retryError instanceof GmailReadError && retryError.scopeDenied)
                        return requireGmailReconnect(userId, accountId, active.revision);
                    throw retryError;
                }
            }
        }
        return { page, close: () => active.provider.close() };
    }, { limit: options.maxResults, fullSync: options.fullSync, timeoutMs: options.timeoutMs });
    return { ...result, syncedCount: result.synced };
}
