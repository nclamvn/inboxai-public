import { Suspense } from 'react'
import { MailLookup } from '@/components/search/mail-lookup'
import { loadSearchAccounts } from '@/lib/search/accounts'

export const metadata = { title: 'Tìm thư và tệp' }

export default async function MailLookupPage() {
  const accounts = await loadSearchAccounts()
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm">Đang mở tìm kiếm…</p>}>
      <MailLookup {...accounts} />
    </Suspense>
  )
}
