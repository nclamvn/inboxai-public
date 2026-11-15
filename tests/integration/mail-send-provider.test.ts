import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import { expect, it, vi } from 'vitest'
import { findGmailSent, gmailReplyThread, sendViaGmail } from '@/lib/mail-send/gmail'
import { sendEmailViaSMTP } from '@/lib/email/smtp-client'
import type { MailPayload } from '@/lib/mail-send/contracts'

const messageId = '<synthetic@inboxai.invalid>'
const payload: Omit<MailPayload, 'attachments'> = {
  from: { name: 'Nhóm giao nhận', address: 'sender@example.test' },
  to: ['to@example.test'], cc: ['cc@example.test'], bcc: ['bcc@example.test'],
  subject: 'Xác nhận giao hàng', text: 'Nội dung tiếng Việt', html: '<p>Nội dung tiếng Việt</p>',
  inReplyTo: '<original@example.test>',
}
const signal = () => AbortSignal.timeout(1_000)
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const smtp = { host: '93.184.216.34', port: 587, secure: false, username: 'synthetic', password: 'synthetic' }

it('builds actual MIME with Unicode, Bcc and RFC reply headers for Gmail', async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ id: 'fake-gmail-id' }))
  vi.stubGlobal('fetch', fetcher)
  expect(await sendViaGmail('synthetic-token', payload, messageId, signal(), 'fake-thread')).toEqual({
    state: 'accepted', providerId: 'fake-gmail-id',
  })
  const [url, request] = fetcher.mock.calls[0]
  expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
  expect(request).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' } })
  const body = JSON.parse(request.body)
  const parsed = await simpleParser(Buffer.from(body.raw, 'base64url'))
  expect(body.threadId).toBe('fake-thread')
  expect(parsed).toMatchObject({ subject: payload.subject, messageId, inReplyTo: payload.inReplyTo })
  expect(parsed.text).toContain(payload.text)
  expect(parsed.bcc).toMatchObject({ value: [{ address: payload.bcc[0] }] })
  expect(parsed.cc).toMatchObject({ value: [{ address: payload.cc[0] }] })
})

it.each([[403, 'rejected'], [429, 'unknown'], [503, 'unknown'], [200, 'unknown']] as const)(
  'classifies Gmail HTTP %i with no receipt as %s', async (status, state) => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: 'synthetic provider details' }, status))
    vi.stubGlobal('fetch', fetcher)
    expect(await sendViaGmail('synthetic', payload, messageId, signal())).toEqual({ state })
    expect(fetcher).toHaveBeenCalledOnce()
  },
)

it('verifies a unique Gmail Sent match by its exact MIME Message-ID', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ messages: [{ id: 'sent-1' }] })).mockResolvedValueOnce(json({
    id: 'sent-1', labelIds: ['SENT'],
    payload: { headers: [{ name: 'Message-ID', value: messageId }] },
  }))
  vi.stubGlobal('fetch', fetcher)
  expect(await findGmailSent('synthetic', messageId, signal())).toBe('sent-1')
  const query = new URL(fetcher.mock.calls[0][0]).searchParams
  expect(query.get('q')).toBe(`rfc822msgid:${messageId}`)
  expect(query.get('labelIds')).toBe('SENT')
  expect(fetcher.mock.calls.every(call => call[1].method === 'GET')).toBe(true)
})

it.each([
  { messages: [] },
  { messages: [{ id: 'one' }, { id: 'two' }] },
  { messages: [{ id: 'one' }], nextPageToken: 'more' },
])('leaves absent or ambiguous Sent matches unresolved', async listing => {
  const fetcher = vi.fn().mockResolvedValue(json(listing))
  vi.stubGlobal('fetch', fetcher)
  expect(await findGmailSent('synthetic', messageId, signal())).toBeNull()
  expect(fetcher).toHaveBeenCalledOnce()
})

it('rejects a Sent search hit whose metadata has a different Message-ID', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ messages: [{ id: 'one' }] })).mockResolvedValueOnce(json({
    id: 'one', labelIds: ['SENT'], payload: { headers: [{ name: 'Message-ID', value: '<other@example.test>' }] },
  })))
  expect(await findGmailSent('synthetic', messageId, signal())).toBeNull()
})

it('requires matching source metadata for a Gmail reply thread', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({
    id: 'original', threadId: 'thread-1', payload: { headers: [
      { name: 'Subject', value: 'Subject' }, { name: 'Message-ID', value: '<original@example.test>' },
    ] },
  })))
  expect(await gmailReplyThread('synthetic', 'original', '<original@example.test>', 'Re: Subject', signal())).toBe('thread-1')
  expect(await gmailReplyThread('synthetic', 'original', '<original@example.test>', 'Different subject', signal())).toBeUndefined()
})

it('retains partial SMTP acceptance and requires TLS on a nonimplicit TLS port', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const send = vi.spyOn(transport, 'sendMail').mockImplementation(async () => ({ rejected: ['to@example.test'], messageId }))
  const create = vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport)
  expect(await sendEmailViaSMTP(smtp, { ...payload, messageId })).toMatchObject({ state: 'partial', messageId })
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, socketTimeout: 15000 }))
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ messageId, inReplyTo: payload.inReplyTo, signal: expect.any(AbortSignal) }))
})

it.each([
  [{ code: 'EAUTH' }, 'rejected'],
  [{ command: 'DATA', responseCode: 550 }, 'rejected'],
  [{ code: 'ETIMEDOUT', command: 'DATA' }, 'unknown'],
])('classifies SMTP rejection separately from connection loss', async (error, state) => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  vi.spyOn(transport, 'sendMail').mockRejectedValue(error)
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport)
  expect(await sendEmailViaSMTP(smtp, { ...payload, messageId })).toMatchObject({ success: false, state })
})

it('builds exact attachment bytes through the SMTP transport', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const send = vi.spyOn(transport, 'sendMail')
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport)
  const content = Buffer.from([0, 255, 5, 127, 23, 0])
  const filename = 'Bản nghiệm thu.dat'
  expect(await sendEmailViaSMTP(smtp, { ...payload, messageId,
    attachments: [{ filename, contentType: 'application/octet-stream', content }],
  })).toMatchObject({ state: 'accepted', messageId })
  const info = await send.mock.results[0].value
  const mail = await simpleParser(info.message)
  expect(mail.attachments).toHaveLength(1)
  expect(mail.attachments[0]).toMatchObject({ filename, contentType: 'application/octet-stream', content })
})
