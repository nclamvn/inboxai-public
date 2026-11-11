import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CredentialVault } from '../src/lib/credential-vault/vault';
import { CredentialError, parseKeyring } from '../src/lib/credential-vault/crypto';
// Deliberately local-only. Never accepts key material in command-line arguments.
export async function maintainVault(args: string[]) {
    const action = args[0];
    if (!['inventory', 'migrate', 'rotate', 'restore'].includes(action))
        throw new Error('Use inventory|migrate|rotate|restore [--apply] [--user UUID --account UUID] [--after UUID]');
    const flags = new Map<string, string>();
    let apply = false;
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--apply') {
            apply = true;
            continue;
        }
        if (!['--user', '--account', '--after'].includes(args[i]) || !args[i + 1] || flags.has(args[i]))
            throw new Error('Invalid maintenance arguments');
        flags.set(args[i], z.string().uuid().parse(args[++i]));
    }
    if (flags.has('--user') !== flags.has('--account') || (action === 'restore' && !flags.has('--account')))
        throw new Error('An explicit user/account scope is required');
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.pathname !== '/') {
        throw new Error('Vault maintenance is restricted to local Supabase');
    }
    const ring = parseKeyring(process.env.CREDENTIAL_VAULT_KEYS, process.env.CREDENTIAL_VAULT_ACTIVE_KEY);
    const client = createClient(url.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }) },
    });
    const vault = new CredentialVault(client, ring);
    const jobs = flags.has('--account') ? [{ user_id: flags.get('--user')!, account_id: flags.get('--account')! }] : await vault.jobs(flags.get('--after'));
    const results: Array<{
        accountId: string;
        status: string;
        revision?: number;
        keyId?: string | null;
        backupKeyId?: string | null;
    }> = [];
    for (const job of jobs) {
        if (!apply || action === 'inventory') {
            const status = await vault.status({ userId: job.user_id, accountId: job.account_id });
            results.push({ accountId: job.account_id, status: status.state, revision: status.revision, keyId: status.keyId ?? null,
                backupKeyId: status.backupKeyId ?? null });
            continue;
        }
        try {
            const scope = { userId: job.user_id, accountId: job.account_id };
            const revision = action === 'migrate' ? await vault.migrate(scope, process.env.ENCRYPTION_KEY)
                : action === 'rotate' ? await vault.rotate(scope) : await vault.restorePrevious(scope);
            results.push({ accountId: job.account_id, status: 'complete', revision });
        }
        catch (error) {
            results.push({ accountId: job.account_id, status: error instanceof CredentialError ? error.code : 'unavailable' });
        }
    }
    // One bounded page per invocation. Resume explicitly with the returned cursor.
    return { action, apply, processed: results.length, results, nextCursor: jobs.length === 50 ? jobs.at(-1)?.account_id : null };
}
maintainVault(process.argv.slice(2)).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.results.some(row => !['complete', 'ready', 'missing', 'legacy_pending'].includes(row.status)))
        process.exitCode = 1;
}).catch(error => {
    console.error(error instanceof CredentialError ? error.message : 'Vault maintenance failed: invalid local configuration or arguments');
    process.exitCode = 1;
});
