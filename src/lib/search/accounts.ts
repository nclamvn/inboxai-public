import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function loadSearchAccounts() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const { data, error } = await client.from('source_accounts').select('id,email_address')
    .eq('user_id', user.id).order('email_address')
  return { userId: user.id, accounts: data ?? [], accountsFailed: Boolean(error) }
}
