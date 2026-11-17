import {expect,it,vi} from 'vitest'
import {normalizeLivingEvents} from '@/lib/commitments/living-interpret'
import {livingCommand,proposedLivingState,type LivingEvent,type LivingMail,type ReviewedEvent} from '@/lib/commitments/living-contracts'
import {interpretLivingMail,livingChat} from '@/lib/commitments/living-model'

const mail=(id:string,body:string,sender='a@example.test',at='2026-11-17T02:00:00Z'):LivingMail=>({id,body,sender,at,arrivedAt:at,account:'account-a',subject:'Thông số',fingerprint:'f'})
const event=(extra:Partial<LivingEvent>={}):LivingEvent=>({source:'a',origin:'a',item:1,kind:'create',certainty:'firm',title:'Gửi bản vẽ',owner:'a@example.test',due:'2026-11-20',quote:'Tôi gửi bản vẽ ngày 20/11/2026.',...extra})
const first=mail('a',event().quote)
it('binds sources and slots independently of display titles and subject collisions',()=>{
  const a=normalizeLivingEvents([event()],[first],'account-a:thread')[0]
  const b=normalizeLivingEvents([event()],[first],'account-b:thread')[0]
  expect(a.blocked).toBeNull();expect(a.referenceKey).not.toBe(b.referenceKey)
  const reordered=normalizeLivingEvents([event({item:2})],[first],'account-a:thread')[0]
  expect(reordered.referenceKey).toBe(a.referenceKey)
})
it.each([
  [event({source:'foreign'}),'Nguồn ngoài'],[event({quote:'không trong thư'}),'không khớp'],
  [event({certainty:'tentative'}),'chắc chắn'],
  [event({owner:'Hương'}),'email người'],[event({owner:'foreign@example.test'}),'trách nhiệm'],
  [event({kind:'owner',owner:null}),'email người'],
])('rejects unsupported source/fact %#',(candidate,reason)=>{
  expect(normalizeLivingEvents([candidate as LivingEvent],[first],'s')[0].blocked).toContain(reason)
})
it('blocks quoted promises and conditions even if the model labels them firm',()=>{
  const quote=event().quote
  expect(normalizeLivingEvents([event()],[mail('a','On Monday, A wrote:\n'+quote)],'s')[0].blocked).toContain('trích lại')
  const conditional='Nếu khách duyệt, tôi gửi bản vẽ ngày 20/11/2026.'
  expect(normalizeLivingEvents([event({quote:conditional})],[mail('a',conditional)],'s')[0].blocked).toContain('điều kiện')
})
it('takes an unambiguous numeric date from the exact evidence rather than a model transcription',()=>{
  expect(normalizeLivingEvents([event({due:'2026-01-20'})],[first],'s')[0].due).toBe('2026-11-20')
  const quote='Tôi sẽ gửi báo cáo, hạn chưa rõ.'
  expect(normalizeLivingEvents([event({quote,due:'2026-02-31'})],[mail('a',quote)],'s')[0].blocked).toContain('Ngày không')
})
it('preserves reassignment authority and rejects old sender or late old evidence',()=>{
  const owner=event({source:'b',kind:'owner',owner:'b@example.test',due:null,quote:'Tôi chuyển trách nhiệm cho b@example.test.'})
  const done=event({source:'c',kind:'completed',owner:null,due:null,quote:'Tôi đã gửi đủ, việc này xong.'})
  const mails=[first,mail('b',owner.quote,'a@example.test','2026-11-18T02:00:00Z'),mail('c',done.quote,'b@example.test','2026-11-19T02:00:00Z')]
  expect(normalizeLivingEvents([event(),owner,done],mails,'s').map(row=>row.blocked)).toEqual([null,null,null])
  expect(normalizeLivingEvents([event(),owner,done],[...mails.slice(0,2),{...mails[2],sender:'a@example.test'}],'s')[2].blocked).toContain('trách nhiệm')
  expect(normalizeLivingEvents([event(),done],[first,{...mails[2],sender:'a@example.test',at:'2026-11-16T02:00:00Z'}],'s')[1].blocked).toContain('đến muộn')
})
it('does not let model ordering change the arrival order',()=>{
  const move=event({source:'b',kind:'deadline',due:'2026-11-23',quote:'Tôi chốt đổi sang ngày 23/11/2026.'})
  const normalized=normalizeLivingEvents([move,event()],[first,mail('b',move.quote,'a@example.test','2026-11-18T02:00:00Z')],'s')
  expect(normalized.map(row=>row.kind)).toEqual(['create','deadline']);expect(normalized.every(row=>!row.blocked)).toBe(true)
})
it('keeps other confirmed terms while applying one update',()=>{
  const candidate:ReviewedEvent={...event({kind:'deadline',due:'2026-11-23'}),referenceKey:'living:test',blocked:null,index:0,target:null,version:1,receipt:null,
    previous:{title:'Gửi bản vẽ',ownerName:null,ownerEmail:'a@example.test',status:'open',dueOn:'2026-11-20',dueAt:null}}
  expect(proposedLivingState(candidate)).toEqual({title:'Gửi bản vẽ',ownerName:null,ownerEmail:'a@example.test',status:'open',dueOn:'2026-11-23',dueAt:null})
  expect(livingCommand.safeParse({action:'analyze',sourceId:'bad',userId:'foreign'}).success).toBe(false)
})
it('uses only the fixed loopback endpoint with redirect rejection and bounded output',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:'qwen3-4b-living',choices:[{finish_reason:'length',message:{content:'{}'}}]})))
  vi.stubGlobal('fetch',fetcher)
  await expect(livingChat([],{})).rejects.toThrow('budget')
  expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:57340/v1/chat/completions',expect.objectContaining({redirect:'error'}))
})
it('maps only known model aliases and always releases the local single-flight guard on failure',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('bad'))
  vi.stubGlobal('fetch',fetcher)
  await expect(interpretLivingMail([first])).rejects.toThrow()
  await expect(interpretLivingMail([first])).rejects.not.toThrow('busy')
})
