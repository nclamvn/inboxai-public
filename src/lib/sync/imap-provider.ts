import { randomUUID } from 'node:crypto';
import { SyncError, type Cursor, type Page, type SyncMessage, type SyncProvider } from './contracts';
export interface ImapReader {
    status(signal: AbortSignal): Promise<{
        validity: string;
        uidNext: number;
    }>;
    search(from: number, to: number, signal: AbortSignal): Promise<number[]>;
    messages(uids: number[], signal: AbortSignal): Promise<SyncMessage[]>;
    close(): Promise<void>;
}
export function imapProvider(api: ImapReader): SyncProvider {
    return {
        close: () => api.close(),
        async page(input: Cursor | null, size: number, signal: AbortSignal): Promise<Page> {
            if (input && input.provider !== 'imap')
                throw new SyncError('invalid');
            const status = await api.status(signal);
            if (!/^\d+$/.test(status.validity) || !Number.isSafeInteger(status.uidNext) || status.uidNext < 1 || status.uidNext > 4294967296)
                throw new SyncError('invalid');
            let cursor = input as Extract<Cursor, {
                provider: 'imap';
            }> | null;
            if (!cursor || cursor.validity !== status.validity || cursor.phase === 'idle')
                cursor = { provider: 'imap', phase: 'scan', validity: status.validity, upper: status.uidNext - 1, after: 0, generation: randomUUID() };
            const end = Math.min(cursor.upper, cursor.after + 500);
            // Numeric bounded ranges avoid the IMAP n:* edge case returning an older last UID.
            const uids = cursor.after < end ? await api.search(cursor.after + 1, end, signal) : [];
            if (uids.length > 500 || uids.some(uid => !Number.isSafeInteger(uid) || uid <= cursor.after || uid > end))
                throw new SyncError('invalid');
            const selected = [...new Set(uids)].sort((a, b) => a - b).slice(0, size);
            const messages = selected.length ? await api.messages(selected, signal) : [];
            if ((await api.status(signal)).validity !== cursor.validity)
                throw new SyncError('provider');
            const found = new Set(messages.map(m => Number(m.uid)));
            if (found.size !== messages.length || messages.some(m => !selected.includes(Number(m.uid))))
                throw new SyncError('invalid');
            // A message missing after SEARCH is a concurrent expunge; it is not silently skipped
            // on transport/parse failure (the adapter throws for those failures).
            const deleted = selected.filter(uid => !found.has(uid)).map(String);
            const after = selected.length < size ? end : selected.at(-1)!;
            const complete = after >= cursor.upper;
            return { namespace: `INBOX:${cursor.validity}`, generation: cursor.generation, messages, deleted, finalize: complete, complete,
                cursor: complete ? { provider: 'imap', phase: 'idle', validity: cursor.validity } : { ...cursor, after } };
        },
    };
}
