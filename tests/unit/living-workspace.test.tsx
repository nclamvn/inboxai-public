// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest'
const nav=vi.hoisted(()=>({replace:vi.fn(),query:'source=owned-source'}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace:nav.replace}),useSearchParams:()=>new URLSearchParams(nav.query)}))
import {LivingWorkspace} from '@/components/commitments/living-workspace'
const dialogPrototype=HTMLDialogElement.prototype
const dialogMethods=Object.fromEntries(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(dialogPrototype,name)]))
beforeAll(()=>Object.defineProperties(dialogPrototype,{
  showModal:{configurable:true,value(this:HTMLDialogElement){this.open=true}},
  close:{configurable:true,value(this:HTMLDialogElement){this.open=false}},
}))
afterAll(()=>{for(const name of ['showModal','close']){const descriptor=dialogMethods[name];if(descriptor)Object.defineProperty(dialogPrototype,name,descriptor);else Reflect.deleteProperty(dialogPrototype,name)}})
beforeEach(()=>{vi.clearAllMocks();nav.query='source=owned-source'})
afterEach(cleanup)
const renderWorkspace=()=>render(<LivingWorkspace threads={[{id:'owned-source',subject:'Hội thoại được chọn',account:'work@example.test'}]}/> )
it('does not present transport failure as a successful analysis with no commitments',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Offline')))
  renderWorkspace()
  expect(screen.getByText('Chưa phân tích',{exact:true})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  await waitFor(()=>expect(screen.getByText('Phân tích chưa hoàn tất',{exact:true})).toBeTruthy())
  expect(screen.queryByRole('region',{name:'Đề xuất cam kết sống'})).toBeNull()
  expect(screen.queryByText('Chưa tìm thấy đề xuất trong lần phân tích này',{exact:true})).toBeNull()
  expect(nav.replace).not.toHaveBeenCalled()
})
it('labels an empty saved analysis as a non-guarantee and offers no write action',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'analysis',sourceId:'owned-source',model:'local-model',stale:false,
    metrics:{calls:1,elapsedMs:50,inputTokens:10,outputTokens:5,coverage:{messages:2,proposals:0,blocked:0,unresolvedDates:0}},events:[]}))))
  renderWorkspace()
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  await waitFor(()=>expect(screen.getByText('Chưa tìm thấy đề xuất trong lần phân tích này',{exact:true})).toBeTruthy())
  expect(screen.getByText(/Kết quả này không bảo đảm đã phát hiện mọi cam kết/)).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Xem và xác nhận'})).toBeNull()
  expect(nav.replace).toHaveBeenCalledWith('/commitments/living?analysis=analysis',{scroll:false})
})
it('keeps the same-analysis approval open when the saved analysis URL catches up',async()=>{
  const result={id:'analysis',sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1},
    events:[{source:'owned-source',origin:'owned-source',item:1,kind:'create',certainty:'firm',title:'Gửi hồ sơ',quote:'Tôi sẽ gửi hồ sơ.',owner:'a@example.test',due:null,
      index:0,referenceKey:'living:test',blocked:null,target:null,version:null,previous:null,receipt:null}]}
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify(result))))
  const view=renderWorkspace()
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Xem và xác nhận'})).toBeTruthy())
  fireEvent.click(screen.getByRole('button',{name:'Xem và xác nhận'}))
  expect(screen.getByRole('dialog',{name:'Xác nhận cam kết sống'})).toBeTruthy()
  nav.query='analysis=analysis'
  view.rerender(<LivingWorkspace threads={[{id:'owned-source',subject:'Hội thoại được chọn',account:'work@example.test'}]}/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Xác nhận và ghi sổ'})).toHaveProperty('disabled',false))
  expect(screen.getByRole('dialog',{name:'Xác nhận cam kết sống'})).toBeTruthy()
  expect(screen.getByDisplayValue('Gửi hồ sơ')).toBeTruthy()
})
it('closes a previous approval when navigating to a different saved analysis',async()=>{
  const base={sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1}}
  const event={source:'owned-source',origin:'owned-source',item:1,kind:'create',certainty:'firm',title:'Hồ sơ A',quote:'Tôi gửi hồ sơ A.',owner:'a@example.test',due:null,
    index:0,referenceKey:'living:a',blocked:null,target:null,version:null,previous:null,receipt:null}
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async url=>new Response(JSON.stringify(String(url).includes('analysis=b')
    ?{...base,id:'b',events:[{...event,title:'Hồ sơ B'}]}:{...base,id:'a',events:[event]}))))
  const view=renderWorkspace()
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Xem và xác nhận'})).toBeTruthy())
  fireEvent.click(screen.getByRole('button',{name:'Xem và xác nhận'}))
  expect(screen.getByRole('dialog')).toBeTruthy()
  nav.query='analysis=b'
  view.rerender(<LivingWorkspace threads={[{id:'owned-source',subject:'Hội thoại được chọn',account:'work@example.test'}]}/>)
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Cam kết mới · Hồ sơ B'})).toBeTruthy())
})
it('retains in-flight analysis when the source URL catches up after a quick selection',async()=>{
  let release!:(response:Response)=>void
  vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise<Response>(resolve=>{release=resolve})))
  const threads=[{id:'owned-source',subject:'A',account:'work@example.test'},{id:'second-source',subject:'B',account:'finance@example.test'}]
  const view=render(<LivingWorkspace threads={threads}/>)
  fireEvent.change(screen.getByLabelText('Hội thoại trong tài khoản của bạn'),{target:{value:'second-source'}})
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  nav.query='source=second-source'
  view.rerender(<LivingWorkspace threads={threads}/>)
  expect(screen.getByRole('button',{name:/Phân tích bằng LLM local/})).toHaveProperty('disabled',true)
  release(new Response(JSON.stringify({id:'second-analysis',sourceId:'second-source',model:'local',stale:false,events:[],metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1}})))
  await waitFor(()=>expect(screen.getByText('Chưa tìm thấy đề xuất trong lần phân tích này',{exact:true})).toBeTruthy())
  expect(nav.replace).toHaveBeenCalledWith('/commitments/living?analysis=second-analysis',{scroll:false})
})
it('does not navigate back into analysis after the user has left the workspace',async()=>{
  let release!:(response:Response)=>void
  vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise<Response>(resolve=>{release=resolve})))
  const view=renderWorkspace()
  fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
  view.unmount()
  release(new Response(JSON.stringify({id:'analysis',sourceId:'owned-source',model:'local',stale:false,events:[],metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1}})))
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(nav.replace).not.toHaveBeenCalled()
})
it('freezes a dismissal after an uncertain result and retries exactly the same decision/key',async()=>{
 const result={id:'analysis',sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1},
  events:[{source:'owned-source',origin:'owned-source',item:1,kind:'create',certainty:'firm',title:'Gửi hồ sơ',quote:'Tôi sẽ gửi hồ sơ.',owner:'a@example.test',due:null,
   index:0,referenceKey:'living:test',blocked:null,target:null,version:null,previous:null,receipt:null,disposition:null}]}
 const writes:RequestInit[]=[]
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url,init)=>{
  const command=init?.body?JSON.parse(String(init.body)):null
  if(command?.action==='review'){writes.push(init);if(writes.length===1)throw Error('Lost acknowledgement');return new Response('{}')}
  return new Response(JSON.stringify(result))
 }))
 renderWorkspace();fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:/^Bỏ qua$/})).toBeTruthy())
 fireEvent.click(screen.getByRole('button',{name:/^Bỏ qua$/}))
 fireEvent.change(screen.getByLabelText('Lý do bỏ qua'),{target:{value:'not_relevant'}})
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận bỏ qua'}))
 await screen.findByRole('alert')
 expect(screen.getByLabelText('Lý do bỏ qua')).toHaveProperty('disabled',true)
 fireEvent.click(screen.getByRole('button',{name:'Thử lại cùng yêu cầu'}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
 expect(writes).toHaveLength(2);expect(writes[0].body).toBe(writes[1].body)
 expect(writes[0].headers).toEqual(writes[1].headers)
 expect(JSON.parse(String(writes[0].body))).toMatchObject({reason:'not_relevant',expectedDecisionVersion:0,expectedVersion:null})
})
it('does not restore another account analysis when a previous decision response arrives late',async()=>{
 const base={sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1}}
 const event={source:'owned-source',origin:'owned-source',item:1,kind:'create',certainty:'firm',title:'Hồ sơ A',quote:'Tôi gửi hồ sơ A.',owner:'a@example.test',due:null,index:0,referenceKey:'living:a',blocked:null,target:null,version:null,previous:null,receipt:null}
 let release!:(r:Response)=>void
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url,init)=>{
  const body=init?.body?JSON.parse(String(init.body)):null
  if(body?.action==='review')return new Promise<Response>(resolve=>{release=resolve})
  return new Response(JSON.stringify(String(url).includes('analysis=b')?{...base,id:'b',sourceId:'second-source',events:[{...event,title:'Hồ sơ B',source:'second-source'}]}:{...base,id:'a',events:[event]}))
 }))
 const view=renderWorkspace();fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
 await screen.findByRole('button',{name:/^Bỏ qua$/});fireEvent.click(screen.getByRole('button',{name:/^Bỏ qua$/}))
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận bỏ qua'}))
 nav.query='analysis=b';view.rerender(<LivingWorkspace threads={[{id:'second-source',subject:'B',account:'finance@example.test'}]}/>)
 await screen.findByRole('heading',{name:'Cam kết mới · Hồ sơ B'})
 release(new Response('{}'))
 await new Promise(resolve=>setTimeout(resolve,0))
 expect(screen.getByRole('heading',{name:'Cam kết mới · Hồ sơ B'})).toBeTruthy()
 expect(screen.queryByText('Đã lưu quyết định rà soát. Sổ cam kết không thay đổi.')).toBeNull()
})
it('does not replace a saved receipt with an older URL-restore response',async()=>{
 const event={source:'owned-source',origin:'owned-source',item:1,kind:'create',certainty:'firm',title:'Gửi hồ sơ',quote:'Tôi sẽ gửi hồ sơ.',owner:'a@example.test',due:null,index:0,referenceKey:'living:a',blocked:null,target:null,version:null,previous:null,receipt:null}
 const base={id:'a',sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1},events:[event]}
 let releaseWrite!:(r:Response)=>void,releaseOldRead!:(r:Response)=>void,reads=0
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url,init)=>{
  const body=init?.body?JSON.parse(String(init.body)):null
  if(body?.action==='analyze')return new Response(JSON.stringify(base))
  if(body?.action==='confirm')return new Promise<Response>(resolve=>{releaseWrite=resolve})
  if(++reads===1)return new Promise<Response>(resolve=>{releaseOldRead=resolve})
  return new Response(JSON.stringify({...base,events:[{...event,receipt:{id:'ledger',version:1}}]}))
 }))
 const view=renderWorkspace();fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
 await screen.findByRole('button',{name:'Xem và xác nhận'});fireEvent.click(screen.getByRole('button',{name:'Xem và xác nhận'}))
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận và ghi sổ'}))
 nav.query='analysis=a';view.rerender(<LivingWorkspace threads={[{id:'owned-source',subject:'A',account:'work@example.test'}]}/>)
 await waitFor(()=>expect(reads).toBe(1));releaseWrite(new Response('{}'))
 await screen.findByRole('link',{name:'Đã ghi · Mở lịch sử'})
 releaseOldRead(new Response(JSON.stringify(base)));await new Promise(resolve=>setTimeout(resolve,0))
 expect(screen.getByRole('link',{name:'Đã ghi · Mở lịch sử'})).toBeTruthy()
 expect(screen.queryByText('Đang đọc phân tích đã lưu')).toBeNull()
})
it.each([false,true])('shows before/after only for an unconfirmed change (confirmed=%s)',async confirmed=>{
 const result={id:'a',sourceId:'owned-source',model:'local',stale:false,metrics:{elapsedMs:1,calls:1,inputTokens:1,outputTokens:1},events:[{
  source:'owned-source',origin:'owned-source',item:1,kind:'deadline',certainty:'firm',title:'Đổi hạn gửi hồ sơ',quote:'Tôi đổi hạn gửi hồ sơ sang ngày 23/11/2026.',owner:null,due:'2026-11-23',
  index:0,referenceKey:'living:a',blocked:null,target:'ledger',version:1,receipt:confirmed?{id:'ledger',version:2}:null,
  previous:{title:'Hồ sơ',ownerName:null,ownerEmail:'a@example.test',dueOn:'2026-11-20',dueAt:null,status:'open'}}]}
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify(result))))
 renderWorkspace();fireEvent.click(screen.getByRole('button',{name:'Phân tích bằng LLM local'}))
 await screen.findByRole('heading',{name:'Đổi hạn · Đổi hạn gửi hồ sơ'})
 expect(!!screen.queryByText('Hạn: 2026-11-20 → 2026-11-23')).toBe(!confirmed)
})
