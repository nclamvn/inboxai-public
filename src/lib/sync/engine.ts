import { cursorSchema, SyncError, type Scope, type SyncStore, type SyncProvider, type SyncOutcome } from './contracts';
/** One bounded lease. Page writes and checkpoint progression are one database transaction. */
export async function runSync(store: SyncStore, scope: Scope, factory: (signal: AbortSignal) => Promise<SyncProvider>, options: {
    limit?: number;
    fullSync?: boolean;
    maxPages?: number;
    timeoutMs?: number;
} = {}): Promise<SyncOutcome> {
    let lease, provider: SyncProvider | undefined;
    let synced = 0, processed = 0, pending = true;
    const signal = AbortSignal.timeout(Math.min(45000, Math.max(100, options.timeoutMs ?? 30000)));
    try {
        lease = await store.claim(scope);
        if (!lease)
            return { success: true, synced: 0, pending: true, busy: true };
        provider = await factory(signal);
        // Continue an incomplete scan instead of restarting on every fullSync request.
        let cursor = lease.cursor;
        if (options.fullSync && (cursor?.phase === 'idle' || (cursor?.phase === 'history' && !cursor.pageToken && !cursor.pending)))
            cursor = null;
        const budget = Math.min(500, Math.max(1, Number.isFinite(options.limit) ? Math.floor(options.limit!) : 200));
        const pages = Math.min(8, Math.max(1, Number.isFinite(options.maxPages) ? Math.floor(options.maxPages!) : 4));
        for (let n = 0; n < pages; n++) {
            if (processed >= budget)
                break;
            const size = Math.min(50, budget - processed);
            signal.throwIfAborted();
            const page = await provider.page(cursor, size, signal);
            cursorSchema.parse(page.cursor);
            if (page.cursor.provider !== scope.provider || page.messages.length > 50 || page.deleted.length > 5000 || !page.namespace ||
                (cursor && JSON.stringify(cursor) === JSON.stringify(page.cursor) && !page.complete))
                throw new SyncError('invalid');
            signal.throwIfAborted();
            // No commit retry here: an uncertain acknowledgement is recovered by a fresh lease/checkpoint.
            lease.revision = await store.commit(scope, lease, page);
            lease.cursor = page.cursor;
            synced += page.messages.length;
            processed += page.messages.length + page.deleted.length;
            cursor = page.cursor;
            pending = !page.complete;
            if (page.complete)
                break;
        }
        await store.release(scope, lease, { pending });
        return { success: true, synced, pending };
    }
    catch (error) {
        const code = signal.aborted ? 'timeout' : error instanceof SyncError ? error.code : 'unavailable';
        if (lease) {
            try {
                await store.release(scope, lease, { pending: true, error: code });
            }
            catch { }
        }
        return { success: false, synced, pending: true, error: `Sync ${code}` };
    }
    finally {
        if (provider) {
            try {
                await provider.close();
            }
            catch { }
        }
    }
}
