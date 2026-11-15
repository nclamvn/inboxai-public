import type { AttentionItem } from './attention'
import type { PurchaseFocusItem } from './purchase-focus'

export type CatchupAccount = {
  id: string
  email: string
  lastSyncAt: string | null
  status: string | null
  waitingAnalysis: number
}

export type CatchupAttention = {
  items: AttentionItem[]
  invoices?: import('./purchase-payment').PaymentAttention[]
  purchaseFocus?: PurchaseFocusItem[] | null
  accounts: CatchupAccount[]
}

export function catchupHref(group: string, accounts: string[], source?: string) {
  const params = new URLSearchParams({ group, view: 'catchup' })
  for (const account of accounts) params.append('account', account)
  if (source) params.set('source', source)
  return '/commitments?' + params
}
