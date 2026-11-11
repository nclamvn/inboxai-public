import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AskInbox } from '@/components/search/ask-inbox'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Ask Inbox' }

export default async function SearchPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const { data, error } = await client.from('source_accounts').select('id,email_address')
    .eq('user_id', user.id).order('email_address')

  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm">Đang mở Ask Inbox…</p>}>
      <AskInbox userId={user.id} accounts={data ?? []} accountsFailed={Boolean(error)} />
    </Suspense>
  )
}
