import { boundedText } from '@/lib/sync/text'
import { randomUUID } from 'node:crypto';
import { parseHeaders, extractBody, type GmailMessage, type GmailMessagePart } from '@/lib/gmail/api';
import { SyncError, type Cursor, type Page, type SyncProvider, type SyncMessage } from './contracts';
export class GmailReadError extends SyncError {
    constructor(public status: number) { super('provider'); }
}
export type History = {
    historyId: string;
    nextPageToken?: string;
    history?: Array<{
        messages?: Array<{
            id: string;
        }>;
        messagesAdded?: Array<{
            message: {
                id: string;
            };
        }>;
        messagesDeleted?: Array<{
            message: {
                id: string;
            };
        }>;
        labelsAdded?: Array<{
            message: {
                id: string;
            };
        }>;
        labelsRemoved?: Array<{
            message: {
                id: string;
            };
        }>;
    }>;
};
export interface GmailReader {
    profile(signal: AbortSignal): Promise<{
        historyId: string;
    }>;
    list(pageToken: string | undefined, size: number, signal: AbortSignal): Promise<{
        messages?: Array<{
            id: string;
        }>;
        nextPageToken?: string;
    }>;
    history(historyId: string, pageToken: string | undefined, size: number, signal: AbortSignal): Promise<History>;
    message(id: string, signal: AbortSignal): Promise<GmailMessage>;
}
export function normalizeGmail(message: GmailMessage): SyncMessage {
    const headers = parseHeaders(message.payload.headers), body = extractBody(message);
    const from = headers.from || '', match = from.match(/^(.*?)\s*<([^>]+)>$/);
    const labels = message.labelIds || [];
    const attachments: SyncMessage['attachments'] = [];
    function parts(part: GmailMessagePart, path: string) {
        if (part.filename)
            attachments.push({ part_key: part.partId || path, filename: part.filename, content_type: part.mimeType || 'application/octet-stream', size: part.body?.size || 0,
                content_id: part.headers?.find(h => h.name.toLowerCase() === 'content-id')?.value.replace(/[<>]/g, '') });
        part.parts?.forEach((child, index) => parts(child, `${path}.${index}`));
    }
    parts(message.payload, '0');
    return { uid: message.id, message_id: headers['message-id'] || message.id, from_address: match?.[2] || from, from_name: match?.[1]?.replace(/^"|"$/g, ''),
        to_addresses: headers.to ? [headers.to] : [], cc_addresses: headers.cc ? [headers.cc] : [], subject: headers.subject || '(Không có tiêu đề)',
        body_text: boundedText(body.text,100000), body_html: boundedText(body.html,200000) || null, received_at: new Date(Number(message.internalDate)).toISOString(),
        is_read: !labels.includes('UNREAD'), is_starred: labels.includes('STARRED'), is_archived: !labels.includes('INBOX'), is_deleted: labels.includes('TRASH'),
        direction: labels.includes('SENT') ? 'outbound' : 'inbound', attachments };
}
export function gmailProvider(api: GmailReader): SyncProvider {
    let resets = 0;
    async function page(input: Cursor | null, size: number, signal: AbortSignal): Promise<Page> {
        if (input && input.provider !== 'gmail')
            throw new SyncError('invalid');
        let cursor = input as Extract<Cursor, {
            provider: 'gmail';
        }> | null;
        if (!cursor) {
            const profile = await api.profile(signal);
            cursor = { provider: 'gmail', phase: 'full', anchor: profile.historyId, generation: randomUUID() };
        }
        let listing: {
            messages?: Array<{
                id: string;
            }>;
            nextPageToken?: string;
        }, history: History | undefined;
        try {
            if (cursor.phase === 'history' && cursor.pending) {
                history = { historyId: cursor.endHistoryId! };
                listing = { messages: cursor.pending.map(id => ({ id })), nextPageToken: cursor.resumePageToken };
            }
            else if (cursor.phase === 'full')
                listing = await api.list(cursor.pageToken, size, signal);
            else {
                history = await api.history(cursor.historyId, cursor.pageToken, size, signal);
                const changed = new Set<string>();
                for (const entry of history.history ?? []) {
                    for (const m of entry.messages ?? [])
                        changed.add(m.id);
                    for (const field of ['messagesAdded', 'messagesDeleted', 'labelsAdded', 'labelsRemoved'] as const)
                        for (const m of entry[field] ?? [])
                            changed.add(m.message.id);
                }
                // One history record may contain many IDs; persist the bounded worklist, never truncate it.
                if (changed.size > 5000) {
                    if (resets++ < 1)
                        return page(null, size, signal);
                    throw new SyncError('provider');
                }
                listing = { messages: [...changed].map(id => ({ id })), nextPageToken: history.nextPageToken };
            }
        }
        catch (e) {
            if (e instanceof GmailReadError && ((e.status === 404 && cursor.phase === 'history') || (e.status === 400 && cursor.phase === 'full' && cursor.pageToken)) && resets++ < 1)
                return page(null, size, signal);
            throw e;
        }
        const messages: SyncMessage[] = [], deleted: string[] = [];
        const ids = [...new Set((listing.messages ?? []).map(m => m.id))];
        const remaining = ids.slice(size);
        if (cursor.phase === 'full' && remaining.length)
            throw new SyncError('invalid');
        for (const id of ids.slice(0, size)) {
            try {
                const message = await api.message(id, signal);
                if (message.id !== id)
                    throw new SyncError('invalid');
                messages.push(normalizeGmail(message));
            }
            catch (e) {
                if (e instanceof GmailReadError && e.status === 404)
                    deleted.push(id);
                else
                    throw e;
            }
        }
        if (cursor.phase === 'full')
            return { namespace: 'gmail', messages, deleted, generation: cursor.generation, finalize: !listing.nextPageToken, complete: false,
                cursor: listing.nextPageToken ? { ...cursor, pageToken: listing.nextPageToken } : { provider: 'gmail', phase: 'history', historyId: cursor.anchor } };
        if (!history?.historyId)
            throw new SyncError('invalid');
        const next: Cursor = remaining.length ? { provider: 'gmail', phase: 'history', historyId: cursor.historyId, pageToken: cursor.pageToken,
            pending: remaining, resumePageToken: listing.nextPageToken, endHistoryId: history.historyId } : listing.nextPageToken ?
            { provider: 'gmail', phase: 'history', historyId: cursor.historyId, pageToken: listing.nextPageToken } :
            { provider: 'gmail', phase: 'history', historyId: history.historyId };
        return { namespace: 'gmail', messages, deleted, complete: !remaining.length && !listing.nextPageToken, cursor: next };
    }
    return { page, close: async () => { } };
}
