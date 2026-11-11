import { beforeEach, expect, it, vi } from 'vitest';
import { CredentialVault } from '@/lib/credential-vault/vault';
import { openCredentials, parseKeyring, sealCredentials } from '@/lib/credential-vault/crypto';
const scope = { userId: '00000000-0000-0000-0000-000000000001', accountId: '10000000-0000-0000-0000-000000000001' };
const old = parseKeyring(JSON.stringify({ old: '11'.repeat(32) }), 'old');
const next = parseKeyring(JSON.stringify({ old: '11'.repeat(32), next: '22'.repeat(32) }), 'next');
const rpc = vi.fn();
beforeEach(() => rpc.mockReset());
it('never falls back to a legacy password on a hot read', async () => {
    rpc.mockResolvedValue({ data: { revision: 0, legacy: { email_password: 'must-not-read' } }, error: null });
    await expect(new CredentialVault({ rpc }, old).read(scope)).rejects.toThrow('Credential migration required');
    expect(rpc).toHaveBeenCalledTimes(1);
});
it('seals data before it crosses the persistence boundary', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await new CredentialVault({ rpc }, old).write(scope, { kind: 'imap', password: 'must-not-send-plaintext' }, 0);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('must-not-send-plaintext');
    const args = rpc.mock.calls[0][1];
    expect(args.p_user_id).toBe(scope.userId);
    expect(args.p_account_id).toBe(scope.accountId);
    expect(openCredentials(args.p_envelope, scope, old)).toEqual({ kind: 'imap', password: 'must-not-send-plaintext' });
});
it('preserves a legacy packet when migration fails or input conflicts', async () => {
    rpc.mockResolvedValue({ data: { revision: 0, legacy: { access_token: 'first', oauth_access_token: 'other' } }, error: null });
    await expect(new CredentialVault({ rpc }, old).migrate(scope)).rejects.toThrow('Credential conflict');
    expect(rpc).toHaveBeenCalledTimes(1);
});
it('rotates both the current value and rollback snapshot', async () => {
    rpc.mockResolvedValueOnce({ data: { revision: 2, kind: 'imap', envelope: sealCredentials({ kind: 'imap', password: 'current' }, scope, old),
            backup_kind: 'imap', backup_envelope: sealCredentials({ kind: 'imap', password: 'previous' }, scope, old) }, error: null }).mockResolvedValueOnce({ data: 3, error: null });
    await new CredentialVault({ rpc }, next).rotate(scope);
    const args = rpc.mock.calls[1][1];
    const onlyNewKey = parseKeyring(JSON.stringify({ next: '22'.repeat(32) }), 'next');
    expect(openCredentials(args.p_envelope, scope, onlyNewKey)).toEqual({ kind: 'imap', password: 'current' });
    expect(openCredentials(args.p_backup_envelope, scope, onlyNewKey)).toEqual({ kind: 'imap', password: 'previous' });
    expect(args.p_expected_revision).toBe(2);
});
it('reports CAS conflicts without logging/returning database details', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'secret should not surface' } });
    await expect(new CredentialVault({ rpc }, old).write(scope, { kind: 'imap', password: 'synthetic' }, 0)).rejects.toThrow('Credential conflict');
});
