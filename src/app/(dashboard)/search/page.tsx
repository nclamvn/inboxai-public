import { Suspense } from 'react'
import { AskInbox } from '@/components/search/ask-inbox'
import { loadSearchAccounts } from '@/lib/search/accounts'
import { createClient } from '@/lib/supabase/server'
import { commitmentId } from '@/lib/commitments/contracts'
import { ConfirmedCommitmentAnswer } from '@/components/search/confirmed-commitment-answer'
import type { LedgerDetail } from '@/lib/commitments/view'

export const metadata = { title: 'Ask Inbox' }

export default async function SearchPage({searchParams}:{searchParams:Promise<{commitment?:string}>}) {
  const accounts = await loadSearchAccounts()
  const {commitment}=await searchParams
  if(commitment) {
    const id=commitmentId.safeParse(commitment)
    if(!id.success)return <p role="alert" className="p-5">Mã cam kết không hợp lệ.</p>
    const client=await createClient()
    const {data,error}=await client.rpc('read_commitment',{p_id:id.data,p_limit:20,p_before_version:null})
      .abortSignal(AbortSignal.timeout(10_000))
    if(error||!data)return <p role="alert" className="p-5">Chưa đọc được cam kết trong phạm vi của bạn.</p>
    return <ConfirmedCommitmentAnswer detail={data as LedgerDetail}/>
  }
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm">Đang mở Ask Inbox…</p>}>
      <AskInbox {...accounts} />
    </Suspense>
  )
}
