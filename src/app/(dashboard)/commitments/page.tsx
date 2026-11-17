import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CommitmentLedger } from '@/components/commitments/commitment-ledger'
import Link from 'next/link'

export const metadata = { title: 'Cam kết' }

export default async function CommitmentsPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await client.from('source_accounts').select('id,email_address')
    .eq('user_id', user.id).eq('is_active', true).order('email_address').limit(50)

  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-[var(--foreground-muted)]">Đang tải sổ cam kết…</p>}>
      {process.env.INBOXAI_LIVING_LOCAL==='1'&&<Link className="neo-target mx-4 inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline" href="/commitments/living">Cam kết sống · Phân tích hội thoại</Link>}
      <CommitmentLedger userId={user.id} accounts={accounts ?? []} />
    </Suspense>
  )
}
