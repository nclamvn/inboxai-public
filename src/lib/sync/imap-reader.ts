import { boundedText } from '@/lib/sync/text'
import 'server-only';
import { replyHeaders } from '@/lib/replies/headers'
import { connectImap } from '@/lib/email/imap-connection';
import { simpleParser } from 'mailparser';
import { SyncError, type SyncMessage } from './contracts';
import type { ImapReader } from './imap-provider';
export type ImapAccount = {
    id: string;
    user_id: string;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    username: string;
};
export async function openImapReader(account: ImapAccount, password: string, signal: AbortSignal): Promise<ImapReader> {
    let client: Awaited<ReturnType<typeof connectImap>>;
    try {
        client = await connectImap({ host: account.imap_host, port: account.imap_port, secure: account.imap_secure,
            username: account.username, password }, signal);
    } catch {
        throw new SyncError('provider');
    }
    const abort = () => client.close();
    signal.addEventListener('abort', abort, { once: true });
    let lock: Awaited<ReturnType<typeof client.getMailboxLock>>;
    try {
        signal.throwIfAborted();
        lock = await client.getMailboxLock('INBOX', { readOnly: true });
    }
    catch {
        signal.removeEventListener('abort', abort);
        client.close();
        throw new SyncError('provider');
    }
    return {
        async status() {
            const state = await client.status('INBOX', { uidValidity: true, uidNext: true });
            return { validity: String(state.uidValidity), uidNext: state.uidNext ?? 0 };
        },
        async search(from, to) { const result = await client.search({ uid: `${from}:${to}` }, { uid: true }); if (!result)
            throw new SyncError('provider'); return result; },
        async messages(uids) {
            const output: SyncMessage[] = [];
            for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true, size: true, source: { maxLength: 10 * 1024 * 1024 + 1 } }, { uid: true })) {
                if (!msg.source || !msg.envelope)
                    throw new SyncError('provider');
                if ((msg.size ?? msg.source.length) > 10 * 1024 * 1024 || msg.source.length > 10 * 1024 * 1024)
                    throw new SyncError('provider');
                const parsed = await simpleParser(msg.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: 300000 });
                output.push({ uid: String(msg.uid),
                    ...replyHeaders(parsed.replyTo?.value.length === 1 ? parsed.replyTo.value[0].address : undefined, parsed.inReplyTo, parsed.references),
                    message_id: msg.envelope.messageId || `imap-${msg.uid}`, from_address: msg.envelope.from?.[0]?.address || '',
                    from_name: msg.envelope.from?.[0]?.name || '', to_addresses: msg.envelope.to?.flatMap(a => a.address ? [a.address] : []) || [], cc_addresses: msg.envelope.cc?.flatMap(a => a.address ? [a.address] : []) || [],
                    subject: msg.envelope.subject || '(No subject)', body_text: boundedText(parsed.text||'',100000), body_html: parsed.html ? boundedText(parsed.html,200000) : null,
                    received_at: (msg.internalDate instanceof Date ? msg.internalDate : msg.envelope.date || new Date(0)).toISOString(),
                    is_read: msg.flags?.has('\\Seen') ?? false, is_starred: msg.flags?.has('\\Flagged') ?? false, is_archived: false, is_deleted: msg.flags?.has('\\Deleted') ?? false, direction: 'inbound',
                    attachments: parsed.attachments.map((att, index) => ({ part_key: String(index), filename: att.filename || 'unknown', content_type: att.contentType, size: att.size,
                        content_id: att.contentId?.replace(/[<>]/g, ''), is_inline: att.contentDisposition === 'inline' || !!att.contentId })) });
            }
            return output;
        },
        async close() { signal.removeEventListener('abort', abort); lock.release(); client.close(); },
    };
}
