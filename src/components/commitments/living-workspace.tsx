'use client'
import { useEffect,useRef,useState } from 'react'
import Link from 'next/link'
import { useRouter,useSearchParams } from 'next/navigation'
import { FileText,ClipboardCheck,ScanText,CircleAlert,Undo2,EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { proposedLivingState,type LivingReview,type ReviewedEvent } from '@/lib/commitments/living-contracts'

type Thread={id:string;subject:string|null;account:string|null}
const endpoint='/api/commitments/living'
const inputClass='mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 text-base text-[var(--foreground)] sm:text-sm'
const kinds={create:'Cam kết mới',deadline:'Đổi hạn',owner:'Đổi người phụ trách',completed:'Báo hoàn tất',cancelled:'Hủy cam kết'}
const link='neo-target inline-flex min-h-11 items-center gap-2 break-words text-sm text-[var(--accent-foreground)] underline underline-offset-4'
async function json(url:string,init?:RequestInit) {
  const response=await fetch(url,{...init,cache:'no-store'})
  const body=await response.json()
  if(!response.ok)throw new Error(body.error??'Chưa hoàn tất yêu cầu.')
  return body
}
function EventReview({event,analysis,stale,onClose,onSaved}:{event:ReviewedEvent;analysis:string;stale:boolean;onClose:()=>void;onSaved:()=>void}) {
  const initial=proposedLivingState(event)
  const [state,setState]=useState(initial)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const pending=useRef<{key:string;payload:string}|null>(null)
  const [frozen,setFrozen]=useState(false)
  if(!initial||!state)return null
  async function confirm() {
    if(busy||!state)return
    if(!pending.current)pending.current={key:crypto.randomUUID(),payload:JSON.stringify({action:'confirm',analysisId:analysis,index:event.index,expectedVersion:event.kind==='create'?null:event.version,state})}
    setBusy(true);setFrozen(true);setError(null)
    try {
      await json(endpoint,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':pending.current.key},body:pending.current.payload,signal:AbortSignal.timeout(15_000)})
      onSaved()
    }catch(cause){setError((cause as Error).message+' Nếu chưa rõ kết quả, thử lại giữ nguyên yêu cầu.')}finally{setBusy(false)}
  }
  const editable=!frozen&&!stale
  return <Modal open onClose={onClose} title="Xác nhận cam kết sống" size="lg">
    <p className="text-sm">{kinds[event.kind]} · Phiên bản đang xem: {event.version??'chưa tạo'}</p>
    {event.previous&&<p className="my-3 text-sm">Trước: {event.previous.title} · {event.previous.ownerEmail??'Chưa rõ người'} · {event.previous.dueOn??'Chưa có hạn'} · {event.previous.status}</p>}
    <blockquote className="my-3 border-s-2 border-[var(--accent)] ps-3 text-sm">{event.quote}</blockquote>
    <Link className={link} href={'/inbox?email='+event.source}>Mở email nguồn</Link>
    {event.dateResolution?.status==='ambiguous'&&<p className="mt-3 text-sm text-[var(--warning)]">Bộ phân giải chưa xác định chắc chắn được ngày từ câu nguồn. Bạn có thể giữ chưa có hạn hoặc đối chiếu rồi nhập ngày.</p>}
    <div className="grid gap-3 py-3">
      <label className="text-sm">Nội dung cam kết<input className={inputClass} value={state.title} disabled={!editable||event.kind!=='create'} onChange={e=>setState({...state,title:e.target.value})}/></label>
      <label className="text-sm">Email người phụ trách<input className={inputClass} value={state.ownerEmail??''} disabled={!editable||!['create','owner'].includes(event.kind)} onChange={e=>setState({...state,ownerEmail:e.target.value||null})}/></label>
      <label className="text-sm">Ngày đến hạn<input className={inputClass} type="date" value={state.dueOn??''} disabled={!editable||!['create','deadline'].includes(event.kind)} onChange={e=>setState({...state,dueOn:e.target.value||null})}/></label>
    </div>
    <p className="text-xs text-[var(--foreground-muted)]">Bạn xác nhận ý nghĩa và trách nhiệm. Câu trích khớp không tự chứng minh LLM hiểu đúng. Không có email được gửi ở bước này.</p>
    {error&&<p role="alert" className="my-3 text-sm text-[var(--error)]">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" onClick={onClose}>Đóng</Button>
      <Button disabled={stale} loading={busy} onClick={()=>void confirm()}>{frozen?'Thử lại cùng yêu cầu':'Xác nhận và ghi sổ'}</Button></div>
  </Modal>
}
const reviewReasons={not_commitment:'Không phải cam kết',not_relevant:'Không cần theo dõi việc này',duplicate:'Đã theo dõi ở nơi khác'}
function ReviewDecision({event,analysis,stale,onClose,onSaved}:{event:ReviewedEvent;analysis:string;stale:boolean;onClose:()=>void;onSaved:()=>void}) {
  const restore=event.disposition?.active===true
  const [reason,setReason]=useState<keyof typeof reviewReasons>('not_commitment')
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[frozen,setFrozen]=useState(false)
  const pending=useRef<{key:string;payload:string}|null>(null)
  async function decide(){
    if(busy)return
    if(!pending.current)pending.current={key:crypto.randomUUID(),payload:JSON.stringify({action:'review',analysisId:analysis,index:event.index,
      expectedDecisionVersion:event.disposition?.version??0,expectedVersion:event.version,decision:restore?'restore':'dismiss',reason:restore?null:reason})}
    setBusy(true);setFrozen(true);setError(null)
    try {await json(endpoint,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':pending.current.key},body:pending.current.payload,signal:AbortSignal.timeout(15_000)});onSaved()}
    catch(cause){setError((cause as Error).message+' Nếu chưa rõ kết quả, thử lại giữ nguyên yêu cầu.')}finally{setBusy(false)}
  }
  return <Modal open onClose={onClose} title={restore?'Hoàn tác bỏ qua':'Bỏ qua đề xuất'}>
    <p className="text-sm font-medium">{event.title}</p>
    <blockquote className="my-3 border-s-2 border-[var(--accent)] ps-3 text-sm">{event.quote}</blockquote>
    <Link className={link} href={'/inbox?email='+event.source}>Mở email nguồn</Link>
    {restore?<p className="my-3 text-sm">Đưa đề xuất trở lại để rà soát. Sổ cam kết chưa thay đổi.</p>:<>
      <label className="my-3 block text-sm">Lý do bỏ qua<select className={inputClass} disabled={frozen||stale} value={reason} onChange={e=>setReason(e.target.value as keyof typeof reviewReasons)}>
        {Object.entries(reviewReasons).map(([key,label])=><option value={key} key={key}>{label}</option>)}
      </select></label>
      <p className="text-sm text-[var(--foreground-secondary)]">Ghi nhớ quyết định với đúng bằng chứng này. Thư mới hoặc thông tin thay đổi vẫn được đưa ra rà soát. Không xóa email và không sửa sổ cam kết.</p>
    </>}
    {error&&<p role="alert" className="my-3 text-sm text-[var(--error)]">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" onClick={onClose}>Đóng</Button>
      <Button loading={busy} disabled={stale} onClick={()=>void decide()}>{frozen?'Thử lại cùng yêu cầu':restore?'Đưa lại vào rà soát':'Xác nhận bỏ qua'}</Button></div>
  </Modal>
}
function changedField(event:ReviewedEvent) {
  if(!event.previous||event.kind==='create'||event.receipt)return null
  if(event.kind==='deadline')return `Hạn: ${event.previous.dueOn??'Chưa có'} → ${event.due??'Cần xác nhận ngày'}`
  if(event.kind==='owner')return `Phụ trách: ${event.previous.ownerEmail??'Chưa rõ'} → ${event.owner??'Chưa rõ'}`
  return `Trạng thái: ${event.previous.status} → ${event.kind==='completed'?'Hoàn tất':'Hủy'}`
}
export function LivingWorkspace({threads}:{threads:Thread[]}) {
  const params=useSearchParams(),router=useRouter()
  const [source,setSource]=useState(params.get('source')??'')
  const sourceSelection=useRef(source)
  const [review,setReview]=useState<LivingReview|null>(null)
  const currentReview=useRef<LivingReview|null>(null)
  const reviewHeading=useRef<HTMLHeadingElement|null>(null)
  useEffect(()=>{currentReview.current=review},[review])
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  const [selected,setSelected]=useState<{event:ReviewedEvent;analysisId:string;decision?:boolean}|null>(null)
  const [notice,setNotice]=useState('')
  const generation=useRef(0)
  useEffect(()=>()=>{generation.current++;currentReview.current=null},[])
  const [restoring,setRestoring]=useState(Boolean(params.get('analysis')))
  const analysis=params.get('analysis')
  const requestedSource=params.get('source')
  useEffect(()=>{
    if(!analysis){
      const next=requestedSource??''
      if(sourceSelection.current===next)return // URL caught up with the user's existing selection.
      sourceSelection.current=next;generation.current++;setBusy(false);setReview(null);setSource(next);setSelected(null);setRestoring(false);setError(null);return
    }
    setBusy(false)
    setSelected(current=>current?.analysisId===analysis?current:null)
    const token=++generation.current
    const controller=new AbortController()
    setReview(current=>current?.id===analysis?current:null)
    setRestoring(true);setError(null)
    void json(endpoint+'?analysis='+analysis,{signal:controller.signal}).then(result=>{
      if(!controller.signal.aborted&&token===generation.current){sourceSelection.current=result.sourceId;setReview(result);setSource(result.sourceId)}
    }).catch(cause=>{if(!controller.signal.aborted&&token===generation.current)setError(cause.message)})
      .finally(()=>{if(!controller.signal.aborted&&token===generation.current)setRestoring(false)})
    return()=>controller.abort()
  },[analysis,requestedSource])
  async function analyze() {
    const token=++generation.current
    setBusy(true);setRestoring(false);setError(null);setSelected(null)
    try {
      const result=await json(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'analyze',sourceId:source}),signal:AbortSignal.timeout(80_000)})
      if(token===generation.current){setReview(result);router.replace('/commitments/living?analysis='+result.id,{scroll:false});setNotice('Đã lưu phân tích. Chưa có cam kết nào được tự ghi sổ.')}
    }catch(cause){if(token===generation.current)setError((cause as Error).message)}finally{if(token===generation.current)setBusy(false)}
  }
  const pendingEvents=review?.events.filter(event=>!event.disposition?.active&&!event.receipt&&!(event.kind==='create'&&event.target))??[]
  const needsReview=pendingEvents.some(event=>!event.blocked&&event.dateResolution?.status==='ambiguous')
  const stateLabel=busy?'Đang phân tích hội thoại':restoring?'Đang đọc phân tích đã lưu':error?'Phân tích chưa hoàn tất':
    !review?'Chưa phân tích':review.stale?'Có thư thay đổi, cần phân tích lại':needsReview?'Có điểm cần đối chiếu':
    !review.events.length?'Chưa tìm thấy đề xuất trong lần phân tích này':pendingEvents.some(e=>!e.blocked)?'Có đề xuất chờ bạn rà soát':pendingEvents.length?'Chưa có đề xuất đủ bằng chứng để ghi sổ':'Các đề xuất đã được ghi nhận'
  async function saved(expectedAnalysis:string,expectedSource:string,decision=false) {
    if(currentReview.current?.id!==expectedAnalysis||sourceSelection.current!==expectedSource)return
    const token=++generation.current
    setRestoring(false);setBusy(false)
    setSelected(null);setNotice(decision?'Đã lưu quyết định rà soát. Sổ cam kết không thay đổi.':'Đã xác nhận và ghi sổ có nguồn.')
    try {const next=await json(endpoint+'?analysis='+expectedAnalysis);if(token===generation.current){setReview(current=>current?.id===expectedAnalysis?next:current);reviewHeading.current?.focus({preventScroll:true})}}
    catch{if(token===generation.current)setError('Đã gửi quyết định; tải lại để đọc biên nhận.')}
  }
  return <div className="mx-auto max-w-4xl p-4 sm:p-6">
    <Link href="/commitments" className={link}>Về sổ cam kết</Link>
    <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold"><ClipboardCheck size={24} aria-hidden="true"/>Cam kết sống</h1>
    <p className="mt-2 text-sm text-[var(--foreground-secondary)]">LLM chạy trên máy đọc lời hứa và diễn biến. Kiểm tra đề xuất cùng nguồn trước khi xác nhận.</p>
    <label className="mt-5 block text-sm">Hội thoại trong tài khoản của bạn<select className={inputClass} value={source} disabled={busy} onChange={e=>{generation.current++;sourceSelection.current=e.target.value;setSelected(null);setRestoring(false);setSource(e.target.value);setReview(null);setNotice('');setError(null);router.replace('/commitments/living?source='+e.target.value,{scroll:false})}}>
      <option value="">Chọn hội thoại cần rà soát</option>
      {source&&!threads.some(thread=>thread.id===source)&&<option value={source}>{review?.subject??'Hội thoại đang chọn · Xem email nguồn bên dưới'}</option>}
      {threads.map(thread=><option key={thread.id} value={thread.id}>{thread.subject??'Không có tiêu đề'} · {thread.account??'Tài khoản thư'}</option>)}
    </select></label>
    <Button className="mt-3" loading={busy} disabled={!source||restoring} onClick={()=>void analyze()}>Phân tích bằng LLM local</Button>
    <div aria-live="polite" className="neo-work-item mt-4 border-y border-[var(--border)] py-3 ps-3 text-sm" data-mail-tone={error||needsReview||review?.stale?'important':'work'}>
      <p className="flex items-center gap-2 font-medium">{error||needsReview?<CircleAlert size={16} aria-hidden="true"/>:<ScanText size={16} aria-hidden="true"/>}{stateLabel}</p>
      {review&&<p className="mt-1 text-xs text-[var(--foreground-secondary)]">{review.metrics.coverage?`${review.metrics.coverage.messages} thư trong phạm vi phân tích · `:'Phân tích đã lưu từ phiên bản trước · '}Kết quả này không bảo đảm đã phát hiện mọi cam kết.</p>}
    </div>
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
    {review&&<section aria-label="Đề xuất cam kết sống" className="mt-5 border-y border-[var(--border)]">
      <h2 id="living-review-heading" ref={reviewHeading} tabIndex={-1} className="neo-target py-3 text-base font-semibold">Rà soát cam kết</h2>
      <details className="py-3 text-xs text-[var(--foreground-secondary)]">
        <summary className="neo-target cursor-pointer py-3">Phân tích local đã lưu · Thông tin lần chạy</summary>
        <p className="mt-2 break-words">{review.model} · {review.metrics.elapsedMs} ms · {review.metrics.inputTokens+review.metrics.outputTokens} token</p>
      </details>
      {review.stale&&<p role="alert" className="py-3 text-sm text-[var(--error)]">Hội thoại đã có thay đổi. Đề xuất cũ không được duyệt; phân tích lại để xem nguồn mới.</p>}
      {!review.events.length&&<p className="py-4 text-sm">Chưa tìm thấy đề xuất cam kết trong lần phân tích này. Đây không phải bảo đảm hội thoại không có cam kết.</p>}
      <p className="pb-3 text-sm text-[var(--foreground-secondary)]">{pendingEvents.filter(e=>!e.blocked).length} đề xuất cần quyết định · {review.events.filter(e=>e.disposition?.active).length} đã bỏ qua · {pendingEvents.filter(e=>e.blocked).length} điểm chưa đủ bằng chứng</p>
      {(['active','uncertain','dismissed'] as const).map(group=>{
        const events=review.events.filter(event=>group==='dismissed'?event.disposition?.active:group==='uncertain'?!event.disposition?.active&&!!event.blocked:!event.disposition?.active&&!event.blocked)
        if(!events.length)return null
        const items=<ul>{events.map(event=><li key={event.index} data-event-index={event.index} className="neo-work-item border-t border-[var(--border)] py-4 ps-3" data-mail-tone={event.disposition?.active?'quiet':event.blocked?'important':event.receipt?'complete':'work'}>
          <h3 className="text-sm font-semibold">{kinds[event.kind]} · {event.title}</h3>
          <p className="mt-1 text-xs">{event.certainty==='firm'?'LLM nhận định đã chốt':'Chưa chốt'} · {event.owner??event.previous?.ownerEmail??'Chưa rõ người'} · {event.due??event.previous?.dueOn??'Chưa có hạn'}</p>
          {changedField(event)&&<p className="mt-2 text-sm font-medium">{changedField(event)}</p>}
          <blockquote className="my-2 break-words text-sm">{event.quote}</blockquote>
          {event.disposition&&<p className="mb-2 text-xs text-[var(--foreground-secondary)]">Quyết định #{event.disposition.version}: {event.disposition.active?`Đã bỏ qua · ${event.disposition.reason?reviewReasons[event.disposition.reason]:''}`:'Đã hoàn tác bỏ qua'}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><Link href={'/inbox?email='+event.source} className={link}><FileText size={16} aria-hidden="true"/>Mở email nguồn</Link>
            {event.disposition?.active?<Button variant="outline" leftIcon={<Undo2 size={16} aria-hidden="true"/>} disabled={restoring||review.stale||!!error} onClick={()=>setSelected({event,analysisId:review.id,decision:true})}>Hoàn tác bỏ qua</Button>:
            event.receipt?<><Link href={'/commitments?group=waiting&id='+event.receipt.id} className={link}>Đã ghi · Mở lịch sử</Link>
              <Link href={'/search?commitment='+event.receipt.id} className={link}>Hỏi trạng thái đã xác nhận</Link></>:
            event.kind==='create'&&event.target?<Link href={'/commitments?group=waiting&id='+event.target} className={link}>Đã có trong sổ · Mở lịch sử</Link>:<>
              {event.blocked?<p className="py-3 text-sm text-[var(--warning)]">{event.blocked}</p>:<Button variant="outline" disabled={restoring||review.stale||!!error||(event.kind!=='create'&&!event.previous)} onClick={()=>setSelected({event,analysisId:review.id})}>Xem và xác nhận</Button>}
              <Button variant="ghost" leftIcon={<EyeOff size={16} aria-hidden="true"/>} disabled={restoring||review.stale||!!error} onClick={()=>setSelected({event,analysisId:review.id,decision:true})}>Bỏ qua</Button>
              {event.kind!=='create'&&!event.previous&&<p className="py-3 text-sm">Chưa có cam kết gốc trong sổ để áp dụng thay đổi này. Nếu đã bỏ qua việc gốc, mở mục Đã bỏ qua để đưa lại vào rà soát.</p>}
            </>}
          </div>
        </li>)}</ul>
        return group==='active'?<div key={group}>{items}</div>:<details key={group} className="border-t border-[var(--border)]"><summary className="neo-target cursor-pointer py-3 text-sm font-medium">{group==='dismissed'?'Đã bỏ qua':'Chưa đủ bằng chứng'} ({events.length})</summary>{items}</details>
      })}
    </section>}
    {selected&&review&&selected.analysisId===review.id&&(selected.decision?<ReviewDecision key={'decision:'+selected.analysisId+':'+selected.event.index} event={selected.event} analysis={selected.analysisId} stale={restoring||review.stale||!!error} onClose={()=>setSelected(null)} onSaved={()=>void saved(selected.analysisId,review.sourceId,true)}/>:<EventReview key={selected.analysisId+':'+selected.event.index} event={selected.event} analysis={selected.analysisId} stale={restoring||review.stale||!!error} onClose={()=>setSelected(null)} onSaved={()=>void saved(selected.analysisId,review.sourceId)}/>)}
  </div>
}
