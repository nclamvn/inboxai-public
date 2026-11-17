import { Suspense } from 'react'
import { notFound,redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LivingWorkspace } from '@/components/commitments/living-workspace'

export default async function LivingPage() {
  if(process.env.INBOXAI_LIVING_LOCAL!=='1')notFound()
  const client=await createClient(),{data:{user}}=await client.auth.getUser()
  if(!user)redirect('/login')
  const {data:accounts}=await client.from('source_accounts').select('id,email_address').eq('user_id',user.id)
  const {data:emails,error}=await client.from('emails').select('id,subject,thread_id,source_account_id').eq('user_id',user.id)
    .eq('provider_deleted',false).or('is_deleted.is.null,is_deleted.eq.false').order('created_at',{ascending:false}).limit(250)
  if(error)return <p role="alert" className="p-5">Chưa đọc được hội thoại. Tải lại để thử lại.</p>
  const seen=new Set<string>()
  const threads=(emails??[]).filter(mail=>{const key=mail.source_account_id+':'+(mail.thread_id||mail.id);if(seen.has(key))return false;seen.add(key);return true})
    .map(mail=>({id:mail.id,subject:mail.subject,account:accounts?.find(account=>account.id===mail.source_account_id)?.email_address??null}))
  return <Suspense fallback={<p role="status">Đang mở Cam kết sống…</p>}><LivingWorkspace threads={threads}/></Suspense>
}
