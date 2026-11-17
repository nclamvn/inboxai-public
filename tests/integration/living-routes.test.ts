import {beforeEach,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'
const mocks=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,rpc:vi.fn(),infer:vi.fn(),service:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClientForRequest:async()=>({auth:{getUser:async()=>({data:{user:mocks.user}})},rpc:mocks.rpc})}))
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.service}))
vi.mock('@/lib/commitments/living-model',()=>({livingModelId:'model-v1',interpretLivingMail:mocks.infer}))
import {GET,POST} from '@/app/api/commitments/living/route'
const id='10000000-0000-4000-8000-000000000191'
const req=(body:unknown)=>new NextRequest('http://127.0.0.1:57300/api/commitments/living',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{
  mocks.user={id:'owner'};vi.stubEnv('INBOXAI_LIVING_LOCAL','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:57321')
  mocks.rpc.mockImplementation(()=>({abortSignal:async()=>({data:null,error:{code:'PT404'}})}))
})
it('denies anonymous analysis before data/model/service access',async()=>{
  mocks.user=null;expect((await POST(req({action:'analyze',sourceId:id}))).status).toBe(401)
  expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.infer).not.toHaveBeenCalled();expect(mocks.service).not.toHaveBeenCalled()
})
it.each(['https://project.supabase.co','http://127.0.0.1.evil.test:57321'])('does not enable local model analysis for %s',url=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',url)
  return POST(req({action:'analyze',sourceId:id})).then(response=>{expect(response.status).toBe(404);expect(mocks.infer).not.toHaveBeenCalled()})
})
it('foreign source denial occurs before model inference or service role creation',async()=>{
  expect((await POST(req({action:'analyze',sourceId:id}))).status).toBe(404)
  expect(mocks.rpc).toHaveBeenCalledWith('read_living_scope',{p_source:id})
  expect(mocks.infer).not.toHaveBeenCalled();expect(mocks.service).not.toHaveBeenCalled()
})
it('cached results use the authenticated boundary and never run the model again',async()=>{
  mocks.rpc.mockImplementation((name)=>({abortSignal:async()=>({error:null,data:name==='read_living_scope'?{analyses:[{id,model:'model-v1'}]}:{id,events:[]}})}))
  expect((await POST(req({action:'analyze',sourceId:id}))).status).toBe(200)
  expect(mocks.infer).not.toHaveBeenCalled();expect(mocks.service).not.toHaveBeenCalled()
})
it('rejects body owner overrides and missing confirmation idempotency keys',async()=>{
  expect((await POST(req({action:'analyze',sourceId:id,userId:'other'}))).status).toBe(400)
  expect((await POST(req({action:'confirm',analysisId:id,index:0,expectedVersion:null,
    state:{title:'x',ownerName:null,ownerEmail:null,dueOn:null,dueAt:null,status:'open'}}))).status).toBe(400)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('does not expose a cached analysis belonging to another tenant',async()=>{
  expect((await GET(new NextRequest('http://127.0.0.1/api/commitments/living?analysis='+id))).status).toBe(404)
  expect(mocks.rpc).toHaveBeenCalledWith('read_living_review',{p_analysis:id})
})
it('reports an over-budget conversation without pretending it is a CSV or calling the model',async()=>{
  mocks.rpc.mockImplementation(()=>({abortSignal:async()=>({data:null,error:{code:'PT413'}})}))
  const response=await POST(req({action:'analyze',sourceId:id}))
  expect(response.status).toBe(413)
  expect((await response.json()).error).toContain('Hội thoại vượt giới hạn')
  expect(mocks.infer).not.toHaveBeenCalled()
})
it('does not write or replace persisted analyses when actual model access fails',async()=>{
  mocks.rpc.mockImplementation(()=>({abortSignal:async()=>({error:null,data:{analyses:[],messages:[]}})}))
  mocks.infer.mockRejectedValueOnce(new Error('Local model offline'))
  const response=await POST(req({action:'analyze',sourceId:id}))
  expect(response.status).toBe(503)
  expect((await response.json()).error).toContain('Kết quả đã lưu không bị xóa')
  expect(mocks.service).not.toHaveBeenCalled()
})
it('stores a successful local analysis with authenticated actor and honest coverage diagnostics',async()=>{
  const source={id,sender:'a@example.test',account:'account-a',subject:'Hồ sơ',body:'Tôi nhận gửi hồ sơ, chưa có hạn cụ thể.',at:'2026-11-17T02:00:00Z',arrivedAt:'2026-11-17T03:00:00Z',fingerprint:'mail-snapshot'}
  mocks.rpc.mockImplementation((name)=>({abortSignal:async()=>({error:null,data:name==='read_living_scope'?{analyses:[],messages:[source],scopeKey:'a:thread',fingerprint:'snapshot'}:{id}})}))
  mocks.infer.mockResolvedValueOnce({events:[{source:id,origin:id,item:1,kind:'create',certainty:'firm',title:'Gửi hồ sơ',owner:source.sender,due:null,quote:source.body}],metrics:{elapsedMs:100,calls:1,inputTokens:50,outputTokens:20}})
  const store=vi.fn().mockReturnValue({abortSignal:async()=>({data:id,error:null})})
  mocks.service.mockReturnValueOnce({rpc:store})
  expect((await POST(req({action:'analyze',sourceId:id}))).status).toBe(200)
  expect(store).toHaveBeenCalledWith('store_living_analysis',expect.objectContaining({p_actor:'owner',p_fingerprint:'snapshot',
    p_metrics:expect.objectContaining({coverage:{messages:1,proposals:1,blocked:0,unresolvedDates:1}})}))
})
it('saves review decisions through the authenticated RPC with both expected versions and request key',async()=>{
 const key='10000000-0000-4000-8000-000000000192'
 const body={action:'review',analysisId:id,index:2,expectedDecisionVersion:3,expectedVersion:4,decision:'restore',reason:null}
 expect((await POST(req(body))).status).toBe(400)
 const request=req(body);request.headers.set('Idempotency-Key',key)
 mocks.rpc.mockImplementation(()=>({abortSignal:async()=>({error:null,data:{version:4,active:false,replayed:false}})}))
 expect((await POST(request)).status).toBe(200)
 expect(mocks.rpc).toHaveBeenCalledWith('decide_living_review',{p_analysis:id,p_index:2,p_version:3,p_ledger_version:4,p_request:key,p_action:'restore',p_reason:null})
 expect(mocks.infer).not.toHaveBeenCalled();expect(mocks.service).not.toHaveBeenCalled()
})
