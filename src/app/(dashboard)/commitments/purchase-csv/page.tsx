import { redirect } from 'next/navigation'
import { PurchaseCsvReview } from '@/components/commitments/purchase-csv-review'
import { purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Đối soát phiếu CSV' }

export default async function PurchaseCsvPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const selection = purchaseCsvSelection.safeParse({ emailId: params.email, attachmentId: params.file })
  if (!selection.success) redirect('/commitments')
  return <PurchaseCsvReview key={selection.data.attachmentId} {...selection.data} userId={user.id} />
}
