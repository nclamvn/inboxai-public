import 'server-only'
import { z } from 'zod'
import type { TriageFlag } from './contracts'

export const labelRevision = z.string().regex(/^[0-9]{1,30}$/)
const message = z.object({ id: z.string(), historyId: labelRevision, labelIds: z.array(z.string()).default([]) })
const labelFor = { archived: 'INBOX', read: 'UNREAD', starred: 'STARRED' } as const

export class GmailTriageError extends Error {
  constructor(readonly status: number) { super('Gmail label request failed') }
}

export function gmailLabels(token: string, id: string, signal: AbortSignal) {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id)
  async function fetchSnapshot(path: string, payload?: object) {
    const response = await fetch(url + path, {
      headers: { Authorization: 'Bearer ' + token, ...(payload && { 'Content-Type': 'application/json' }) },
      method: payload ? 'POST' : 'GET', body: payload ? JSON.stringify(payload) : undefined,
      signal, redirect: 'error', cache: 'no-store',
    })
    if (!response.ok) throw new GmailTriageError(response.status)
    const data = message.parse(await response.json())
    if (data.id !== id) throw new GmailTriageError(502)
    return {
      revision: data.historyId,
      unavailable: data.labelIds.includes('TRASH') || data.labelIds.includes('SPAM'),
      flags: {
        archived: !data.labelIds.includes('INBOX'),
        read: !data.labelIds.includes('UNREAD'),
        starred: data.labelIds.includes('STARRED'),
      },
    }
  }
  return {
    read: () => fetchSnapshot('?format=minimal&fields=id,historyId,labelIds'),
    change(flag: TriageFlag, desired: boolean) {
      const add = flag === 'starred' ? desired : !desired
      return fetchSnapshot('/modify?fields=id,historyId,labelIds', {
        [add ? 'addLabelIds' : 'removeLabelIds']: [labelFor[flag]],
      })
    },
  }
}
