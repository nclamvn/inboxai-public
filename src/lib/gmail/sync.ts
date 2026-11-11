import 'server-only';
import { getCredentialVault } from '@/lib/credential-vault/vault';
import { refreshAccessToken, isTokenExpired } from '@/lib/oauth/google';
import { runSync } from '@/lib/sync/engine';
import { getSyncStore } from '@/lib/sync/store';
import { gmailProvider } from '@/lib/sync/gmail-provider';
import { gmailReader } from '@/lib/sync/gmail-reader';
import { SyncError } from '@/lib/sync/contracts';
/** Read and refresh only the credentials bound to this tenant/account. */
export async function getValidAccessToken(userId: string, accountId: string): Promise<string | null> {
    try {
        const vault = getCredentialVault();
        const scope = { userId, accountId };
        const { credentials, revision } = await vault.read(scope);
        if (credentials.kind !== 'google')
            return null;
        if (!isTokenExpired(new Date(credentials.expiresAt)))
            return credentials.accessToken;
        if (!credentials.refreshToken)
            return null;
        const refreshed = await refreshAccessToken(credentials.refreshToken);
        await vault.write(scope, {
            ...credentials, accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || credentials.refreshToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }, revision);
        return refreshed.access_token;
    }
    catch {
        // Failed refresh/persistence/CAS never returns a transient or foreign token.
        return null;
    }
}
export async function syncGmailEmails(userId: string, accountId: string, options: {
    maxResults?: number;
    fullSync?: boolean;
} = {}) {
    const result = await runSync(getSyncStore(), { userId, accountId, provider: 'gmail' }, async () => {
        const token = await getValidAccessToken(userId, accountId);
        if (!token)
            throw new SyncError('credentials');
        return gmailProvider(gmailReader(token));
    }, { limit: options.maxResults, fullSync: options.fullSync });
    return { ...result, syncedCount: result.synced };
}
