import type { Category, EmailDirection } from '@/types'

export const lookupCategories = ['work', 'personal', 'transaction', 'newsletter', 'promotion', 'social', 'spam', 'uncategorized'] as const
export const lookupQueryLimit = 200
const accountId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export type MailLookupFilters = {
  query: string
  accounts: string[]
  category: Category | null
  hasFile: boolean
}

export type MailLookupCursor = { rank: number; at: string; id: string }
export type MailLookupFile = { id: string; name: string; size: number | null }
export type MailLookupHit = {
  id: string
  subject: string | null
  sender: string | null
  senderName: string | null
  account: string | null
  direction: EmailDirection
  at: string
  category: Category | null
  preview: string | null
  files: MailLookupFile[]
  moreFiles: boolean
}
export type MailLookupPage = { hits: MailLookupHit[]; next: MailLookupCursor | null }

export function lookupCategory(value: string | null): Category | null {
  return lookupCategories.find(category => category === value) ?? null
}

export function readMailLookup(params: Pick<URLSearchParams, 'get' | 'getAll'>): MailLookupFilters {
  return {
    query: (params.get('q') ?? '').trim().slice(0, lookupQueryLimit),
    accounts: [...new Set(params.getAll('account').filter(id => accountId.test(id)))].slice(0, 20),
    category: lookupCategory(params.get('category')),
    hasFile: params.get('file') === '1',
  }
}

export function mailLookupParams(filters: MailLookupFilters) {
  const params = new URLSearchParams()
  const text = filters.query.trim().slice(0, lookupQueryLimit)
  if (text) params.set('q', text)
  for (const id of filters.accounts) params.append('account', id)
  if (filters.category) params.set('category', filters.category)
  if (filters.hasFile) params.set('file', '1')
  return params
}

export function mailLookupHref(filters: MailLookupFilters) {
  const params = mailLookupParams(filters)
  return params.size ? '/search/mail?' + params.toString() : '/search/mail'
}

export function returnToMailLookup(value: string | null) {
  if (!value || value.length > 3000) return null
  return mailLookupHref(readMailLookup(new URLSearchParams(value)))
}
