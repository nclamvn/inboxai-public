import { beforeEach, expect, it, vi } from 'vitest';
import { Resolver } from 'node:dns/promises';
const mocked = vi.hoisted(() => ({ options: undefined as unknown, close: vi.fn(), release: vi.fn(), fetch: vi.fn(), search: vi.fn(), status: vi.fn(), lock: vi.fn() }));
vi.mock('imapflow', () => ({ ImapFlow: class {
        constructor(options: unknown) { mocked.options = options; }
        on() { }
        connect = async () => { };
        getMailboxLock = mocked.lock;
        status = mocked.status;
        search = mocked.search;
        fetch = mocked.fetch;
        close = mocked.close;
    } }));
import { openImapReader } from '@/lib/sync/imap-reader';
import { gmailReader } from '@/lib/sync/gmail-reader';
import { normalizeGmail } from '@/lib/sync/gmail-provider';
import { FakeGmail } from '../sync-fixtures';
const account = { id: 'synthetic', user_id: 'synthetic-user', imap_host: 'imap.example.test', imap_port: 993, imap_secure: true, username: 'synthetic@example.test' };
beforeEach(() => {
    vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['93.184.216.34']);
    vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue([]);
    for (const key of ['close', 'release', 'fetch', 'search', 'status', 'lock'] as const)
        mocked[key].mockReset();
    mocked.lock.mockResolvedValue({ release: mocked.release });
    mocked.status.mockResolvedValue({ uidValidity: BigInt(123), uidNext: 4 });
    mocked.search.mockResolvedValue([1, 2, 3]);
});
it('uses UID searches, read-only mailbox and real MIME parsing with duplicate filenames', async () => {
    const source = Buffer.from('From: Synthetic <synthetic@example.test>\r\nSubject: MIME fixture\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nSynthetic body\r\n--fixture\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="same.txt"\r\n\r\nfirst\r\n--fixture\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="same.txt"\r\n\r\nsecond\r\n--fixture--\r\n');
    mocked.fetch.mockImplementation(async function* () { yield { uid: 1, source, envelope: { messageId: 'same-rfc@example.test', from: [{ address: 'synthetic@example.test' }] }, flags: new Set(['\\Seen']), internalDate: new Date('2026-11-11T00:00:00Z'), size: source.length }; });
    const reader = await openImapReader(account, 'synthetic-password', AbortSignal.timeout(1000));
    expect(await reader.search(1, 500, AbortSignal.timeout(1000))).toEqual([1, 2, 3]);
    const rows = await reader.messages([1], AbortSignal.timeout(1000));
    expect(mocked.lock).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(mocked.search).toHaveBeenCalledWith({ uid: '1:500' }, { uid: true });
    expect(rows[0]).toMatchObject({ uid: '1', is_read: true, body_text: expect.stringContaining('Synthetic body') });
    expect(rows[0].attachments.map(a => [a.part_key, a.filename])).toEqual([['0', 'same.txt'], ['1', 'same.txt']]);
    await reader.close();
    expect(mocked.release).toHaveBeenCalledOnce();
    expect(mocked.close).toHaveBeenCalledOnce();
    expect(mocked.options).toMatchObject({ host: '93.184.216.34', servername: account.imap_host,
        logger: false, disableAutoIdle: true, socketTimeout: 10000 });
});
it('rejects a missing/truncated source instead of returning a partial successful batch', async () => {
    mocked.fetch.mockImplementation(async function* () { yield { uid: 1, envelope: {}, source: Buffer.from('short'), size: 20 * 1024 * 1024 }; });
    const reader = await openImapReader(account, 'synthetic-password', AbortSignal.timeout(1000));
    await expect(reader.messages([1], AbortSignal.timeout(1000))).rejects.toThrow('Sync provider');
    await reader.close();
});
it('Gmail transport paginates all mail/history with bounded abort signals and generic errors', async () => {
    const capture = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ historyId: '123' }), { status: 200 }));
    vi.stubGlobal('fetch', capture);
    const reader = gmailReader('synthetic-access');
    await reader.list('next + token', 50, AbortSignal.timeout(1000));
    await reader.history('90071992547409931234', 'next', 50, AbortSignal.timeout(1000));
    const listUrl = new URL(capture.mock.calls[0][0]);
    const historyUrl = new URL(capture.mock.calls[1][0]);
    expect(listUrl.searchParams.get('includeSpamTrash')).toBe('true');
    expect(listUrl.searchParams.get('pageToken')).toBe('next + token');
    expect(historyUrl.searchParams.get('startHistoryId')).toBe('90071992547409931234');
    expect(capture.mock.calls[0][1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
    capture.mockResolvedValue(new Response('synthetic-private-error', { status: 503 }));
    await expect(reader.message('id', AbortSignal.timeout(1000))).rejects.toThrow('Sync provider');
});
it('does not replace Gmail body with attached text and preserves MIME attachment identity', async () => {
    const api = new FakeGmail(1), message = await api.message('1');
    message.payload = { headers: [], mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Main body').toString('base64url') } },
            { partId: '1', mimeType: 'text/plain', filename: 'note.txt', body: { size: 12, data: Buffer.from('Attached text').toString('base64url') } }] };
    const parsed = normalizeGmail(message);
    expect(parsed.body_text).toBe('Main body');
    expect(parsed.attachments).toMatchObject([{ part_key: '1', filename: 'note.txt', size: 12 }]);
});
it('hydrates Gmail text body references without fetching attached files',async()=>{
 const message=(await new FakeGmail(1).message('1'))
 message.payload={mimeType:'multipart/mixed',headers:[],parts:[{mimeType:'text/plain',body:{attachmentId:'body-ref'}},{mimeType:'text/plain',filename:'file.txt',body:{attachmentId:'file-ref'}}]}
 const capture=vi.fn().mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('/attachments/')?{data:Buffer.from('Referenced body').toString('base64url')}:message),{status:200}))
 vi.stubGlobal('fetch',capture)
 const result=normalizeGmail(await gmailReader('synthetic').message('1',AbortSignal.timeout(1000)))
 expect(result.body_text).toBe('Referenced body')
 expect(capture).toHaveBeenCalledTimes(2)
 expect(capture.mock.calls[1][0]).toContain('/attachments/body-ref')
})
it('does not interpret an unavailable Gmail body part as a deleted message',async()=>{
 const message=await new FakeGmail(1).message('1');message.payload.body={attachmentId:'missing-body'}
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>url.includes('/attachments/')?new Response('',{status:404}):new Response(JSON.stringify(message),{status:200})))
 await expect(gmailReader('synthetic').message('1',AbortSignal.timeout(1000))).rejects.toMatchObject({status:502})
})
