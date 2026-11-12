import { Suspense } from 'react'
import { AskInbox } from '@/components/search/ask-inbox'
import { loadSearchAccounts } from '@/lib/search/accounts'

export const metadata = { title: 'Ask Inbox' }

export default async function SearchPage() {
  const accounts = await loadSearchAccounts()
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm">Đang mở Ask Inbox…</p>}>
      <AskInbox {...accounts} />
    </Suspense>
  )
}
