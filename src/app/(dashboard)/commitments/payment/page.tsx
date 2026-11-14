import { redirect } from 'next/navigation'
import { PurchasePayment } from '@/components/commitments/purchase-payment'
import { commitmentId } from '@/lib/commitments/contracts'
import { purchaseCsvSelection } from '@/lib/commitments/purchase-csv'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Đối soát trước thanh toán' }

export default async function PaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const id = commitmentId.safeParse(params.id)
  if (id.success) {
    const invoice = commitmentId.safeParse(params.invoice)
    if (params.invoice !== undefined && !invoice.success) redirect('/commitments/payment?id=' + id.data)
    const invoiceId = invoice.data
    return <PurchasePayment key={id.data + ':' + (invoiceId ?? '')} userId={user.id} scope={{ id: id.data, invoiceId }} />
  }
  const selection = purchaseCsvSelection.safeParse({ emailId: params.email, attachmentId: params.file })
  if (!selection.success) redirect('/commitments')
  return <PurchasePayment key={selection.data.attachmentId} userId={user.id} scope={selection.data} />
}
