import 'server-only'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import type { MailPayload, SendOutcome } from './contracts'

const endpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const messageMetadata = z.object({
  id: providerId,
  threadId: providerId.optional(),
  labelIds: z.array(z.string()).optional(),
  payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })) }).optional(),
})
const mime = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })

function request(token: string, path: string, signal: AbortSignal, raw?: { raw: string; threadId?: string }) {
  return fetch(endpoint + path, {
    method: raw ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(raw && { 'Content-Type': 'application/json' }) },
    body: raw ? JSON.stringify(raw) : undefined,
    redirect: 'error',
    cache: 'no-store',
    signal,
  })
}

async function readMetadata(token: string, id: string, signal: AbortSignal) {
  const params = new URLSearchParams({ format: 'metadata' })
  params.append('metadataHeaders', 'Message-ID')
  params.append('metadataHeaders', 'Subject')
  const response = await request(token, `/${encodeURIComponent(id)}?${params}`, signal)
  if (!response.ok) return null
  const parsed = messageMetadata.safeParse(await response.json())
  return parsed.success && parsed.data.id === id ? parsed.data : null
}

export async function gmailReplyThread(token: string, id: string, messageId: string, subject: string, signal: AbortSignal) {
  const metadata = await readMetadata(token, id, signal)
  const header = (name: string) => metadata?.payload?.headers.find(item => item.name.toLowerCase() === name)?.value
  const normalize = (value: string) => value.replace(/^(?:re:\s*)+/i, '').trim()
  if (header('message-id')?.trim() !== messageId || normalize(header('subject') || '') !== normalize(subject)) return undefined
  return metadata?.threadId
}

export async function sendViaGmail(token: string, payload: MailPayload, messageId: string, signal: AbortSignal, threadId?: string): Promise<SendOutcome> {
  let raw: string
  try {
    // Stream transport builds MIME in memory. Gmail uses the Bcc header for envelope recipients.
    const result = await mime.sendMail({
      ...payload,
      messageId,
      references: payload.inReplyTo,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    raw = (result.message as Buffer).toString('base64url')
    if (signal.aborted) return { state: 'rejected' }
  } catch {
    return { state: 'rejected' }
  }

  const response = await request(token, '/send', signal, { raw, threadId })
  if ([400, 401, 403, 404].includes(response.status)) return { state: 'rejected' }
  if (!response.ok) return { state: 'unknown' }
  const parsed = z.object({ id: providerId }).safeParse(await response.json())
  return parsed.success ? { state: 'accepted', providerId: parsed.data.id } : { state: 'unknown' }
}

/** Only a unique, exact Sent match resolves an uncertain send. */
export async function findGmailSent(token: string, messageId: string, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ q: `rfc822msgid:${messageId}`, labelIds: 'SENT', includeSpamTrash: 'true', maxResults: '2' })
  const response = await request(token, `?${params}`, signal)
  if (!response.ok) return null
  const parsed = z.object({
    messages: z.array(z.object({ id: providerId })).optional(),
    nextPageToken: z.string().optional(),
  }).safeParse(await response.json())
  if (!parsed.success || parsed.data.nextPageToken || parsed.data.messages?.length !== 1) return null
  const metadata = await readMetadata(token, parsed.data.messages[0].id, signal)
  if (!metadata?.labelIds?.includes('SENT')) return null
  const actualId = metadata.payload?.headers.find(header => header.name.toLowerCase() === 'message-id')?.value
  return actualId?.trim() === messageId ? metadata.id : null
}
