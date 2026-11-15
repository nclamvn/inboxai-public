import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { cursorSchema, SyncError, type Scope, type Lease, type Page, type SyncStore } from './contracts';
type Client = {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: {
            code?: string;
        } | null;
    }>;
};
export class DatabaseSyncStore implements SyncStore {
    constructor(private client: Client) { }
    private async rpc(name: string, args: Record<string, unknown>) {
        try {
            const r = await this.client.rpc(name, args);
            if (r.error)
                throw new SyncError(r.error.code === 'PT409' ? 'conflict' : 'unavailable');
            return r.data;
        }
        catch (e) {
            if (e instanceof SyncError)
                throw e;
            throw new SyncError('unavailable');
        }
    }
    private scope(scope: Scope) { return { p_user_id: scope.userId, p_account_id: scope.accountId }; }
    async claim(scope: Scope): Promise<Lease | null> {
        const data = await this.rpc('claim_account_sync', { ...this.scope(scope), p_provider: scope.provider });
        if (data === null)
            return null;
        const row = z.object({ id: z.string().uuid(), fence: z.number().int().positive(), revision: z.number().int().nonnegative(), cursor: cursorSchema.nullable() }).safeParse(data);
        if (!row.success)
            throw new SyncError('invalid');
        return row.data;
    }
    async commit(scope: Scope, lease: Lease, page: Page) {
        const revision = await this.rpc('commit_account_sync_page', { ...this.scope(scope), p_lease: lease.id, p_fence: lease.fence, p_revision: lease.revision,
            p_cursor: page.cursor, p_namespace: page.namespace, p_messages: page.messages, p_deleted: page.deleted, p_generation: page.generation ?? null, p_finalize: page.finalize ?? false });
        if (typeof revision !== 'number' || revision !== lease.revision + 1)
            throw new SyncError('invalid');
        return revision;
    }
    async release(scope: Scope, lease: Lease, outcome: {
        pending: boolean;
        error?: SyncError['code'];
    }) {
        await this.rpc('release_account_sync', { ...this.scope(scope), p_lease: lease.id, p_fence: lease.fence, p_pending: outcome.pending, p_error: outcome.error ?? null });
    }
}
export function getSyncStore() {
    return new DatabaseSyncStore(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    }));
}
