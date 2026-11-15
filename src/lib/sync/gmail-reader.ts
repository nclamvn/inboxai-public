import 'server-only';
import { isGmailScopeDenial } from '@/lib/gmail/provider-errors';
import type { GmailMessage, GmailMessagePart } from '@/lib/gmail/api';
import { GmailReadError, type GmailReader, type History } from './gmail-provider';
const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
export function gmailReader(accessToken: string): GmailReader {
    async function read<T>(path: string, signal: AbortSignal): Promise<T> {
        const response = await fetch(`${base}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), redirect: 'error', cache: 'no-store' });
        if (!response.ok)
            throw new GmailReadError(response.status, response.status === 403 && await isGmailScopeDenial(response));
        return response.json();
    }
    return {
        profile: signal => read<{
            historyId: string;
        }>('profile', signal),
        list: (page, size, signal) => read(`messages?${new URLSearchParams({ maxResults: String(size), includeSpamTrash: 'true', ...(page ? { pageToken: page } : {}) })}`, signal),
        history: (start, page, size, signal) => read<History>(`history?${new URLSearchParams({ startHistoryId: start, maxResults: String(size), ...(page ? { pageToken: page } : {}) })}`, signal),
        async message(id, signal) {
            const message = await read<GmailMessage>(`messages/${encodeURIComponent(id)}?format=full`, signal);
            let parts = 0, bodyReads = 0;
            async function hydrate(part: GmailMessagePart, depth = 0): Promise<void> {
                if (++parts > 1000 || depth > 32) throw new GmailReadError(502);
                if (part.filename) return;
                if (/^text\/(plain|html)$/i.test(part.mimeType || '') && part.body?.attachmentId && !part.body.data) {
                    if (++bodyReads > 32) throw new GmailReadError(502);
                    try {
                        const body = await read<{ data?: string }>(`messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`, signal);
                        if (typeof body.data !== 'string') throw new GmailReadError(502);
                        part.body.data = body.data;
                    } catch (error) {
                        if (error instanceof GmailReadError && (error.status === 401 || error.scopeDenied)) throw error;
                        // A missing body part is not evidence that the message itself was deleted.
                        throw new GmailReadError(502);
                    }
                }
                for (const child of part.parts || []) await hydrate(child, depth + 1);
            }
            await hydrate(message.payload);
            return message;
        },
    };
}
