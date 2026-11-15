import { z } from 'zod';
export class SyncError extends Error {
    constructor(public readonly code: 'unavailable' | 'conflict' | 'provider' | 'credentials' | 'invalid' | 'timeout') { super(`Sync ${code}`); }
}
const token = z.string().min(1).max(4096);
const decimal = z.string().regex(/^\d+$/).max(30);
export const cursorSchema = z.discriminatedUnion('phase', [
    z.object({ provider: z.literal('gmail'), phase: z.literal('full'), anchor: decimal, generation: z.string().uuid(), pageToken: token.optional() }).strict(),
    z.object({ provider: z.literal('gmail'), phase: z.literal('history'), historyId: decimal, pageToken: token.optional(), pending: z.array(z.string().min(1).max(256)).max(5000).optional(), resumePageToken: token.optional(), endHistoryId: decimal.optional() }).strict(),
    z.object({ provider: z.literal('imap'), phase: z.literal('scan'), validity: decimal, upper: z.number().int().min(0).max(4294967295), after: z.number().int().min(0).max(4294967295), generation: z.string().uuid() }).strict(),
    z.object({ provider: z.literal('imap'), phase: z.literal('idle'), validity: decimal }).strict(),
]);
export type Cursor = z.infer<typeof cursorSchema>;
export type Scope = {
    userId: string;
    accountId: string;
    provider: 'gmail' | 'imap';
};
export type Attachment = {
    part_key: string;
    filename: string;
    content_type: string;
    size: number;
    content_id?: string | null;
    is_inline?: boolean;
};
export type SyncMessage = {
    uid: string;
    gmail_label_revision?: string;
    message_id: string;
    thread_id?: string;
    reply_to?: string | null;
    in_reply_to?: string | null;
    reply_references?: string[];
    from_address: string;
    from_name?: string;
    to_addresses?: string[];
    cc_addresses?: string[];
    subject: string;
    body_text: string;
    body_html: string | null;
    received_at: string;
    is_read: boolean;
    is_starred: boolean;
    is_archived: boolean;
    is_deleted: boolean;
    direction: 'inbound' | 'outbound';
    attachments: Attachment[];
};
export type Page = {
    cursor: Cursor;
    namespace: string;
    messages: SyncMessage[];
    deleted: string[];
    generation?: string;
    finalize?: boolean;
    complete: boolean;
};
export type Lease = {
    id: string;
    fence: number;
    revision: number;
    cursor: Cursor | null;
};
export interface SyncStore {
    claim(scope: Scope): Promise<Lease | null>;
    commit(scope: Scope, lease: Lease, page: Page): Promise<number>;
    release(scope: Scope, lease: Lease, outcome: {
        pending: boolean;
        error?: SyncError['code'];
    }): Promise<void>;
}
export interface SyncProvider {
    page(cursor: Cursor | null, size: number, signal: AbortSignal): Promise<Page>;
    close(): Promise<void>;
}
export type SyncOutcome = {
    success: boolean;
    synced: number;
    pending: boolean;
    busy?: boolean;
    error?: string;
};
