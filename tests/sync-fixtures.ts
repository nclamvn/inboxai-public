import { randomUUID } from 'node:crypto';
import { GmailReadError, type GmailReader, type History } from '../src/lib/sync/gmail-provider';
import type { GmailMessage } from '../src/lib/gmail/api';
import type { ImapReader } from '../src/lib/sync/imap-provider';
import { SyncError, type SyncMessage } from '../src/lib/sync/contracts';
export const syntheticMessage = (uid: string): SyncMessage => ({ uid, message_id: 'shared-rfc-id@example.test', from_address: 'synthetic@example.test', subject: `Synthetic ${uid}`,
    body_text: `Body ${uid}`, body_html: null, received_at: '2026-11-11T00:00:00Z', is_read: false, is_starred: false, is_archived: false, is_deleted: false, direction: 'inbound',
    attachments: [{ part_key: '0', filename: 'same.txt', content_type: 'text/plain', size: 3 }, { part_key: '1', filename: 'same.txt', content_type: 'text/plain', size: 4 }] });
export class FakeGmail implements GmailReader {
    data = new Map<string, GmailMessage>();
    calls: string[] = [];
    changes: History = { historyId: '101', history: [] };
    expired = false;
    failMessage?: string;
    failList?: string;
    constructor(count = 121) {
        for (let n = 1; n <= count; n++) {
            const id = String(n);
            this.data.set(id, { id, threadId: id, labelIds: ['INBOX', 'UNREAD'], snippet: 'synthetic',
                internalDate: '1794355200000', payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Synthetic <synthetic@example.test>' }, { name: 'Message-ID', value: 'same-rfc@example.test' }], body: { data: Buffer.from(`Body ${n}`).toString('base64url') } } });
        }
    }
    async profile() { this.calls.push('profile'); return { historyId: '100' }; }
    async list(page: string | undefined, size: number) {
        this.calls.push(`list:${page ?? '0'}`);
        if (this.failList !== undefined && this.failList === page)
            throw new GmailReadError(503);
        const start = Number(page || 0), ids = [...this.data.keys()];
        return { messages: ids.slice(start, start + size).map(id => ({ id })), nextPageToken: start + size < ids.length ? String(start + size) : undefined };
    }
    async history(start: string, page: string | undefined) { this.calls.push(`history:${start}:${page ?? '0'}`); if (this.expired) {
        this.expired = false;
        throw new GmailReadError(404);
    } return this.changes; }
    async message(id: string) { this.calls.push(`message:${id}`); if (this.failMessage === id)
        throw new GmailReadError(503); const m = this.data.get(id); if (!m)
        throw new GmailReadError(404); return structuredClone(m); }
}
export class FakeImap implements ImapReader {
    validity = '123';
    data = new Map<number, SyncMessage>();
    failUid?: number;
    calls: number[][] = [];
    closed = false;
    constructor(uids: number[] = [1, 2, 3]) { for (const uid of uids)
        this.data.set(uid, syntheticMessage(String(uid))); }
    async status() { return { validity: this.validity, uidNext: Math.max(0, ...this.data.keys()) + 1 }; }
    async search(from: number, to: number) { return [...this.data.keys()].filter(uid => uid >= from && uid <= to); }
    async messages(uids: number[]) { this.calls.push(uids); if (this.failUid !== undefined && uids.includes(this.failUid))
        throw new SyncError('provider'); return uids.flatMap(uid => this.data.has(uid) ? [structuredClone(this.data.get(uid)!)] : []); }
    async close() { this.closed = true; }
}
export const syntheticScope = (provider: 'gmail' | 'imap' = 'gmail') => ({ userId: randomUUID(), accountId: randomUUID(), provider });
