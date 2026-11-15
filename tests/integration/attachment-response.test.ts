import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { expect, it, vi } from 'vitest'
import { GET } from '@/app/api/attachments/[attachmentId]/route'
import { createClient } from '@/lib/supabase/server'
import { connectImap } from '@/lib/email/imap-connection'
import { getImapPassword } from '@/lib/credential-vault/vault'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/email/imap-connection', () => ({ connectImap: vi.fn() }))
vi.mock('@/lib/credential-vault/vault', () => ({ getImapPassword: vi.fn() }))

const userId = randomUUID(), accountId = randomUUID(), attachmentId = randomUUID()
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const active = Buffer.from('<!doctype html><script>window.attachmentRan=true</script>')

function fixture(contentType: string, bytes: Buffer, emailOwner = userId, second?: Buffer) {
  const metadata = { sync_part_key: second ? '1' : '0', emails: {
    user_id: emailOwner, source_account_id: accountId, original_uid: '7', sync_namespace: 'INBOX:31',
  } }
  const account = { id: accountId, imap_host: 'fixture.example.test', imap_port: 993, imap_secure: true, username: 'fixture' }
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query,
        single: async () => ({ data: table === 'attachments' ? metadata : account, error: null }) }
      return query
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  vi.mocked(getImapPassword).mockResolvedValue('synthetic-password')
  const source = Buffer.from([
    'From: supplier@example.test', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="fixture"', '',
    '--fixture', 'Content-Type: text/plain', '', 'Synthetic message.', '--fixture',
    `Content-Type: ${contentType}`, 'Content-Disposition: attachment; filename="sample.gif"',
    'Content-Transfer-Encoding: base64', '', bytes.toString('base64'),
    ...(second ? ['--fixture', `Content-Type: ${contentType}`, 'Content-Disposition: attachment; filename="sample.gif"',
      'Content-Transfer-Encoding: base64', '', second.toString('base64')] : []),
    '--fixture--', '',
  ].join('\r\n'))
  const release = vi.fn(), close = vi.fn()
  vi.mocked(connectImap).mockResolvedValue({
    getMailboxLock: async () => ({ release }), status: async () => ({ uidValidity: BigInt(31) }),
    fetchOne: async () => ({ source }), close,
  } as unknown as Awaited<ReturnType<typeof connectImap>>)
  return { release, close }
}

const request = (preview = false) => GET(new NextRequest(
  `http://localhost/api/attachments/${attachmentId}${preview ? '?preview=1' : ''}`,
), { params: Promise.resolve({ attachmentId }) })

it.each(['text/html', 'image/svg+xml', 'application/pdf', 'image/gif'])('forces active or mislabeled %s bytes to download', async type => {
  const connection = fixture(type, active)
  const response = await request(true)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;/)
  expect(response.headers.get('content-type')).toBe('application/octet-stream')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('content-security-policy')).toContain('sandbox')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(Buffer.from(await response.arrayBuffer())).toEqual(active)
  expect(connection.release).toHaveBeenCalledOnce()
  expect(connection.close).toHaveBeenCalledOnce()
})

it('permits explicit preview of a raster image and uses download disposition by default', async () => {
  fixture('image/gif', gif)
  const preview = await request(true)
  expect(preview.status).toBe(200)
  expect(preview.headers.get('content-type')).toBe('image/gif')
  expect(preview.headers.get('content-disposition')).toMatch(/^inline;/)
  expect(Buffer.from(await preview.arrayBuffer())).toEqual(gif)
  const download = await request()
  expect(download.headers.get('content-disposition')).toMatch(/^attachment;/)
})

it('stops a mismatched attachment owner before opening the vault or provider', async () => {
  fixture('image/gif', gif, randomUUID())
  expect((await request()).status).toBe(403)
  expect(getImapPassword).not.toHaveBeenCalled()
  expect(connectImap).not.toHaveBeenCalled()
})

it('downloads the second IMAP MIME part when two attachments have the same filename', async () => {
  const first = Buffer.from([1, 2, 3])
  const second = Buffer.from([3, 2, 1])
  fixture('application/octet-stream', first, userId, second)
  const response = await request()
  expect(response.status).toBe(200)
  expect(Buffer.from(await response.arrayBuffer())).toEqual(second)
})
