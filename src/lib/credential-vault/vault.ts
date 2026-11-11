import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CredentialError, openCredentials, parseKeyring, readLegacyCredentials, sealCredentials, type Credentials, type CredentialScope, type Envelope, type Keyring } from './crypto';
type RpcClient = {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: {
            code?: string;
        } | null;
    }>;
};
const rowSchema = z.object({ revision: z.number().int().nonnegative(), kind: z.enum(['imap', 'google']).optional(),
    envelope: z.unknown().optional(), backup_kind: z.enum(['imap', 'google']).nullable().optional(),
    backup_envelope: z.unknown().nullable().optional(), legacy: z.record(z.string(), z.unknown()).optional() });
type Row = z.infer<typeof rowSchema>;
export type AccountMetadata = {
    email_address: string;
    display_name?: string;
    provider?: string;
    username?: string;
    imap_host?: string;
    imap_port?: number;
    imap_secure?: boolean;
    smtp_host?: string;
    smtp_port?: number;
    smtp_secure?: boolean;
    avatar_url?: string;
};
export class CredentialVault {
    constructor(private readonly client: RpcClient, private readonly ring: Keyring) { }
    private async rpc(name: string, args: Record<string, unknown>) {
        try {
            const result = await this.client.rpc(name, args);
            if (result.error)
                throw new CredentialError(result.error.code === 'PT409' ? 'conflict' : result.error.code === '42501' ? 'missing' : 'unavailable');
            return result.data;
        }
        catch (error) {
            if (error instanceof CredentialError)
                throw error;
            throw new CredentialError('unavailable');
        }
    }
    private async raw(scope: CredentialScope): Promise<Row | null> {
        const data = await this.rpc('read_account_credential', { p_user_id: scope.userId, p_account_id: scope.accountId });
        if (data === null)
            return null;
        const row = rowSchema.safeParse(data);
        if (!row.success)
            throw new CredentialError('integrity');
        return row.data;
    }
    private decode(row: Row, scope: CredentialScope) {
        if (row.legacy)
            throw new CredentialError('migration_required');
        const credentials = openCredentials(row.envelope, scope, this.ring);
        if (credentials.kind !== row.kind)
            throw new CredentialError('integrity');
        return credentials;
    }
    async status(scope: CredentialScope) {
        const row = await this.raw(scope);
        return { state: row?.legacy ? 'legacy_pending' : row ? 'ready' : 'missing', revision: row?.revision ?? 0,
            keyId: row?.envelope && typeof row.envelope === 'object' ? (row.envelope as Envelope).kid : undefined,
            backupKeyId: row?.backup_envelope && typeof row.backup_envelope === 'object' ? (row.backup_envelope as Envelope).kid : undefined };
    }
    async read(scope: CredentialScope) {
        const row = await this.raw(scope);
        if (!row)
            throw new CredentialError('missing');
        return { credentials: this.decode(row, scope), revision: row.revision };
    }
    private async commit(scope: CredentialScope, credentials: Credentials, envelope: Envelope, revision: number, operation: 'write' | 'migrate' | 'rotate' | 'restore', metadata?: AccountMetadata, backup?: Credentials) {
        const data = await this.rpc('store_account_credential', {
            p_user_id: scope.userId, p_account_id: scope.accountId, p_kind: credentials.kind, p_envelope: envelope,
            p_expected_revision: revision, p_operation: operation, p_metadata: metadata ?? null,
            p_backup_kind: backup?.kind ?? null, p_backup_envelope: backup ? sealCredentials(backup, scope, this.ring) : null,
        });
        if (typeof data !== 'number' || !Number.isSafeInteger(data) || data <= revision)
            throw new CredentialError('integrity');
        return data;
    }
    async write(scope: CredentialScope, credentials: Credentials, revision: number, metadata?: AccountMetadata) {
        return this.commit(scope, credentials, sealCredentials(credentials, scope, this.ring), revision, 'write', metadata);
    }
    async migrate(scope: CredentialScope, legacyKey?: string) {
        const row = await this.raw(scope);
        if (!row)
            throw new CredentialError('missing');
        if (!row.legacy) {
            this.decode(row, scope);
            return row.revision;
        }
        const credentials = readLegacyCredentials(row.legacy, legacyKey);
        const envelope = sealCredentials(credentials, scope, this.ring);
        // Verify before committing or removing the quarantined legacy packet.
        if (JSON.stringify(openCredentials(envelope, scope, this.ring)) !== JSON.stringify(credentials))
            throw new CredentialError('integrity');
        return this.commit(scope, credentials, envelope, row.revision, 'migrate');
    }
    async rotate(scope: CredentialScope) {
        const row = await this.raw(scope);
        if (!row)
            throw new CredentialError('missing');
        const credentials = this.decode(row, scope);
        const backup = row.backup_envelope ? openCredentials(row.backup_envelope, scope, this.ring) : undefined;
        if (backup && backup.kind !== row.backup_kind)
            throw new CredentialError('integrity');
        if ((row.envelope as Envelope).kid === this.ring.active && (!row.backup_envelope || (row.backup_envelope as Envelope).kid === this.ring.active))
            return row.revision;
        return this.commit(scope, credentials, sealCredentials(credentials, scope, this.ring), row.revision, 'rotate', undefined, backup);
    }
    async restorePrevious(scope: CredentialScope) {
        const row = await this.raw(scope);
        if (!row?.backup_envelope)
            throw new CredentialError('missing');
        const current = this.decode(row, scope);
        const backup = openCredentials(row.backup_envelope, scope, this.ring);
        if (backup.kind !== row.backup_kind)
            throw new CredentialError('integrity');
        return this.commit(scope, backup, sealCredentials(backup, scope, this.ring), row.revision, 'restore', undefined, current);
    }
    async jobs(after?: string) {
        const data = await this.rpc('list_credential_jobs', { p_after: after ?? null, p_limit: 50 });
        const result = z.array(z.object({ account_id: z.string().uuid(), user_id: z.string().uuid(), revision: z.number().int(),
            key_id: z.string().nullable(), backup_key_id: z.string().nullable(), legacy: z.boolean() })).max(50).safeParse(data);
        if (!result.success)
            throw new CredentialError('integrity');
        return result.data;
    }
}
export function getCredentialVault() {
    const ring = parseKeyring(process.env.CREDENTIAL_VAULT_KEYS, process.env.CREDENTIAL_VAULT_ACTIVE_KEY);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    });
    return new CredentialVault(client, ring);
}
export async function getImapPassword(userId: string, accountId: string) {
    const { credentials } = await getCredentialVault().read({ userId, accountId });
    if (credentials.kind !== 'imap')
        throw new CredentialError('unavailable');
    return credentials.password;
}
