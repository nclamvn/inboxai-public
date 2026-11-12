import 'server-only'
import { getCredentialVault } from '@/lib/credential-vault/vault'
import { refreshAccessToken, isTokenExpired } from '@/lib/oauth/google'
import { hasGmailSendScope } from './scopes'

/** Read and refresh only the credentials bound to this tenant/account. */
export async function getGoogleCredential(userId: string, accountId: string, signal?: AbortSignal) {
    try {
        const vault = getCredentialVault();
        const scope = { userId, accountId };
        const { credentials, revision } = await vault.read(scope);
        if (credentials.kind !== 'google')
            return null;
        if (!isTokenExpired(new Date(credentials.expiresAt)))
            return credentials;
        if (!credentials.refreshToken)
            return null;
        const refreshed = await refreshAccessToken(credentials.refreshToken, signal);
        const grantedScope = refreshed.scope ?? credentials.scope;
        const next = {
            ...credentials, accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || credentials.refreshToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            scope: grantedScope,
            sendDisabled: credentials.sendDisabled || !hasGmailSendScope(grantedScope),
        };
        await vault.write(scope, next, revision);
        return next;
    }
    catch {
        // Failed refresh/persistence/CAS never returns a transient or foreign token.
        return null;
    }
}

/** A provider scope denial only disables sending on the credential that was denied. */
export async function disableGoogleSending(userId: string, accountId: string, deniedToken: string) {
    try {
        const vault = getCredentialVault();
        const scope = { userId, accountId };
        const { credentials, revision } = await vault.read(scope);
        if (credentials.kind === 'google' && credentials.accessToken === deniedToken && !credentials.sendDisabled) {
            await vault.write(scope, { ...credentials, sendDisabled: true }, revision);
        }
    } catch {
        // The receipt still records the rejection. A concurrent grant stays authoritative.
    }
}
