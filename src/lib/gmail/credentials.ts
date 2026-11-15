import 'server-only'
import { getCredentialVault } from '@/lib/credential-vault/vault'
import { GoogleRefreshRevoked, refreshAccessToken, isTokenExpired } from '@/lib/oauth/google'
import { hasGmailSendScope } from './scopes'

export class GmailReconnectRequired extends Error {}

export async function requireGmailReconnect(userId: string, accountId: string, revision: number): Promise<never> {
    if (await getCredentialVault().markGoogleReconnect({ userId, accountId }, revision))
        throw new GmailReconnectRequired();
    // An interactive grant or another refresh won the credential revision race.
    throw new Error('Gmail credential changed');
}

/** Keep transient failures distinct from a rejected refresh grant. */
export async function resolveGoogleCredential(userId: string, accountId: string, signal?: AbortSignal, force = false) {
    const vault = getCredentialVault();
    const scope = { userId, accountId };
    const { credentials, revision } = await vault.read(scope);
    if (credentials.kind !== 'google')
        throw new Error('Gmail account unavailable');
    if (!force && !isTokenExpired(new Date(credentials.expiresAt)))
        return { credential: credentials, revision };
    if (!credentials.refreshToken)
        return requireGmailReconnect(userId, accountId, revision);
    const refreshed = await refreshAccessToken(credentials.refreshToken, signal).catch(error => {
        if (error instanceof GoogleRefreshRevoked) return requireGmailReconnect(userId, accountId, revision);
        throw error;
    });
    const grantedScope = refreshed.scope ?? credentials.scope;
    const credential = {
        ...credentials, accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || credentials.refreshToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        scope: grantedScope,
        sendDisabled: credentials.sendDisabled || !hasGmailSendScope(grantedScope),
    };
    return { credential, revision: await vault.write(scope, credential, revision) };
}

export async function getGoogleCredential(userId: string, accountId: string, signal?: AbortSignal) {
    try {
        return (await resolveGoogleCredential(userId, accountId, signal)).credential;
    } catch {
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
