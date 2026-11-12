import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import type { GoogleTokens, GoogleUserInfo } from '@/lib/oauth/google';
import { refreshAccessToken } from '@/lib/oauth/google';
import { canReadGmail, gmailSendScope } from '@/lib/gmail/scopes';
import { getCredentialVault, type AccountMetadata } from './vault';
import { CredentialError } from './crypto';
/** Metadata lookup is user scoped; the service RPC atomically writes account + envelope. */
export async function saveGoogleConnection(userId: string, profile: GoogleUserInfo, tokens: GoogleTokens) {
    if (!profile.verified_email || !canReadGmail(tokens.scope)) throw new GoogleGrantError('scope_missing');
    const supabase = await createClient();
    const email = profile.email.toLowerCase();
    const { data: account, error } = await supabase.from('source_accounts').select('id')
        .eq('user_id', userId).eq('email_address', email).maybeSingle();
    if (error)
        throw new CredentialError('unavailable');
    const vault = getCredentialVault();
    const scope = { userId, accountId: account?.id || randomUUID() };
    let revision = 0, refreshToken = tokens.refresh_token;
    if (account) {
        const status = await vault.status(scope);
        revision = status.revision;
        if (status.state === 'ready' || (!refreshToken && status.state === 'legacy_pending')) {
            const previous = await vault.read(scope);
            if (previous.credentials.kind === 'google') {
                if (previous.credentials.googleSubject && previous.credentials.googleSubject !== profile.id) {
                    throw new GoogleGrantError('account_mismatch');
                }
                refreshToken ??= previous.credentials.refreshToken;
            }
        }
    }
    if (!refreshToken) throw new GoogleGrantError('offline_missing');
    await vault.write(scope, { kind: 'google', accessToken: tokens.access_token, refreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scope: tokens.scope,
        googleSubject: profile.id, sendDisabled: true }, revision,
    { email_address: email, display_name: profile.name, provider: 'gmail', avatar_url: profile.picture });
    return scope.accountId;
}

export class GoogleGrantError extends Error {
    constructor(readonly reason: 'scope_missing' | 'account_mismatch' | 'offline_missing') {
        super('Google authorization incomplete');
    }
}

export async function getGoogleSendTarget(userId: string, accountId: string) {
    const supabase = await createClient();
    const { data: account, error } = await supabase.from('source_accounts').select('email_address')
        .eq('user_id', userId).eq('id', accountId).eq('auth_type', 'oauth_google').eq('is_active', true).maybeSingle();
    if (error) throw new CredentialError('unavailable');
    if (!account) return null;
    const scope = { userId, accountId };
    const vault = getCredentialVault();
    const { credentials, revision } = await vault.read(scope);
    if (credentials.kind !== 'google') return null;
    return { email: account.email_address as string, scope, vault, credentials, revision };
}

type GoogleSendTarget = NonNullable<Awaited<ReturnType<typeof getGoogleSendTarget>>>;

function requireCombinedGrant(tokens: GoogleTokens) {
    if (!canReadGmail(tokens.scope) || !tokens.scope?.split(/\s+/).includes(gmailSendScope)) {
        throw new GoogleGrantError('scope_missing');
    }
}

export async function saveGoogleSendGrant(target: GoogleSendTarget, profile: GoogleUserInfo, tokens: GoogleTokens) {
    requireCombinedGrant(tokens);
    const { credentials } = target;
    if (!profile.verified_email || profile.email.toLowerCase() !== target.email.toLowerCase() ||
        (credentials.googleSubject && credentials.googleSubject !== profile.id)) {
        throw new GoogleGrantError('account_mismatch');
    }
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
        if (!credentials.refreshToken) throw new GoogleGrantError('offline_missing');
        // A reused refresh token must prove it can still obtain both grants.
        tokens = await refreshAccessToken(credentials.refreshToken);
        requireCombinedGrant(tokens);
        refreshToken = tokens.refresh_token ?? credentials.refreshToken;
    }
    await target.vault.write(target.scope, { ...credentials, accessToken: tokens.access_token, refreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scope: tokens.scope,
        googleSubject: profile.id, sendDisabled: false }, target.revision);
}
export async function saveImapConnection(userId: string, metadata: AccountMetadata, password: string) {
    const accountId = randomUUID();
    await getCredentialVault().write({ userId, accountId }, { kind: 'imap', password }, 0, metadata);
    return { id: accountId, email_address: metadata.email_address, display_name: metadata.display_name, provider: metadata.provider, is_active: true };
}
