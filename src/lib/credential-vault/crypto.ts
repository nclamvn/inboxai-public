import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
export class CredentialError extends Error {
    constructor(public readonly code: 'configuration' | 'integrity' | 'unavailable' | 'conflict' | 'migration_required' | 'missing') {
        super(`Credential ${code.replaceAll('_', ' ')}`);
        this.name = 'CredentialError';
    }
}
const boundedSecret = z.string().min(1).max(16384);
export const credentialSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('imap'), password: z.string().min(1).max(4096) }).strict(),
    z.object({ kind: z.literal('google'), accessToken: boundedSecret, refreshToken: boundedSecret.optional(),
        expiresAt: z.string().datetime({ offset: true }), scope: z.string().max(4096).optional(),
        googleSubject: z.string().min(1).max(128).optional(), sendDisabled: z.boolean().optional() }).strict(),
]);
export type Credentials = z.infer<typeof credentialSchema>;
const idPattern = /^[A-Za-z0-9_-]{1,48}$/;
const b64 = (length: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).refine(value => Buffer.from(value, 'base64url').length === length && Buffer.from(value, 'base64url').toString('base64url') === value);
export const envelopeSchema = z.object({ v: z.literal(1), alg: z.literal('A256GCM'), kid: z.string().regex(idPattern),
    iv: b64(12), tag: b64(16), ct: z.string().min(1).max(65536).regex(/^[A-Za-z0-9_-]+$/) }).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export type CredentialScope = {
    userId: string;
    accountId: string;
};
export type Keyring = {
    active: string;
    keys: ReadonlyMap<string, Buffer>;
};
export function parseKeyring(raw: string | undefined, active: string | undefined): Keyring {
    try {
        const values: unknown = JSON.parse(raw || '');
        if (!values || typeof values !== 'object' || Array.isArray(values) || !active || !idPattern.test(active))
            throw 0;
        const entries = Object.entries(values);
        if (!entries.length || entries.length > 8)
            throw 0;
        const keys = new Map<string, Buffer>();
        const seen = new Set<string>();
        for (const [id, value] of entries) {
            if (!idPattern.test(id) || typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value) || seen.has(value.toLowerCase()))
                throw 0;
            keys.set(id, Buffer.from(value, 'hex'));
            seen.add(value.toLowerCase());
        }
        if (!keys.has(active))
            throw 0;
        return { active, keys };
    }
    catch {
        throw new CredentialError('configuration');
    }
}
function aad(scope: CredentialScope, kid: string) {
    if (!scope.userId || !scope.accountId)
        throw new CredentialError('integrity');
    return Buffer.from(JSON.stringify(['inboxai.account.credentials', 1, 'A256GCM', kid, scope.userId, scope.accountId]));
}
export function sealCredentials(value: Credentials, scope: CredentialScope, ring: Keyring): Envelope {
    const parsed = credentialSchema.safeParse(value);
    if (!parsed.success)
        throw new CredentialError('integrity');
    const key = ring.keys.get(ring.active);
    if (!key || key.length !== 32)
        throw new CredentialError('configuration');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(aad(scope, ring.active));
    const ct = Buffer.concat([cipher.update(JSON.stringify(parsed.data), 'utf8'), cipher.final()]);
    return { v: 1, alg: 'A256GCM', kid: ring.active, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ct: ct.toString('base64url') };
}
export function openCredentials(value: unknown, scope: CredentialScope, ring: Keyring): Credentials {
    try {
        const env = envelopeSchema.parse(value);
        const key = ring.keys.get(env.kid);
        if (!key || key.length !== 32)
            throw 0;
        const ct = Buffer.from(env.ct, 'base64url');
        if (ct.toString('base64url') !== env.ct)
            throw 0;
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64url'), { authTagLength: 16 });
        decipher.setAAD(aad(scope, env.kid));
        decipher.setAuthTag(Buffer.from(env.tag, 'base64url'));
        const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
        try {
            return credentialSchema.parse(JSON.parse(plaintext.toString('utf8')));
        }
        finally {
            plaintext.fill(0);
        }
    }
    catch {
        throw new CredentialError('integrity');
    }
}
/** Exact legacy text-key semantics, used only by explicit migration, never hot reads. */
export function readLegacyCredentials(packet: Record<string, unknown>, legacyKey?: string): Credentials {
    const text = (field: string) => typeof packet[field] === 'string' && packet[field] ? packet[field] as string : undefined;
    const pick = (a: string, b: string) => {
        const left = text(a), right = text(b);
        if (left && right && left !== right)
            throw new CredentialError('conflict');
        return left || right;
    };
    const accessToken = pick('access_token', 'oauth_access_token');
    const refreshToken = pick('refresh_token', 'oauth_refresh_token');
    const encrypted = text('password_encrypted'), plain = text('email_password');
    if ((accessToken || refreshToken) && (encrypted || plain))
        throw new CredentialError('conflict');
    if (accessToken) {
        const expiresAt = pick('token_expires_at', 'oauth_expires_at');
        const parsed = credentialSchema.safeParse({ kind: 'google', accessToken, refreshToken, expiresAt, scope: text('oauth_scope') });
        if (!parsed.success)
            throw new CredentialError('conflict');
        return parsed.data;
    }
    if (refreshToken)
        throw new CredentialError('conflict');
    let password = plain;
    if (encrypted) {
        if (!legacyKey)
            throw new CredentialError('configuration');
        try {
            const parts = encrypted.split(':');
            if (parts.length !== 2 || !/^[a-f0-9]{32}$/i.test(parts[0]) || !/^([a-f0-9]{32})+$/i.test(parts[1]))
                throw 0;
            const decipher = createDecipheriv('aes-256-cbc', Buffer.from(legacyKey.padEnd(32).slice(0, 32)), Buffer.from(parts[0], 'hex'));
            const decoded = Buffer.concat([decipher.update(Buffer.from(parts[1], 'hex')), decipher.final()]);
            try {
                const candidate = decoded.toString('utf8');
                if (password && password !== candidate)
                    throw new CredentialError('conflict');
                password = candidate;
            }
            finally {
                decoded.fill(0);
            }
        }
        catch (error) {
            if (error instanceof CredentialError)
                throw error;
            throw new CredentialError('integrity');
        }
    }
    const parsed = credentialSchema.safeParse({ kind: 'imap', password });
    if (!parsed.success)
        throw new CredentialError('missing');
    return parsed.data;
}
