import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
const button=(page,name)=>page.getByRole('button',{name,exact:true})
const endpoint='/api/commitments/living'
export async function rehearseReviewMemory(o){
 const {app,admin,userId,accounts,sync,open,capture,reviewAt,record,restartNext,output}=o
 let page=o.page
 const metrics={actualSourceOpens:0,fieldEdits:0,decisionWrites:0,reopenCycles:3,repeatedReviewWithMemory:0,repeatedReviewWithoutMemory:0}
 const started=performance.now()
 async function deliver(account,uid,body,day=8,thread='review-'+uid){
  accounts[account].deliver([{id:uid,threadId:thread,from:'binh.tran@studio.example.test',at:`2027-04-${String(day).padStart(2,'0')}T02:00:00Z`,subject:'Mẫu bìa cần gửi',body,messageId:'<'+uid+'@example.test>'}]);await sync()
  return (await admin.from('emails').select('id').eq('user_id',userId).eq('original_uid',uid).single()).data.id
 }
 async function analyze(source){const response=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:source},timeout:85_000});assert.equal(response.status(),200,await response.text());return response.json()}
 async function view(id,p=page){await p.goto(app+'/commitments/living?analysis='+id);await p.getByRole('region',{name:'Đề xuất cam kết sống'}).waitFor();await p.getByText('Đang đọc phân tích đã lưu',{exact:true}).waitFor({state:'hidden'})}
 async function decision(p,review,index,restore=false,reason='not_relevant'){
  const entry=p.locator(`[data-event-index="${index}"]`)
  if(restore)await p.getByText(/^Đã bỏ qua \(/).click()
  await button(entry,restore?'Hoàn tác bỏ qua':'Bỏ qua').click()
  const modal=p.getByRole('dialog',{name:restore?'Hoàn tác bỏ qua':'Bỏ qua đề xuất'})
  if(!restore)await modal.getByLabel('Lý do bỏ qua').selectOption(reason)
  await button(modal,restore?'Đưa lại vào rà soát':'Xác nhận bỏ qua').click()
  await modal.waitFor({state:'hidden'});metrics.decisionWrites++
 }
 const body='Tôi sẽ gửi mẫu bìa ngày 12/04/2027.'
 const work=await deliver('work','review-work',body),finance=await deliver('finance','review-finance',body)
 const w=await analyze(work),f=await analyze(finance)
 const event=w.events.find(e=>e.kind==='create'&&!e.blocked),twin=f.events.find(e=>e.kind==='create'&&!e.blocked)
 assert.ok(event&&twin,'Actual model must identify both synthetic account promises')
 assert.notEqual(w.id,f.id)
 await view(w.id)
 // Open real tenant-visible source and return to the same saved analysis.
 await page.locator(`[data-event-index="${event.index}"]`).getByRole('link',{name:'Mở email nguồn',exact:true}).click()
 await page.waitForURL('**/inbox?email='+work);metrics.actualSourceOpens++
 await view(w.id)
 const stale=await open(o.email);await view(w.id,stale)
 await button(stale.locator(`[data-event-index="${event.index}"]`),'Bỏ qua').click()
 const attempts=[]
 await page.route('**'+endpoint,async route=>{
  if(route.request().method()!=='POST'||route.request().postDataJSON().action!=='review')return route.continue()
  const response=await route.fetch({maxRetries:0});attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
  if(attempts.length===1&&response.ok())return route.abort('internetdisconnected')
  return route.fulfill({response})
 })
 await button(page.locator(`[data-event-index="${event.index}"]`),'Bỏ qua').click()
 const modal=page.getByRole('dialog',{name:'Bỏ qua đề xuất'})
 await modal.getByLabel('Lý do bỏ qua').selectOption('not_relevant')
 await button(modal,'Xác nhận bỏ qua').click();await modal.getByRole('alert').waitFor()
 try{await page.context().setOffline(true);await restartNext()}finally{await page.context().setOffline(false)}
 await button(modal,'Thử lại cùng yêu cầu').click();await modal.waitFor({state:'hidden'});metrics.decisionWrites++
 await page.waitForFunction(()=>document.activeElement?.id==='living-review-heading')
 assert.equal(attempts.length,2);assert.equal(attempts[0].key,attempts[1].key);assert.equal(attempts[1].result.replayed,true)
 await page.unroute('**'+endpoint)
 await button(stale.getByRole('dialog',{name:'Bỏ qua đề xuất'}),'Xác nhận bỏ qua').click()
 await stale.getByRole('alert').filter({hasText:'phiên bản đã thay đổi'}).waitFor()
 assert.equal((await reviewAt(page,w.id)).events[event.index].disposition.version,1)
 const blockedConfirm=await page.request.post(app+endpoint,{headers:{'Idempotency-Key':randomUUID()},data:{action:'confirm',analysisId:w.id,index:event.index,expectedVersion:null,
  state:{title:'Mẫu bìa',ownerName:null,ownerEmail:'binh.tran@studio.example.test',dueOn:'2027-04-12',dueAt:null,status:'open'}}})
 assert.equal(blockedConfirm.status(),409)
 record('Dismissal survives a lost acknowledgement, offline browser and Next restart. Retry replays one append-only decision; stale-tab dismiss and direct approval of the dismissed item are rejected.',true)
 // Close/relaunch Chrome itself, not merely a new page/context.
 page=await o.relaunch()
 for(let cycle=0;cycle<3;cycle++){
  await page.setViewportSize(cycle%2?{width:390,height:844}:{width:1440,height:960})
  await view(w.id)
  metrics.repeatedReviewWithMemory+=await button(page,'Xem và xác nhận').count()
  assert.equal((await reviewAt(page,w.id)).events[event.index].disposition.active,true)
  await view(f.id)
  metrics.repeatedReviewWithoutMemory+=await button(page,'Xem và xác nhận').count()
 }
 assert.equal(metrics.repeatedReviewWithMemory,0);assert.equal(metrics.repeatedReviewWithoutMemory,3)
 assert.equal((await reviewAt(page,f.id)).events[twin.index].disposition,null)
 record('Across three real Chrome desktop/mobile reopens, the dismissed work-account proposal requires zero repeat reviews; the unchanged, not-dismissed comparison in finance remains visible in all three. Account decisions do not leak.',true)
 await view(w.id)
 await page.getByText(/^Đã bỏ qua \(/).click()
 await button(page.locator(`[data-event-index="${event.index}"]`),'Hoàn tác bỏ qua').click()
 const undo=page.getByRole('dialog',{name:'Hoàn tác bỏ qua'})
 try {await page.context().setOffline(true);await button(undo,'Đưa lại vào rà soát').click();await undo.getByRole('alert').waitFor()}finally{await page.context().setOffline(false)}
 assert.equal((await reviewAt(page,w.id)).events[event.index].disposition.active,true)
 await button(undo,'Thử lại cùng yêu cầu').click();await undo.waitFor({state:'hidden'});metrics.decisionWrites++
 assert.equal((await reviewAt(page,w.id)).events[event.index].disposition.version,2)
 assert.equal(await button(page,'Xem và xác nhận').count(),1)
 await decision(page,w,event.index,false,'duplicate')
 assert.equal((await reviewAt(page,w.id)).events[event.index].disposition.version,3)
 await capture(page,'remembered-dismissal-desktop')
 // New material evidence must surface while the old unchanged promise stays dismissed.
 assert.equal(Number(o.sql(`SELECT count(*) FROM private.commitment_revisions r JOIN private.commitments c ON c.user_id=r.user_id AND c.id=r.commitment_id WHERE c.user_id='${userId}' AND c.reference_key='${event.referenceKey}'`)),0)
 await page.getByText(/^Đã bỏ qua \(/).click()
 await button(page.locator(`[data-event-index="${event.index}"]`),'Hoàn tác bỏ qua').click()
 await deliver('work','review-new-evidence','Tôi chốt đổi hạn gửi mẫu bìa sang ngày 16/04/2027.',9,'review-review-work')
 await button(page.getByRole('dialog',{name:'Hoàn tác bỏ qua'}),'Đưa lại vào rà soát').click()
 await page.getByRole('dialog',{name:'Hoàn tác bỏ qua'}).getByRole('alert').filter({hasText:'phiên bản đã thay đổi'}).waitFor()
 await button(page.getByRole('dialog',{name:'Hoàn tác bỏ qua'}),'Đóng').first().click()
 const fresh=await analyze(work),creation=fresh.events.find(e=>e.kind==='create'),change=fresh.events.find(e=>e.kind==='deadline'&&!e.blocked)
 assert.ok(change,'New actual local inference must return the deadline change')
 assert.equal(creation.disposition.active,true);assert.equal(change.disposition,null)
 await view(fresh.id)
 await page.getByText(/Hạn:/).count() // Before/after is available after the original is confirmed.
 await decision(page,fresh,creation.index,true)
 await button(page.locator(`[data-event-index="${creation.index}"]`),'Xem và xác nhận').click()
 const confirm=page.getByRole('dialog',{name:'Xác nhận cam kết sống'})
 await button(confirm,'Xác nhận và ghi sổ').click();await confirm.waitFor({state:'hidden'})
 await page.getByText('Hạn: 2027-04-12 → 2027-04-16',{exact:true}).waitFor()
 await button(page.locator(`[data-event-index="${change.index}"]`),'Xem và xác nhận').click()
 await button(page.getByRole('dialog',{name:'Xác nhận cam kết sống'}),'Xác nhận và ghi sổ').click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 const current=await reviewAt(page,fresh.id),receipt=current.events[change.index].receipt
 assert.ok(receipt);const detail=await(await page.request.get(app+'/api/commitments/'+receipt.id)).json()
 assert.equal(detail.version,2);assert.equal(detail.state.dueOn,'2027-04-16')
 assert.equal(detail.history.length,2)
 await capture(page,'new-evidence-confirmed-desktop')
 record('An offline undo leaves the recorded dismissal unchanged; retry restores the proposal without touching the ledger; re-dismiss appends a new decision. A later deadline remains visible, stale-source undo is blocked, and the reviewer restores/accepts the original then confirms the real new change with before/after and exact sources.',true)
 const outsider=await open(o.previousEmail)
 assert.equal((await outsider.request.get(app+endpoint+'?analysis='+fresh.id)).status(),404)
 assert.equal((await outsider.request.post(app+endpoint,{headers:{'Idempotency-Key':randomUUID()},data:{action:'review',analysisId:f.id,index:twin.index,expectedDecisionVersion:0,expectedVersion:null,decision:'dismiss',reason:'not_commitment'}})).status(),404)
 assert.equal(Number(o.sql(`SELECT count(*) FROM private.living_review_history WHERE user_id='${userId}'`)),4)
 assert.equal((await reviewAt(page,f.id)).events[twin.index].disposition,null)
 writeFileSync(output+'/review-memory.json',JSON.stringify({metrics,elapsedMs:performance.now()-started,replay:attempts[1].result,sourceBound:true,
  ledger:{id:receipt.id,version:detail.version},provenance:'Actual Chrome actions on real local-model proposals. Simulated role relevance/oracle decisions, not human time or model false-positive measurement.'},null,2)+'\n')
 record('Other users cannot read or change the review history. Four explicit review revisions survive restart without duplicates; review decisions never created ledger revisions, while two separate approved writes did.',true)
}
