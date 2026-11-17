// Additional real-Chrome acceptance on the final local preview: secondary review
// decisions, plus icon placement after the small post-journey visual correction.
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {chromium} from 'playwright-core'
import {signIn,button} from './local-pilot/fixture.mjs'
import {audit} from './browser.mjs'
const app='http://127.0.0.1:57300',endpoint=app+'/api/commitments/living',output='test-results/living-review'
const browser=await chromium.launch({channel:'chrome',proxy:{server:'http://127.0.0.1:1',bypass:'127.0.0.1'}})
const page=await signIn(browser,app,'mai.nguyen@example.test','Synthetic-passphrase-123')
const runtime=[];page.on('pageerror',e=>runtime.push(e.message))
await page.context().route('**/*',route=>[app,'http://127.0.0.1:57321'].includes(new URL(route.request().url()).origin)?route.continue():route.abort())
async function request(body){const r=await page.request.post(endpoint,{data:body,timeout:85_000});assert.equal(r.status(),200,await r.text());return r.json()}
async function read(id){const r=await page.request.get(endpoint+'?analysis='+id);assert.equal(r.status(),200,await r.text());return r.json()}
async function select(subject){
 await page.goto(app+'/commitments/living')
 const select=page.getByLabel('Hội thoại trong tài khoản của bạn')
 const options=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent})))
 const source=options.find(o=>o.text.startsWith(subject+' · '))?.value
 assert.ok(source,'Missing preview conversation '+subject)
 return request({action:'analyze',sourceId:source})
}
async function view(id){await page.goto(app+'/commitments/living?analysis='+id);await page.getByRole('region',{name:'Đề xuất cam kết sống'}).waitFor();await page.getByText('Đang đọc phân tích đã lưu',{exact:true}).waitFor({state:'hidden'})}
async function screenshot(name){assert.deepEqual(await audit(page),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(await page.evaluate(()=>{const main=document.querySelector('main'),header=document.querySelector('header'),heading=document.querySelector('#living-review-heading');return [main,main?.parentElement,header,heading].filter(Boolean).map(el=>{const r=el.getBoundingClientRect();return {inside:r.left>=-1&&r.right<=innerWidth+1,noHiddenHorizontalScroll:el.scrollWidth<=el.clientWidth+1&&el.scrollLeft===0}})}),Array.from({length:4},()=>({inside:true,noHiddenHorizontalScroll:true}))); await page.screenshot({path:output+'/'+name+'.png',fullPage:true,animations:'disabled'})}
async function aligned(control){assert.equal(await control.evaluate(el=>{const icon=el.querySelector('svg')?.getBoundingClientRect(),label=el.lastElementChild?.getBoundingClientRect();return !!icon&&!!label&&icon.right<=label.left&&Math.abs((icon.y+icon.height/2)-(label.y+label.height/2))<=2}),true,'Icon and label must share one line')}
try{
 const uncertain=await select('Xin ảnh'),candidate=uncertain.events.find(e=>e.blocked)
 assert.ok(candidate,'Actual local model must retain an inspectable non-firm request')
 assert.equal(uncertain.events.filter(e=>!e.blocked).length,0)
 await page.setViewportSize({width:390,height:844});await view(uncertain.id)
 await page.getByText(/^Chưa đủ bằng chứng \(/).click()
 const entry=page.locator(`[data-event-index="${candidate.index}"]`)
 assert.equal(await button(page,'Xem và xác nhận').count(),0)
 await aligned(button(entry,'Bỏ qua'))
 await button(entry,'Bỏ qua').click()
 const dismiss=page.getByRole('dialog',{name:'Bỏ qua đề xuất'})
 await dismiss.getByLabel('Lý do bỏ qua').selectOption('not_commitment');await button(dismiss,'Xác nhận bỏ qua').click();await dismiss.waitFor({state:'hidden'})
 await page.waitForFunction(()=>document.activeElement?.id==='living-review-heading')
 await page.reload();await page.getByText(/^Đã bỏ qua \(/).click()
 await aligned(button(page.locator(`[data-event-index="${candidate.index}"]`),'Hoàn tác bỏ qua'))
 await screenshot('secondary-dismissed-mobile')
 await button(page.locator(`[data-event-index="${candidate.index}"]`),'Hoàn tác bỏ qua').click()
 const undo=page.getByRole('dialog',{name:'Hoàn tác bỏ qua'});await button(undo,'Đưa lại vào rà soát').click();await undo.waitFor({state:'hidden'})
 const restored=await read(uncertain.id)
 assert.equal(restored.events[candidate.index].disposition.active,false);assert.equal(restored.events[candidate.index].disposition.version,2)
 assert.ok(restored.events[candidate.index].blocked)
 assert.equal(await button(page,'Xem và xác nhận').count(),0)
 const denied=await page.request.post(endpoint,{headers:{'Idempotency-Key':randomUUID()},data:{action:'confirm',analysisId:uncertain.id,index:candidate.index,expectedVersion:null,
 state:{title:'Request is not a promise',ownerName:null,ownerEmail:null,dueOn:null,dueAt:null,status:'open'}}})
 assert.equal(denied.status(),422,'Undo must not promote unsupported evidence to an approvable promise')
 await screenshot('secondary-restored-mobile')
 const live=await select('bản mẫu hộp'),create=live.events.find(e=>e.kind==='create'&&!e.blocked)
 assert.ok(create)
 await view(live.id)
 const item=page.locator(`[data-event-index="${create.index}"]`)
 await button(item,'Xem và xác nhận').click()
 const confirm=page.getByRole('dialog',{name:'Xác nhận cam kết sống'});await button(confirm,'Xác nhận và ghi sổ').click();await confirm.waitFor({state:'hidden'})
 await page.getByText('Hạn: 2027-03-12 → 2027-03-16',{exact:true}).waitFor()
 await screenshot('final-preview-mobile')
 await page.setViewportSize({width:1440,height:960});await screenshot('final-preview-desktop')
 for(const control of await page.getByRole('button',{name:'Bỏ qua',exact:true}).all())await aligned(control)
 assert.deepEqual(runtime,[])
 const result={at:new Date().toISOString(),chrome:browser.version(),preview:app+'/commitments/living?analysis='+live.id,
  uncertainAnalysis:uncertain.id,secondaryDismissedAndRestored:true,unsupportedApprovalBlocked:true,focusRestored:true,iconsAligned:true,axeViolations:0,
  provenance:'Actual Qwen local inference, authenticated database and Chrome desktop/mobile; simulated reviewer. Additional final-render acceptance, not another 60-case quality run.'}
 writeFileSync(output+'/preview-smoke.json',JSON.stringify(result,null,2)+'\n');console.log(result)
}catch(error){await page.screenshot({path:output+'/preview-failure.png',fullPage:true}).catch(()=>{});throw error}
finally{await browser.close()}
