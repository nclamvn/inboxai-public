import { redirect } from 'next/navigation'
import { PurchaseDues } from '@/components/commitments/purchase-dues'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Công nợ cần xử lý' }

export default async function PurchaseDuesPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  return <PurchaseDues key={user.id} userId={user.id} />
}
