import { redirect } from 'next/navigation'
import { PurchaseBatches } from '@/components/commitments/purchase-batch'
import { commitmentId } from '@/lib/commitments/contracts'
import { batchTargets } from '@/lib/commitments/purchase-batch'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Đợt thanh toán' }

export default async function BatchPage({ searchParams }: {
  searchParams: Promise<{ id?: string | string[]; selected?: string | string[] }>
}) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const id = commitmentId.safeParse(params.id)
  const targets = batchTargets.safeParse(typeof params.selected === 'string' ? [params.selected] : params.selected)
  if (params.id !== undefined && !id.success) redirect('/commitments/batches')
  if (params.selected !== undefined && !targets.success) redirect('/commitments/dues')
  return <PurchaseBatches key={id.data ?? targets.data?.join(',') ?? 'list'}
    userId={user.id} id={id.data} selected={id.success ? undefined : targets.data} />
}
