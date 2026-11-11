import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CommitmentLedger } from '@/components/commitments/commitment-ledger'

export const metadata = { title: 'Cam kết' }

export default async function CommitmentsPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')

  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-[var(--foreground-muted)]">Đang tải sổ cam kết…</p>}>
      <CommitmentLedger userId={user.id} />
    </Suspense>
  )
}
