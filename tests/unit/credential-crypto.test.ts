import { createCipheriv } from 'node:crypto';
import { expect, it } from 'vitest';
import { CredentialError, openCredentials, parseKeyring, readLegacyCredentials, sealCredentials } from '@/lib/credential-vault/crypto';
const scope = { userId: '00000000-0000-0000-0000-000000000001', accountId: '10000000-0000-0000-0000-000000000001' };
const ring = parseKeyring(JSON.stringify({ k1: '11'.repeat(32), k2: '22'.repeat(32) }), 'k1');
it.each([
    { kind: 'imap' as const, password: 'Mật khẩu giả lập 🔐' },
    { kind: 'google' as const, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: '2026-11-12T00:00:00Z', scope: 'gmail.readonly' },
])('roundtrips and conceals $kind credentials', credentials => {
    const envelope = sealCredentials(credentials, scope, ring);
    expect(openCredentials(envelope, scope, ring)).toEqual(credentials);
    expect(JSON.stringify(envelope)).not.toContain(credentials.kind === 'imap' ? credentials.password : credentials.accessToken);
    expect(envelope.iv).not.toBe(sealCredentials(credentials, scope, ring).iv);
});
it.each(['ct', 'iv', 'tag', 'kid', 'v', 'alg', 'extra'])('rejects modified %s without exposing values', field => {
    const envelope = sealCredentials({ kind: 'imap', password: 'synthetic-secret' }, scope, ring);
    const mutated = { ...envelope, [field]: field === 'kid' ? 'k2' : field === 'v' ? 2 : 'tampered' };
    expect(() => openCredentials(mutated, scope, ring)).toThrow('Credential integrity');
});
it.each([{ ...scope, userId: 'different-user' }, { ...scope, accountId: 'different-account' }])('rejects account/tenant envelope swaps %j', target => {
    expect(() => openCredentials(sealCredentials({ kind: 'imap', password: 'synthetic' }, scope, ring), target, ring)).toThrow(CredentialError);
});
it.each([undefined, '{}', '[]', '{"k1":"short"}', '{"k1":"zzzz"}'])('fails closed for invalid key configuration %j', config => {
    expect(() => parseKeyring(config, 'k1')).toThrow('Credential configuration');
});
it('does not silently select a default or duplicate key alias', () => {
    expect(() => parseKeyring(JSON.stringify({ k1: '11'.repeat(32) }), undefined)).toThrow();
    expect(() => parseKeyring(JSON.stringify({ k1: '11'.repeat(32), k2: '11'.repeat(32) }), 'k2')).toThrow();
});
it('reads old envelopes only while the matching key is retained', () => {
    const envelope = sealCredentials({ kind: 'imap', password: 'synthetic' }, scope, ring);
    expect(() => openCredentials(envelope, scope, parseKeyring(JSON.stringify({ k2: '22'.repeat(32) }), 'k2'))).toThrow();
});
it('migrates the exact legacy CBC text-key convention rather than decoding its hex', () => {
    const legacyKey = '1234567890abcdef'.repeat(4);
    const iv = Buffer.alloc(16, 7);
    const cipher = createCipheriv('aes-256-cbc', Buffer.from(legacyKey.slice(0, 32)), iv);
    const ct = Buffer.concat([cipher.update('legacy-synthetic-password'), cipher.final()]);
    const packet = { password_encrypted: `${iv.toString('hex')}:${ct.toString('hex')}` };
    expect(readLegacyCredentials(packet, legacyKey)).toEqual({ kind: 'imap', password: 'legacy-synthetic-password' });
    expect(() => readLegacyCredentials(packet)).toThrow('Credential configuration');
});
it('rejects conflicting OAuth families and mixed auth kinds', () => {
    expect(() => readLegacyCredentials({ access_token: 'a', oauth_access_token: 'b' })).toThrow('Credential conflict');
    expect(() => readLegacyCredentials({ access_token: 'a', email_password: 'p' })).toThrow('Credential conflict');
});
it('migrates either historical OAuth family without dropping refresh tokens', () => {
    const expected = { kind: 'google', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: '2026-11-12T00:00:00Z' };
    expect(readLegacyCredentials({ oauth_access_token: expected.accessToken, oauth_refresh_token: expected.refreshToken, oauth_expires_at: expected.expiresAt })).toEqual(expected);
    expect(readLegacyCredentials({ access_token: expected.accessToken, refresh_token: expected.refreshToken, token_expires_at: expected.expiresAt })).toEqual(expected);
});
