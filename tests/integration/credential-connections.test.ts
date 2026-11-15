import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), reconnect: vi.fn(), status: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), refresh: vi.fn(), expired: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) })) }));
vi.mock('@/lib/credential-vault/vault', () => ({ getCredentialVault: () => ({ read: mocks.read, write: mocks.write, reconnectGoogle: mocks.reconnect, status: mocks.status }) }));
vi.mock('@/lib/oauth/google', () => ({ refreshAccessToken: mocks.refresh, isTokenExpired: mocks.expired }));
import { saveGoogleConnection, saveImapConnection } from '@/lib/credential-vault/accounts';
import { getValidAccessToken } from '@/lib/gmail/sync';
import { gmailReadScope, gmailSendScope } from '@/lib/gmail/scopes';
const userId = '00000000-0000-0000-0000-000000000001';
const accountId = '10000000-0000-0000-0000-000000000001';
const profile = { id: 'synthetic', email: 'synthetic@example.test', name: 'Synthetic', picture: '', verified_email: true as const };
const credentials = { kind: 'google' as const, accessToken: 'old-access', refreshToken: 'retained-refresh', expiresAt: '2026-11-12T00:00:00Z' };
beforeEach(() => {
    for (const mock of Object.values(mocks))
        mock.mockReset();
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { id: accountId }, error: null });
    mocks.status.mockResolvedValue({ state: 'ready', revision: 3 });
    mocks.read.mockResolvedValue({ credentials, revision: 3 });
    mocks.write.mockResolvedValue(4);
    mocks.refresh.mockResolvedValue({ access_token: 'new-access', expires_in: 3600 });
});
it('preserves refresh token omitted by Google and binds metadata to owner', async () => {
    await saveGoogleConnection(userId, profile, { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer', scope: gmailReadScope });
    expect(mocks.eq).toHaveBeenCalledWith('user_id', userId);
    expect(mocks.write).toHaveBeenCalledWith({ userId, accountId }, expect.objectContaining({ refreshToken: 'retained-refresh', sendDisabled: true }), 3, expect.objectContaining({ email_address: profile.email }));
});
it('replaces an existing Google grant through the reconnect transaction when a fresh refresh token is issued', async () => {
    await saveGoogleConnection(userId, profile, { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600,
        scope: gmailReadScope });
    expect(mocks.reconnect).toHaveBeenCalledWith({ userId, accountId },
        expect.objectContaining({ refreshToken: 'new-refresh', sendDisabled: true }), 3,
        expect.objectContaining({ email_address: profile.email }));
    expect(mocks.write).not.toHaveBeenCalled();
});
it('propagates persistence failure instead of reporting a connected account', async () => {
    mocks.write.mockRejectedValue(new Error('synthetic-write-failure'));
    await expect(saveGoogleConnection(userId, profile, { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer', scope: gmailReadScope })).rejects.toThrow();
});
it('requires explicit migration when reconnect omits refresh for a legacy packet', async () => {
    mocks.status.mockResolvedValue({ state: 'legacy_pending', revision: 0 });
    mocks.read.mockRejectedValue(new Error('Credential migration required'));
    await expect(saveGoogleConnection(userId, profile, { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer', scope: gmailReadScope })).rejects.toThrow('migration required');
    expect(mocks.write).not.toHaveBeenCalled();
});
it('creates IMAP metadata and sealed payload in a single vault operation', async () => {
    const result = await saveImapConnection(userId, { email_address: profile.email, provider: 'custom' }, 'synthetic-password');
    expect(mocks.write).toHaveBeenCalledWith({ userId, accountId: result.id }, { kind: 'imap', password: 'synthetic-password' }, 0, expect.objectContaining({ email_address: profile.email }));
    expect(JSON.stringify(result)).not.toContain('synthetic-password');
});
it('reads a valid Google token from the scoped vault without refresh', async () => {
    mocks.expired.mockReturnValue(false);
    expect(await getValidAccessToken(userId, accountId)).toBe('old-access');
    expect(mocks.read).toHaveBeenCalledWith({ userId, accountId });
    expect(mocks.refresh).not.toHaveBeenCalled();
});
it('does not give sync a credential whose known grant allows sending but not reading', async () => {
    mocks.read.mockResolvedValue({ credentials: { ...credentials, scope: gmailSendScope }, revision: 3 });
    expect(await getValidAccessToken(userId, accountId)).toBeNull();
});
it('persists refreshed token with CAS while preserving refresh token', async () => {
    mocks.expired.mockReturnValue(true);
    expect(await getValidAccessToken(userId, accountId)).toBe('new-access');
    expect(mocks.write).toHaveBeenCalledWith({ userId, accountId }, expect.objectContaining({ accessToken: 'new-access', refreshToken: 'retained-refresh' }), 3);
});
it('does not return a refreshed token when persistence conflicts', async () => {
    mocks.expired.mockReturnValue(true);
    mocks.write.mockRejectedValue(new Error('Credential conflict'));
    expect(await getValidAccessToken(userId, accountId)).toBeNull();
});
it.each(['missing', 'legacy_pending', 'integrity'])('does not contact Google when vault rejects %s', async () => {
    mocks.read.mockRejectedValue(new Error('Credential unavailable'));
    expect(await getValidAccessToken(userId, accountId)).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
});
