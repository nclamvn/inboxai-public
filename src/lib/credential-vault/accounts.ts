import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import type { GoogleTokens, GoogleUserInfo } from '@/lib/oauth/google';
import { getCredentialVault, type AccountMetadata } from './vault';
import { CredentialError } from './crypto';
/** Metadata lookup is user scoped; the service RPC atomically writes account + envelope. */
export async function saveGoogleConnection(userId: string, profile: GoogleUserInfo, tokens: GoogleTokens) {
    const supabase = await createClient();
    const { data: account, error } = await supabase.from('source_accounts').select('id')
        .eq('user_id', userId).eq('email_address', profile.email).maybeSingle();
    if (error)
        throw new CredentialError('unavailable');
    const vault = getCredentialVault();
    const scope = { userId, accountId: account?.id || randomUUID() };
    let revision = 0, refreshToken = tokens.refresh_token;
    if (account) {
        const status = await vault.status(scope);
        revision = status.revision;
        if (!refreshToken && status.state !== 'missing') {
            const previous = await vault.read(scope);
            if (previous.credentials.kind === 'google')
                refreshToken = previous.credentials.refreshToken;
        }
    }
    await vault.write(scope, { kind: 'google', accessToken: tokens.access_token, refreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scope: tokens.scope }, revision, { email_address: profile.email, display_name: profile.name, provider: 'gmail', avatar_url: profile.picture });
    return scope.accountId;
}
export async function saveImapConnection(userId: string, metadata: AccountMetadata, password: string) {
    const accountId = randomUUID();
    await getCredentialVault().write({ userId, accountId }, { kind: 'imap', password }, 0, metadata);
    return { id: accountId, email_address: metadata.email_address, display_name: metadata.display_name, provider: metadata.provider, is_active: true };
}
