import type { NextRequest } from 'next/server'
import {createHash} from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { livingCommand,type LivingScope } from '@/lib/commitments/living-contracts'
import { interpretLivingMail,livingModelId } from '@/lib/commitments/living-model'
import { normalizeLivingEvents } from '@/lib/commitments/living-interpret'
import {livingModelInput} from '@/lib/commitments/living-extraction'
import { commitmentId,requestKey } from '@/lib/commitments/contracts'
import { CommitmentRequestError,ledgerJson,ledgerRpc,readCommitmentJson,withLedgerSession } from '@/lib/commitments/http'

export const maxDuration=90
function enabled(){return process.env.INBOXAI_LIVING_LOCAL==='1'&&['http://127.0.0.1:55321','http://127.0.0.1:57321'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'')}
export async function GET(request:NextRequest) {
  return withLedgerSession(request,async client=>{
    if(!enabled())return ledgerJson({error:'Cam kết sống chưa được bật trong môi trường này.'},404)
    const id=commitmentId.safeParse(request.nextUrl.searchParams.get('analysis'))
    if(!id.success)return ledgerJson({error:'Thiếu mã phân tích.'},400)
    return ledgerJson(await ledgerRpc(client,'read_living_review',{p_analysis:id.data}))
  })
}
export async function POST(request:NextRequest) {
  return withLedgerSession(request,async(client,userId)=>{
    if(!enabled())return ledgerJson({error:'Cam kết sống chưa được bật trong môi trường này.'},404)
    const input=livingCommand.safeParse(await readCommitmentJson(request))
    if(!input.success)return ledgerJson({error:'Yêu cầu không hợp lệ.'},400)
    const body=input.data
    if(body.action==='confirm'||body.action==='review') {
      const key=requestKey.safeParse(request.headers.get('Idempotency-Key'))
      if(!key.success)return ledgerJson({error:'Thiếu mã chống ghi lặp.'},400)
      if(body.action==='review')return ledgerJson(await ledgerRpc(client,'decide_living_review',{p_analysis:body.analysisId,p_index:body.index,
        p_version:body.expectedDecisionVersion,p_ledger_version:body.expectedVersion,p_request:key.data,p_action:body.decision,p_reason:body.reason}))
      return ledgerJson(await ledgerRpc(client,'confirm_living_event',{p_analysis:body.analysisId,p_index:body.index,
        p_version:body.expectedVersion,p_request:key.data,p_state:body.state}))
    }
    const scope=await ledgerRpc(client,'read_living_scope',{p_source:body.sourceId}) as LivingScope
    const cached=scope.analyses.find(row=>row.model===livingModelId)
    if(cached)return ledgerJson(await ledgerRpc(client,'read_living_review',{p_analysis:cached.id}))
    let result:Awaited<ReturnType<typeof interpretLivingMail>>
    try {result=await interpretLivingMail(scope.messages)}
    catch {throw new CommitmentRequestError(503,'Chưa phân tích được bằng LLM local. Kết quả đã lưu không bị xóa; thử lại sau.')}
    const events=normalizeLivingEvents(result.events,scope.messages,scope.scopeKey)
    const metrics={...result.metrics,inputDigest:createHash('sha256').update(JSON.stringify(livingModelInput(scope.messages))).digest('hex'),coverage:{messages:scope.messages.length,
      proposals:events.filter(event=>!event.blocked).length,blocked:events.filter(event=>event.blocked).length,
      unresolvedDates:events.filter(event=>event.dateResolution?.status==='ambiguous').length}}
    const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data,error}=await service.rpc('store_living_analysis',{p_actor:userId,p_source:body.sourceId,p_fingerprint:scope.fingerprint,
      p_model:livingModelId,p_events:events,p_metrics:metrics}).abortSignal(AbortSignal.timeout(10_000))
    if(error||!data)throw new CommitmentRequestError(error?.code==='PT409'?409:503,'Hội thoại đã đổi hoặc chưa lưu được phân tích. Tải lại trước khi tiếp tục.')
    return ledgerJson(await ledgerRpc(client,'read_living_review',{p_analysis:data}))
  })
}
