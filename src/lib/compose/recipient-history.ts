import 'server-only'
import addressparser from 'nodemailer/lib/addressparser'
import { z } from 'zod'
import { foldRecipient, type ComposeRecipient } from './recipients'

type SentRecipients = { to: unknown; cc: unknown }
const address = z.string().trim().max(254).pipe(z.email())

function cleanRecipientName(value: string | null | undefined) {
  const name = (value ?? '').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 160)
  return name && !name.includes('@') && !name.includes('=?') ? name : null
}

function parseRecipient(value: unknown): ComposeRecipient[] {
  if (typeof value === 'string' && value.length <= 12_000) {
    return addressparser(value, { flatten: true }).slice(0, 50).flatMap(entry => {
      const checked = address.safeParse(entry.address)
      return checked.success ? [{ address: checked.data, name: cleanRecipientName(entry.name) }] : []
    })
  }
  if (value && typeof value === 'object' && 'email' in value) {
    const checked = address.safeParse(value.email)
    if (checked.success) return [{ address: checked.data, name: cleanRecipientName('name' in value && typeof value.name === 'string' ? value.name : null) }]
  }
  return []
}

export function collectRecentRecipients(messages: SentRecipients[], account: string) {
  const entries = new Map<string, ComposeRecipient & { frequency: number; recent: number }>()
  const own = account.trim().toLowerCase()
  for (const [recent, mail] of messages.entries()) {
    const counted = new Set<string>()
    for (const field of [mail.to, mail.cc]) {
      if (!Array.isArray(field)) continue
      const recipients = field.slice(0, 50).flatMap(parseRecipient).slice(0, 50)
      for (const recipient of recipients) {
        const key = recipient.address.toLowerCase()
        if (key === own) continue
        const entry = entries.get(key)
        if (entry) {
          if (!counted.has(key)) entry.frequency++
          entry.name ??= recipient.name
        } else {
          entries.set(key, { ...recipient, frequency: 1, recent })
        }
        counted.add(key)
      }
    }
  }
  return [...entries.values()].sort((a, b) => b.frequency - a.frequency || a.recent - b.recent || a.address.localeCompare(b.address))
}

export function matchRecentRecipients(entries: ComposeRecipient[], names: Record<string, string>, query: string) {
  const terms = foldRecipient(query).split(/\s+/).filter(Boolean)
  return entries.flatMap(entry => {
    const name = entry.name ?? cleanRecipientName(names[entry.address.toLowerCase()])
    const haystack = foldRecipient((name ?? '') + ' ' + entry.address)
    return terms.every(term => haystack.includes(term)) ? [{ address: entry.address, name }] : []
  }).slice(0, 8)
}
