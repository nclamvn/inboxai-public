import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { OperatorWorkspace } from '@/components/operator/operator-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'AI Operator' }

export default async function OperatorPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const { data, error } = await client.from('source_accounts').select('id,email_address')
    .eq('user_id', user.id).order('email_address')
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm">Đang mở AI Operator…</p>}>
      <OperatorWorkspace userId={user.id} accounts={data ?? []} accountsFailed={Boolean(error)} />
    </Suspense>
  )
}
