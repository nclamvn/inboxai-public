import { redirect } from 'next/navigation'
import { PurchaseHandoffs } from '@/components/commitments/purchase-handoff'
import { commitmentId } from '@/lib/commitments/contracts'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Hồ sơ Kế toán' }

export default async function HandoffPage({ searchParams }: { searchParams: Promise<{ id?: string | string[]; supplement?: string | string[] }> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const id = commitmentId.safeParse(params.id)
  if (params.id !== undefined && !id.success) redirect('/commitments/handoffs')
  const supplement = params.supplement === '1'
  return <PurchaseHandoffs key={(id.data ?? 'queue') + (supplement ? ':supplement' : '')}
    id={id.data} userId={user.id} openSupplement={supplement} />
}
