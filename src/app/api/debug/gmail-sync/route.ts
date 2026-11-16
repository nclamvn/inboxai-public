import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCredentialVault } from '@/lib/credential-vault/vault'

// Diagnostics expose metadata only; never refresh tokens or call a mail provider.
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error:'Not found' }, { status:404 })
  const supabase = await createClient()
  const { data:{ user },error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error:'Unauthorized' }, { status:401 })
  const { data:accounts,error:queryError } = await supabase.from('source_accounts')
    .select('id,provider,auth_type,sync_status').eq('user_id',user.id).limit(10)
  if (queryError) return NextResponse.json({ error:'Diagnostics unavailable' }, { status:503 })
  try {
    const vault = getCredentialVault()
    const diagnostics = await Promise.all((accounts || []).map(async account => ({
      id:account.id,provider:account.provider,syncStatus:account.sync_status,
      credentialState:(await vault.status({ userId:user.id,accountId:account.id })).state,
    })))
    return NextResponse.json({ diagnostics }, { headers:{ 'Cache-Control':'no-store' } })
  } catch { return NextResponse.json({ error:'Diagnostics unavailable' }, { status:503 }) }
}
