import { redirect } from 'next/navigation'
import { PurchaseSettlementReview } from '@/components/commitments/purchase-settlement'
import { purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Đối soát thanh toán' }

export default async function SettlementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const selection = purchaseCsvSelection.safeParse({ emailId: params.email, attachmentId: params.file })
  if (!selection.success) redirect('/commitments/handoffs')
  return <PurchaseSettlementReview key={selection.data.attachmentId} userId={user.id} {...selection.data} />
}
