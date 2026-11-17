import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {CredentialVault} from '../../src/lib/credential-vault/vault.ts'
import {parseKeyring} from '../../src/lib/credential-vault/crypto.ts'
import {vaultKeys} from '../local-auth/vault.mjs'
import {signIn,button} from './local-pilot/fixture.mjs'
import {audit} from './browser.mjs'
import * as legacyEvaluation from '../eval/living/benchmark.mjs'

const endpoint='/api/commitments/living'
export async function seedLivingCommitments({userId,previousId,previousEmail,admin,appFetch,sql,googleProvider,record,evaluation=legacyEvaluation}) {
  const {cases}=evaluation,prefix=cases[0].id.split('-')[0]+'-%'
  const vault=new CredentialVault(admin,parseKeyring(vaultKeys,'local1')),accounts={}
  for(const name of ['work','finance']) {
    const address='living-'+name+'@example.test',box=googleProvider.registerMailbox(address,true),id=randomUUID()
    await vault.write({userId,accountId:id},{kind:'google',accessToken:box.tokens.access_token,refreshToken:box.tokens.refresh_token,
      expiresAt:new Date(Date.now()+3_600_000).toISOString(),scope:box.tokens.scope,googleSubject:address,sendDisabled:false},0,
    {email_address:address,display_name:name,provider:'gmail'})
    accounts[name]={...box,id,address}
  }
  for(const row of cases)for(const mail of row.emails)accounts[row.account].deliver([{id:row.id+'-'+mail.id,threadId:'living-'+row.id,
    from:mail.sender,subject:row.subject,body:mail.body,at:mail.at,messageId:'<'+row.id+'-'+mail.id+'@example.test>'}])
  async function sync() {
    const response=await appFetch('/api/source-accounts/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{"refresh":true}'})
    assert.equal(response.status,200,await response.text())
  }
  const expected=cases.reduce((n,row)=>n+row.emails.length,0)
  for(let attempt=0;attempt<8;attempt++){await sync();if(Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND original_uid LIKE '${prefix}'`))===expected)break}
  const {data:mails,error}=await admin.from('emails').select('id,original_uid,source_account_id').eq('user_id',userId).like('original_uid',prefix)
  assert.equal(error,null);assert.equal(mails.length,expected)
  const ids=new Map(mails.map(mail=>[mail.original_uid,mail.id])),reverse=new Map(mails.map(mail=>[mail.id,mail.original_uid]))
  for(const row of cases)for(const mail of row.emails) {
    await admin.from('emails').update({created_at:mail.arrivedAt,category:'work'}).eq('id',ids.get(row.id+'-'+mail.id)).eq('user_id',userId).throwOnError()
  }
  await admin.from('whitelist').upsert({email:previousEmail,is_active:true},{onConflict:'email'}).throwOnError()
  const foreignId=randomUUID()
  await admin.from('source_accounts').insert({id:foreignId,user_id:previousId,email_address:'living-foreign@example.test',provider:'custom'}).throwOnError()
  const foreignMail=randomUUID()
  await admin.from('emails').insert({id:foreignMail,user_id:previousId,source_account_id:foreignId,from_address:'private@example.test',subject:cases[0].subject,body_text:'Nội dung tenant khác.',thread_id:'living-LC-01'}).throwOnError()
  record(`${cases.length} frozen conversations arrive through two synthetic Gmail sync checkpoints; all message bytes are stored and same-subject foreign mail remains a separate tenant.`,true)
  return {accounts,ids,reverse,sync,expected,foreignMail}
}
export async function rehearseLivingCommitments(options) {
  const {app,base,email,password,userId,admin,previousEmail,googleProvider,restartNext,record,output}=options
  const {cases,score,write}=options.evaluation??legacyEvaluation
  const {accounts,ids,reverse,sync,expected,foreignMail}=await seedLivingCommitments(options)
  const launch=()=>chromium.launch({channel:'chrome',proxy:{server:'http://127.0.0.1:1',bypass:'127.0.0.1'}})
  let browser=await launch()
  const runtime=[]
  let page
  const results=[],reviews=new Map(),decisions=[]
  const started=performance.now()
  let simulatedReviewMs=0
  async function open(address,viewport={width:1440,height:960}) {
    const p=await signIn(browser,app,address,password,viewport)
    p.on('pageerror',error=>runtime.push(error.message))
    await p.context().route('**/*',route=>[app,base].includes(new URL(route.request().url()).origin)?route.continue():route.abort())
    return p
  }
  async function capture(p,name) {
    assert.deepEqual(await audit(p),[])
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await p.screenshot({path:output+'/'+name+'.png',animations:'disabled',fullPage:true})
  }
  async function reviewAt(p,id) {
    const response=await p.request.get(app+endpoint+'?analysis='+id)
    assert.equal(response.status(),200,await response.text());return response.json()
  }
  const rowSource=row=>ids.get(row.id+'-'+row.emails.at(-1).id)
  const alias=(row,event)=>({...event,source:reverse.get(event.source)?.slice(row.id.length+1)??event.source,
    origin:reverse.get(event.origin)?.slice(row.id.length+1)??event.origin})
  async function confirm(p,index) {
    const entry=p.locator('[data-event-index="'+index+'"]')
    await button(entry,'Xem và xác nhận').click()
    const modal=p.getByRole('dialog',{name:'Xác nhận cam kết sống'})
    await button(modal,'Xác nhận và ghi sổ').click()
    await modal.waitFor({state:'hidden'})
    await p.getByRole('status').filter({hasText:'Đã xác nhận và ghi sổ có nguồn.'}).waitFor()
    await entry.getByRole('link',{name:'Đã ghi · Mở lịch sử',exact:true}).waitFor()
  }
  try {
    page=await open(email)
    let outsider=await open(previousEmail)
    assert.equal((await outsider.request.post(app+endpoint,{data:{action:'analyze',sourceId:rowSource(cases[0])}})).status(),404)
    assert.equal((await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:foreignMail}})).status(),404)
    assert.equal((await fetch(app+endpoint)).status,401)
    await page.goto(app+'/commitments/living?source='+rowSource(cases[0]))
    await page.getByText('Chưa phân tích',{exact:true}).waitFor()
    try {
      await page.context().setOffline(true)
      await button(page,'Phân tích bằng LLM local').click()
      await page.getByText('Phân tích chưa hoàn tất',{exact:true}).waitFor()
      assert.equal(await page.getByRole('region',{name:'Đề xuất cam kết sống'}).count(),0)
    }finally{await page.context().setOffline(false)}
    record('Offline analysis remains an explicit incomplete state, never an empty successful analysis or an implicit approval.',true)
    for(const [index,row]of cases.entries()) {
      await page.setViewportSize(index%2?{width:390,height:844}:{width:1440,height:960})
      await page.goto(app+'/commitments/living?source='+rowSource(row))
      const start=performance.now()
      const responsePromise=page.waitForResponse(response=>response.url()===app+endpoint&&response.request().method()==='POST',{timeout:85_000})
      await button(page,'Phân tích bằng LLM local').click()
      const response=await responsePromise
      const responseMs=performance.now()-start
      let events=[],metrics={},error
      if(!response.ok()) error=(await response.json()).error
      else {
        const review=await response.json();reviews.set(row.id,review)
        await page.waitForURL('**/commitments/living?analysis=*')
        await page.getByRole('region',{name:'Đề xuất cam kết sống'}).waitFor()
        if(!review.events.length) {
          await page.getByText('Chưa tìm thấy đề xuất trong lần phân tích này',{exact:true}).waitFor()
          assert.equal(await page.getByRole('button',{name:'Xem và xác nhận',exact:true}).count(),0)
        }
        events=review.events.filter(event=>!event.blocked&&event.certainty==='firm').map(event=>alias(row,event))
        metrics={...review.metrics,modelMs:review.metrics.elapsedMs}
        if(index%8===0||index===23)await capture(page,'conversation-'+row.id+(index%2?'-mobile':'-desktop'))
        const again=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:rowSource(row)}})
        assert.equal(again.status(),200,await again.text());assert.equal((await again.json()).id,review.id)
      }
      results.push({id:row.id,events,analysis:reviews.get(row.id),...metrics,elapsedMs:responseMs,...(error?{error}:{})})
      write('product',{model:'qwen3-4b-living',cases:results})
      console.log('LIVING',row.id,events.length,error??'',Math.round(performance.now()-start)+' ms')
    }
    record(`All ${cases.length} frozen conversations complete actual local inference on alternating Chrome desktop/mobile viewports. Empty analyses remain explicit non-guarantees; cached re-analysis returns the same persisted analysis.`,results.length===cases.length&&results.every(result=>!result.error))

    let release,seen
    const gate=new Promise(resolve=>{release=resolve}),requested=new Promise(resolve=>{seen=resolve})
    const oldAnalysis=reviews.get(cases[0].id)
    await page.route('**'+endpoint+'?analysis='+oldAnalysis.id,async route=>{
      const response=await route.fetch();seen();await gate
      await route.fulfill({response}).catch(()=>{}) // Selection may abort this old GET.
    })
    await page.goto(app+'/commitments/living?analysis='+oldAnalysis.id)
    await requested
    await page.getByLabel('Hội thoại trong tài khoản của bạn').selectOption(rowSource(cases[1]))
    release()
    await page.waitForURL('**/commitments/living?source='+rowSource(cases[1]))
    await page.getByText('Chưa phân tích',{exact:true}).waitFor()
    assert.equal(await page.getByLabel('Hội thoại trong tài khoản của bạn').inputValue(),rowSource(cases[1]))
    assert.equal(await page.getByRole('region',{name:'Đề xuất cam kết sống'}).count(),0)
    await page.unroute('**'+endpoint+'?analysis='+oldAnalysis.id)
    record('A delayed cached-analysis response cannot replace the newly selected account/thread or show the previous thread’s suggestions.',true)

    const twin=cases.find(row=>row.id==='LC-09')??cases[8]
    accounts.finance.deliver([{id:'same-title-other-account',threadId:'living-'+twin.id,from:'minh.ncc@example.test',at:'2026-11-17T02:00:00Z',
      subject:twin.subject,body:'Chuyển để tham khảo, chưa có cam kết mới.',messageId:'<other-account@example.test>'}])
    await sync()
    const twinId=(await admin.from('emails').select('id').eq('user_id',userId).eq('original_uid','same-title-other-account').single()).data.id
    const twinResult=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:twinId},timeout:85_000})
    assert.equal(twinResult.status(),200,await twinResult.text())
    const twinReview=await twinResult.json()
    assert.notEqual(twinReview.id,reviews.get(twin.id).id)
    assert.equal((await reviewAt(page,reviews.get(twin.id).id)).stale,false)
    assert.ok(twinReview.events.every(event=>event.source===twinId),'Same Gmail thread ID and subject must never merge account evidence')
    record('Identical subject and Gmail thread ID in the second owned account produce a separate analysis and do not invalidate or mix the first account’s evidence.',true)

    // Simulated reviewer accepts only events matching the frozen labels. This is
    // explicit oracle-assisted acceptance, not measured human review or AI quality.
    const reviewStarted=performance.now()
    for(const row of cases) {
      const analysis=reviews.get(row.id)
      if(!analysis)continue
      await page.setViewportSize({width:390,height:844})
      await page.goto(app+'/commitments/living?analysis='+analysis.id)
      for(const candidate of analysis.events) {
        if(candidate.blocked||score(row,[alias(row,candidate)]).correct!==1)continue
        const current=await reviewAt(page,analysis.id),event=current.events[candidate.index]
        if(event.kind!=='create'&&!event.previous)continue
        await confirm(page,candidate.index)
        const saved=await reviewAt(page,analysis.id)
        const receipt=saved.events[candidate.index].receipt
        assert.ok(receipt)
        const detail=await page.request.get(app+'/api/commitments/'+receipt.id)
        const ledger=await detail.json()
        assert.equal(ledger.history[0].sources[0].emailId,event.source)
        assert.equal(ledger.history[0].sources[0].quote,event.quote)
        decisions.push({case:row.id,index:event.index,receipt})
      }
    }
    assert.ok(decisions.length>0,'The live model must produce at least one valid approvable event')
    simulatedReviewMs=performance.now()-reviewStarted
    record('A scripted reviewer confirms only gold-matching suggestions through the mobile UI. Each stored revision preserves its exact source and quote; incorrect or blocked model suggestions are not silently approved.',true)

    // New source arrives while a previously loaded approval modal remains open.
    // Use a new conversation whose first phrase is deliberately outside the old rules.
    const mailbox=accounts.work,uid='stale-original',thread='living-interruption'
    mailbox.deliver([{id:uid,threadId:thread,from:'minh.ncc@example.test',at:'2026-11-23T02:00:00Z',subject:'Bản hướng dẫn lắp máy',
      body:'Tôi nhận gửi bản hướng dẫn lắp máy vào ngày 27/11/2026.',messageId:'<stale-original@example.test>'}])
    await sync()
    const source=(await admin.from('emails').select('id').eq('user_id',userId).eq('original_uid',uid).single()).data.id
    await page.setViewportSize({width:1440,height:960})
    await page.goto(app+'/commitments/living?source='+source)
    const restoredAnalysis=page.waitForResponse(r=>r.url().startsWith(app+endpoint+'?analysis=')&&r.request().method()==='GET',{timeout:85_000})
    const pending=page.waitForResponse(r=>r.url()===app+endpoint&&r.request().method()==='POST',{timeout:85_000})
    await button(page,'Phân tích bằng LLM local').click()
    const loaded=await pending;assert.equal(loaded.status(),200,await loaded.text())
    const stale=await loaded.json()
    const first=stale.events.find(event=>event.kind==='create'&&!event.blocked)
    assert.ok(first,'Live model must identify the interruption scenario')
    await page.waitForURL('**/commitments/living?analysis='+stale.id)
    assert.equal((await restoredAnalysis).status(),200)
    await page.getByText('Có đề xuất chờ bạn rà soát',{exact:true}).waitFor()
    await button(page.locator('[data-event-index="'+first.index+'"]'),'Xem và xác nhận').click()
    mailbox.deliver([{id:'stale-new',threadId:thread,from:'minh.ncc@example.test',at:'2026-11-24T02:00:00Z',subject:'Re: Bản hướng dẫn lắp máy',body:'Chốt lại, bản hướng dẫn lắp máy tôi gửi ngày 30/11/2026 thay ngày 27.',messageId:'<stale-new@example.test>'}])
    await sync()
    const modal=page.getByRole('dialog',{name:'Xác nhận cam kết sống'})
    await button(modal,'Xác nhận và ghi sổ').click()
    await modal.getByRole('alert').filter({hasText:'phiên bản đã thay đổi'}).waitFor()
    assert.equal((await reviewAt(page,stale.id)).events[first.index].receipt,null)
    await button(modal,'Đóng').first().click()
    await page.reload()
    await page.getByRole('alert').filter({hasText:'Hội thoại đã có thay đổi.'}).waitFor()
    record('A new Gmail message arrives after the approval modal opens. The database rejects the stale conversation manifest and records no decision; reload retains the analysis and marks it stale.',true)

    // Existing analyzed event, fresh source snapshot; simulate lost write receipt.
    const again=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:source},timeout:85_000})
    assert.equal(again.status(),200,await again.text())
    const fresh=await again.json()
    const create=fresh.events.find(event=>event.kind==='create'&&!event.blocked)
    assert.ok(create)
    await page.goto(app+'/commitments/living?analysis='+fresh.id)
    await button(page.locator('[data-event-index="'+create.index+'"]'),'Xem và xác nhận').click()
    const attempts=[]
    await page.route('**'+endpoint,async route=>{
      if(route.request().method()!=='POST'||route.request().postDataJSON().action!=='confirm')return route.continue()
      const result=await route.fetch({maxRetries:0});attempts.push({key:route.request().headers()['idempotency-key'],body:await result.json(),status:result.status()})
      if(attempts.length===1&&result.ok())return route.abort('internetdisconnected')
      return route.fulfill({response:result})
    })
    const active=page.getByRole('dialog',{name:'Xác nhận cam kết sống'})
    await active.getByLabel('Nội dung cam kết',{exact:true}).fill('Gửi bản hướng dẫn lắp máy đã rà soát')
    await button(active,'Xác nhận và ghi sổ').click()
    await active.getByRole('alert').waitFor()
    try{await page.context().setOffline(true);await restartNext()}finally{await page.context().setOffline(false)}
    await button(active,'Thử lại cùng yêu cầu').click()
    await active.waitFor({state:'hidden'})
    assert.equal(attempts.length,2);assert.equal(attempts[0].key,attempts[1].key)
    assert.equal(attempts[1].body.replayed,true)
    assert.equal(attempts[0].body.id,attempts[1].body.id)
    await page.unroute('**'+endpoint)
    const ledgerId=attempts[0].body.id
    await page.reload()
    await page.locator('[data-event-index="'+create.index+'"]').getByRole('link',{name:'Đã ghi · Mở lịch sử',exact:true}).waitFor()
    await capture(page,'interruption-restored-desktop')
    await browser.close()
    browser=await launch()
    page=await open(email)
    await page.goto(app+'/commitments/living?analysis='+fresh.id)
    await page.locator('[data-event-index="'+create.index+'"]').getByRole('link',{name:'Đã ghi · Mở lịch sử',exact:true}).waitFor()
    outsider=await open(previousEmail)
    const mobile=await open(email,{width:390,height:844})
    await mobile.goto(app+'/commitments/living?analysis='+fresh.id)
    await mobile.locator('[data-event-index="'+create.index+'"]').getByRole('link',{name:'Đã ghi · Mở lịch sử',exact:true}).click()
    await mobile.getByRole('heading',{name:'Lịch sử',exact:true}).waitFor()
    await capture(mobile,'persistent-ledger-mobile')
    await mobile.goto(app+'/search?commitment='+ledgerId)
    await mobile.getByRole('heading',{name:'Cam kết này hiện thế nào?',exact:true}).waitFor()
    await mobile.getByText('minh.ncc@example.test',{exact:true}).waitFor()
    await mobile.getByText('2026-11-27',{exact:true}).waitFor()
    await capture(mobile,'ask-confirmed-state-mobile')
    record('A lost approval acknowledgement, offline browser and Next restart replay the same request key and one ledger decision. Chrome is closed and relaunched, then a new mobile session opens the saved receipt, history and evidence without another model call.',true)

    const loadedEvent=(await reviewAt(page,fresh.id)).events.find(event=>event.kind==='deadline'&&!event.blocked)
    assert.ok(loadedEvent,'The interruption conversation must retain its update proposal')
    const oldTab=await open(email)
    await oldTab.goto(app+'/commitments/living?analysis='+fresh.id)
    await button(oldTab.locator('[data-event-index="'+loadedEvent.index+'"]'),'Xem và xác nhận').click()
    const detail=await(await page.request.get(app+'/api/commitments/'+ledgerId)).json()
    const evidence=detail.history[0].sources[0]
    const {review:unused,...ordinary}=detail.state;void unused
    const changed=await page.request.patch(app+'/api/commitments/'+ledgerId,{headers:{'Idempotency-Key':randomUUID()},data:{operation:'revise',expectedVersion:detail.version,state:{...ordinary,title:ordinary.title+' · Đã rà soát'},evidence:[{emailId:evidence.emailId,field:evidence.field,quote:evidence.quote}]}})
    assert.equal(changed.status(),200,await changed.text())
    await button(oldTab.getByRole('dialog',{name:'Xác nhận cam kết sống'}),'Xác nhận và ghi sổ').click()
    await oldTab.getByRole('alert').filter({hasText:'phiên bản đã thay đổi'}).waitFor()
    assert.equal((await reviewAt(page,fresh.id)).events[loadedEvent.index].receipt,null)

    // Resume from the current ledger version, then infer a genuinely new reply.
    await page.goto(app+'/commitments/living?analysis='+fresh.id)
    await confirm(page,loadedEvent.index)
    const revised=await(await page.request.get(app+'/api/commitments/'+ledgerId)).json()
    assert.equal(revised.version,3)
    assert.equal(revised.state.dueOn,'2026-11-30')
    assert.equal(revised.state.title,'Gửi bản hướng dẫn lắp máy đã rà soát · Đã rà soát')
    mailbox.deliver([{id:'living-completed',threadId:thread,from:'minh.ncc@example.test',at:'2026-11-28T02:00:00Z',
      subject:'Re: Bản hướng dẫn lắp máy',body:'Tôi đã gửi đủ bản hướng dẫn lắp máy. Cam kết này đã hoàn tất.',messageId:'<living-completed@example.test>'}])
    await sync()
    const finalResponse=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:source},timeout:85_000})
    assert.equal(finalResponse.status(),200,await finalResponse.text())
    const completedReview=await finalResponse.json()
    const finish=completedReview.events.find(event=>event.kind==='completed'&&!event.blocked)
    assert.ok(finish,'A real new reply must yield the completion proposal')
    assert.equal(finish.target,ledgerId,'New analysis must attach to the already confirmed commitment')
    await page.setViewportSize({width:390,height:844})
    await page.goto(app+'/commitments/living?analysis='+completedReview.id)
    await page.locator('[data-event-index="'+completedReview.events.find(event=>event.kind==='create').index+'"]').getByRole('link',{name:/Đã (?:có trong sổ|ghi) · Mở lịch sử/u}).waitFor()
    await confirm(page,finish.index)
    const closed=await(await page.request.get(app+'/api/commitments/'+ledgerId)).json()
    assert.equal(closed.version,4)
    assert.equal(closed.state.status,'completed')
    assert.equal(closed.state.dueOn,'2026-11-30')
    assert.equal(closed.state.title,revised.state.title)
    await page.goto(app+'/search?commitment='+ledgerId)
    await page.getByText('Hoàn tất',{exact:true}).waitFor()
    await capture(page,'completed-living-state-mobile')
    record('A fresh ledger review applies the new deadline without overwriting the user-edited title. A later real-model completion attaches to the same commitment, appends version 4 and closes it; the original promise is shown as already in the ledger.',true)
    // A previous, explicitly confirmed short quote must remain the same task
    // when the new extractor selects the complete decisive sentence.
    const legacyBody='Chị Lan, tôi sẽ gửi danh mục bàn giao ngày 28/01/2027.'
    mailbox.deliver([{id:'quote-legacy-source',threadId:'living-quote-continuity',from:'minh.ncc@example.test',at:'2027-01-21T02:00:00Z',subject:'Danh mục bàn giao riêng',body:legacyBody,messageId:'<quote-legacy@example.test>'}])
    await sync()
    const legacySource=(await admin.from('emails').select('id').eq('user_id',userId).eq('original_uid','quote-legacy-source').single()).data.id
    const legacyQuote='tôi sẽ gửi danh mục bàn giao ngày 28/01/2027.'
    const legacySaved=await page.request.post(app+'/api/commitments',{headers:{'Idempotency-Key':randomUUID()},data:{referenceKey:'living:legacy-quote-continuity',
      state:{title:'Danh mục đã chỉnh tay',ownerName:null,ownerEmail:'minh.ncc@example.test',dueOn:'2027-01-28',dueAt:null,status:'open'},
      evidence:[{emailId:legacySource,field:'body_text',quote:legacyQuote}]}})
    assert.equal(legacySaved.status(),201,await legacySaved.text())
    const oldReceipt=await legacySaved.json()
    mailbox.deliver([{id:'quote-deadline-source',threadId:'living-quote-continuity',from:'minh.ncc@example.test',at:'2027-01-22T02:00:00Z',subject:'Re: Danh mục bàn giao riêng',body:'Tôi chốt đổi hạn gửi danh mục bàn giao sang ngày 30/01/2027.',messageId:'<quote-deadline@example.test>'}])
    await sync()
    const continuityResponse=await page.request.post(app+endpoint,{data:{action:'analyze',sourceId:legacySource},timeout:85_000})
    assert.equal(continuityResponse.status(),200,await continuityResponse.text())
    const continuity=await continuityResponse.json(),move=continuity.events.find(event=>event.kind==='deadline'&&!event.blocked)
    assert.ok(move);assert.equal(move.target,oldReceipt.id)
    await page.goto(app+'/commitments/living?analysis='+continuity.id)
    await confirm(page,move.index)
    const kept=await(await page.request.get(app+'/api/commitments/'+oldReceipt.id)).json()
    assert.equal(kept.version,2);assert.equal(kept.state.title,'Danh mục đã chỉnh tay');assert.equal(kept.state.dueOn,'2027-01-30')
    await capture(page,'quote-continuity-mobile')
    record('A previously confirmed shorter creation quote is linked through unique owned source evidence when the live model selects the full sentence; a new deadline appends to the same ledger and preserves the user-edited title.',true)
    if(options.evaluation?.rehearseReviewMemory)await options.evaluation.rehearseReviewMemory({...options,accounts,ids,reverse,sync,page,outsider,open,capture,reviewAt,
      relaunch:async()=>{await browser.close();browser=await launch();page=await open(email);return page}})
    if(options.evaluation?.rehearseReviewMemory)outsider=await open(previousEmail)
    assert.equal((await outsider.request.get(app+endpoint+'?analysis='+fresh.id)).status(),404)
    assert.deepEqual(runtime,[])
    assert.equal(googleProvider.calls.sendAttempts,0)
    writeFileSync(output+'/browser.json',JSON.stringify({chrome:browser.version(),conversations:cases.length,messages:expected,
      provenance:'Actual local-model proposals; oracle-assisted simulated reviewer, not human effort.',decisions,
      timing:{analysisApiMs:results.reduce((n,row)=>n+row.elapsedMs,0),scriptedReviewMs:simulatedReviewMs,journeyMs:performance.now()-started},
      interruption:{ledgerId,replay:attempts[1].body.replayed,staleManifestRejected:true,staleLedgerRejected:true,chromeRelaunched:true,closedVersion:closed.version},actualExternalSends:0},null,2)+'\n')
    record('A second stale tab is rejected after a separate ledger revision, even with unchanged email. Tenant/anonymous boundaries remain enforced; no email is sent and audited desktop/mobile states have no axe violation or horizontal overflow.',true)
  }catch(error){await page?.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});throw error}
  finally{await browser.close()}
}
