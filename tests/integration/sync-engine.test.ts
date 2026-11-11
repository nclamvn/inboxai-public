import { expect, it, vi } from 'vitest';
import { runSync } from '@/lib/sync/engine';
import { gmailProvider } from '@/lib/sync/gmail-provider';
import { imapProvider } from '@/lib/sync/imap-provider';
import { SyncError, type SyncStore, type Page, type Cursor } from '@/lib/sync/contracts';
import { FakeGmail, FakeImap, syntheticScope } from '../sync-fixtures';
function memoryStore() {
    let cursor: Cursor | null = null, revision = 0;
    const saved: Page[] = [];
    const store: SyncStore = { claim: vi.fn(async () => ({ id: 'synthetic', fence: 1, revision, cursor })),
        commit: vi.fn(async (_scope, _lease, page) => { saved.push(structuredClone(page)); cursor = page.cursor; return ++revision; }), release: vi.fn(async () => { }) };
    return { store, saved, cursor: () => cursor };
}
it('resumes all Gmail list pages after a bounded invocation', async () => {
    const db = memoryStore(), api = new FakeGmail(), scope = syntheticScope();
    expect(await runSync(db.store, scope, async () => gmailProvider(api), { maxPages: 1 })).toMatchObject({ pending: true, synced: 50 });
    expect(await runSync(db.store, scope, async () => gmailProvider(api))).toMatchObject({ success: true, pending: false, synced: 71 });
    expect(new Set(db.saved.flatMap(p => p.messages.map(m => m.uid))).size).toBe(121);
    expect(api.calls.filter(c => c === 'profile')).toHaveLength(1);
    expect(db.cursor()).toEqual({ provider: 'gmail', phase: 'history', historyId: '101' });
});
it('does not advance a cursor when any message fetch fails', async () => {
    const db = memoryStore(), api = new FakeGmail(20);
    api.failMessage = '9';
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api))).toMatchObject({ success: false, error: 'Sync provider' });
    expect(db.saved).toHaveLength(0);
    api.failMessage = undefined;
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api))).toMatchObject({ success: true, synced: 20 });
});
it('leaves progress before a failed database page and never claims success', async () => {
    const db = memoryStore(), api = new FakeGmail();
    vi.mocked(db.store.commit).mockRejectedValueOnce(new SyncError('unavailable'));
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api))).toMatchObject({ success: false, synced: 0 });
    expect(db.cursor()).toBeNull();
    expect(db.store.release).toHaveBeenCalledWith(expect.anything(), expect.anything(), { pending: true, error: 'unavailable' });
});
it('does not contact a provider when lease/backoff is busy', async () => {
    const db = memoryStore(), factory = vi.fn();
    vi.mocked(db.store.claim).mockResolvedValue(null);
    expect(await runSync(db.store, syntheticScope(), factory)).toMatchObject({ busy: true, pending: true });
    expect(factory).not.toHaveBeenCalled();
});
it('drains an oversized history record in durable chunks across restarts', async () => {
    const db = memoryStore(), api = new FakeGmail(125), scope = syntheticScope();
    await runSync(db.store, scope, async () => gmailProvider(api));
    api.changes = { historyId: '200', history: [{ labelsAdded: [...api.data.keys()].map(id => ({ message: { id } })) }] };
    await runSync(db.store, scope, async () => gmailProvider(api), { maxPages: 1 });
    const intermediate = db.cursor();
    expect(intermediate).toMatchObject({ historyId: '101', pending: expect.any(Array) });
    const r = await runSync(db.store, scope, async () => gmailProvider(api));
    expect(r).toMatchObject({ success: true, pending: false, synced: 75 });
    expect(db.cursor()).toEqual({ provider: 'gmail', phase: 'history', historyId: '200' });
});
it('recovers expired Gmail history with a full reconciliation', async () => {
    const db = memoryStore(), api = new FakeGmail(2), scope = syntheticScope();
    await runSync(db.store, scope, async () => gmailProvider(api));
    api.expired = true;
    expect(await runSync(db.store, scope, async () => gmailProvider(api))).toMatchObject({ success: true, pending: false, synced: 2 });
    expect(api.calls.filter(c => c === 'profile')).toHaveLength(2);
    expect(db.saved.filter(p => p.finalize)).toHaveLength(2);
});
it('converts 404 message fetches to scoped tombstones and propagates other failures', async () => {
    const db = memoryStore(), api = new FakeGmail(2);
    vi.spyOn(api, 'list').mockResolvedValue({ messages: [{ id: 'missing' }], nextPageToken: undefined });
    await runSync(db.store, syntheticScope(), async () => gmailProvider(api));
    expect(db.saved[0].deleted).toEqual(['missing']);
});
it('keeps history start ID until the final history page', async () => {
    const db = memoryStore(), api = new FakeGmail(1), scope = syntheticScope();
    await runSync(db.store, scope, async () => gmailProvider(api));
    vi.spyOn(api, 'history').mockResolvedValueOnce({ historyId: '300', nextPageToken: 'p2', history: [] }).mockResolvedValueOnce({ historyId: '301', history: [] });
    await runSync(db.store, scope, async () => gmailProvider(api), { maxPages: 1 });
    expect(db.cursor()).toEqual({ provider: 'gmail', phase: 'history', historyId: '101', pageToken: 'p2' });
    await runSync(db.store, scope, async () => gmailProvider(api));
    expect(db.cursor()).toEqual({ provider: 'gmail', phase: 'history', historyId: '301' });
});
it('rejects repeated page tokens instead of looping or skipping', async () => {
    const db = memoryStore(), api = new FakeGmail(2);
    vi.spyOn(api, 'list').mockResolvedValue({ messages: [{ id: '1' }], nextPageToken: 'same' });
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api))).toMatchObject({ success: false, error: 'Sync invalid' });
    expect(db.saved).toHaveLength(1);
});
it('processes IMAP UIDs ascending without skipping overflow', async () => {
    const db = memoryStore(), api = new FakeImap(Array.from({ length: 121 }, (_, n) => n + 1)), scope = syntheticScope('imap');
    await runSync(db.store, scope, async () => imapProvider(api), { maxPages: 1 });
    expect(db.cursor()).toMatchObject({ after: 50 });
    expect(await runSync(db.store, scope, async () => imapProvider(api))).toMatchObject({ success: true, pending: false, synced: 71 });
    expect(new Set(db.saved.flatMap(p => p.messages.map(m => m.uid))).size).toBe(121);
});
it('restarts an IMAP epoch without reusing an old UID identity', async () => {
    const db = memoryStore(), api = new FakeImap(), scope = syntheticScope('imap');
    await runSync(db.store, scope, async () => imapProvider(api), { limit: 1, maxPages: 1 });
    api.validity = '456';
    api.data.delete(2);
    await runSync(db.store, scope, async () => imapProvider(api));
    expect(db.saved.at(-1)).toMatchObject({ namespace: 'INBOX:456', finalize: true });
    expect(db.cursor()).toEqual({ provider: 'imap', phase: 'idle', validity: '456' });
});
it('preserves the IMAP checkpoint on parse/transport errors', async () => {
    const db = memoryStore(), api = new FakeImap();
    api.failUid = 2;
    expect(await runSync(db.store, syntheticScope('imap'), async () => imapProvider(api))).toMatchObject({ success: false });
    expect(db.saved).toHaveLength(0);
    expect(api.closed).toBe(true);
});
it('bounds sparse UID scans and completes an empty mailbox', async () => {
    const db = memoryStore(), api = new FakeImap([5001]), scope = syntheticScope('imap');
    expect(await runSync(db.store, scope, async () => imapProvider(api))).toMatchObject({ pending: true, synced: 0 });
    expect(db.cursor()).toMatchObject({ after: 2000 });
    const empty = memoryStore();
    expect(await runSync(empty.store, scope, async () => imapProvider(new FakeImap([])))).toMatchObject({ success: true, pending: false, synced: 0 });
});
it('does not persist a provider result after the execution deadline', async () => {
    const db = memoryStore();
    const provider = { page: async () => { await new Promise(r => setTimeout(r, 110)); return { cursor: { provider: 'gmail', phase: 'history', historyId: '2' }, namespace: 'gmail', messages: [], deleted: [], complete: true } as Page; }, close: vi.fn() };
    expect(await runSync(db.store, syntheticScope(), async () => provider, { timeoutMs: 100 })).toMatchObject({ success: false, error: 'Sync timeout' });
    expect(db.saved).toHaveLength(0);
});
it('rejects an IMAP epoch change during a page before persistence', async () => {
    const db = memoryStore(), api = new FakeImap([1]);
    vi.spyOn(api, 'messages').mockImplementation(async () => { api.validity = '456'; return [...api.data.values()]; });
    expect(await runSync(db.store, syntheticScope('imap'), async () => imapProvider(api))).toMatchObject({ success: false, error: 'Sync provider' });
    expect(db.saved).toHaveLength(0);
});
it('rejects a wrong Gmail message ID before advancing the page', async () => {
    const db = memoryStore(), api = new FakeGmail(1);
    const message = await api.message('1');
    message.id = 'different';
    vi.spyOn(api, 'message').mockResolvedValue(message);
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api))).toMatchObject({ success: false, error: 'Sync invalid' });
    expect(db.saved).toHaveLength(0);
});
it('keeps the requested message budget as a per-invocation bound', async () => {
    const db = memoryStore(), api = new FakeGmail(121);
    expect(await runSync(db.store, syntheticScope(), async () => gmailProvider(api), { limit: 30 })).toMatchObject({ success: true, synced: 30, pending: true });
    expect(db.saved).toHaveLength(1);
    expect(db.cursor()).toMatchObject({ pageToken: '30' });
});
it('fullSync preserves an unfinished history worklist', async () => {
    const db = memoryStore(), api = new FakeGmail(121), scope = syntheticScope();
    await runSync(db.store, scope, async () => gmailProvider(api));
    api.changes = { historyId: '200', history: [{ labelsAdded: [...api.data.keys()].map(id => ({ message: { id } })) }] };
    await runSync(db.store, scope, async () => gmailProvider(api), { maxPages: 1 });
    const profiles = api.calls.filter(c => c === 'profile').length;
    expect(await runSync(db.store, scope, async () => gmailProvider(api), { fullSync: true })).toMatchObject({ success: true, synced: 71, pending: false });
    expect(api.calls.filter(c => c === 'profile')).toHaveLength(profiles);
});
