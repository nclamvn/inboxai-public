import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setupPurchase } from './purchase-dues.mjs'

const handoffs = '/api/commitments/handoffs'
const handoffPage = '/commitments/handoffs'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const link = (page,name) => page.getByRole('link',{name,exact:true})
const status = (page,text) => page.getByRole('status').filter({hasText:text}).waitFor()
const blockText = 'Có chứng từ đính chính mới. Mua hàng cần kiểm tra và bàn giao lại trước khi duyệt.'

export async function rehearsePurchaseApprovalFreshness(options) {
  const { app,page,reviewer,outsider,accounts,deliver,request,fileAction,capture,record,invoice,sql,reviewerId,reviewerMailbox } = options
  const supplier = 'yen@linh-kien.example.test'
  const due = new Date(Date.now()+6*86_400_000).toISOString().slice(0,10)
  const laterDue = new Date(Date.now()+10*86_400_000).toISOString().slice(0,10)
  const approve = () => button(reviewer,'Duyệt bản bổ sung').click()
  const detail = async id => {
    const response = await reviewer.request.get(app+handoffs+'?id='+id)
    assert.equal(response.status(),200,await response.text())
    return response.json()
  }

  async function pendingCase(po,original,current) {
    const initial = await setupPurchase({...options,supplier,paymentDue:due,reference:po,number:original})
    const scope = () => request('/api/commitments/payment?id='+initial.orderId)
    await reviewer.goto(app+handoffPage+'?id='+initial.handoffId)
    await button(reviewer,'Yêu cầu bổ sung chứng từ').click()
    await reviewer.getByLabel('Chứng từ cần bổ sung').fill('Cần xác minh hạn thanh toán trên hóa đơn đính chính.')
    await button(reviewer,'Giao yêu cầu cho Mua hàng').click()
    await status(reviewer,'Đã giao yêu cầu bổ sung cho Mua hàng.')

    const csv = (replaces,number,date,reference=po) => [
      invoice+',payment_due',[reference,number,replaces,'B',30,'bộ',2000,'VND',date].join(','),'',
    ].join('\n')
    const mail = (uid,content,age,from=supplier,filename='dinh-chinh.csv') =>
      deliver(po+'-'+uid,'mua-hang',from,age,'Bổ sung hóa đơn',
        'Phiên bản gửi kèm để Mua hàng kiểm tra.',[{filename,contentType:'text/csv',data:Buffer.from(content).toString('base64')}],po)

    const bytes = csv(original,current,due)
    await fileAction(await mail('a',bytes,3),'dinh-chinh.csv','Ghi nhận hóa đơn')
    await page.goto(app+'/commitments/payment?id='+initial.orderId)

    async function handover() {
      await button(page,'Bàn giao bản bổ sung').click()
      await status(page,'Đã bàn giao hồ sơ cho Kế toán.')
      const snapshot = await scope()
      const result = await request(handoffs+'?'+new URLSearchParams({commitment:initial.orderId,invoice:snapshot.invoice.id}))
      return result.pending.id
    }

    const target = await handover()
    await reviewer.goto(app+handoffPage+'?id='+target)
    await reviewer.getByRole('region',{name:'So sánh bản bổ sung'}).getByText('Bản bổ sung · '+current,{exact:true}).waitFor()
    await button(reviewer,'Duyệt bản bổ sung').waitFor()
    return { initial,scope,csv,mail,bytes,target,handover }
  }

  const control = await pendingCase('PO-9974','INV-9074','INV-9174')
  sql(`DO $$ BEGIN
    PERFORM public.confirm_purchase_handoff('${reviewerId}',gen_random_uuid(),
      jsonb_build_object('action','approve','handoffId','${control.target}'));
    RAISE EXCEPTION 'Legacy RPC approved a supplemental handoff without a checked shortlist';
  EXCEPTION WHEN SQLSTATE 'PT433' THEN NULL;
  END $$;`)
  assert.equal((await control.scope()).decisionId,null)
  await control.mail('same-bytes',control.bytes,1)
  await control.mail('untrusted-sender',control.csv('INV-9174','INV-9274',laterDue),0.8,'unrelated@example.test')
  await control.mail('wrong-po',control.csv('INV-9174','INV-9374',laterDue,'PO-9975'),0.6)
  await control.mail('older',control.csv('INV-9174','INV-9474',laterDue),3.5)
  reviewerMailbox.deliver([{
    id:'PO-9974-reviewer-copy',subject:'[PO-9974] Bổ sung hóa đơn',from:supplier,at:new Date().toISOString(),
    body:'Tệp được gửi riêng vào hộp thư Kế toán.',attachments:[{
      filename:'dinh-chinh.csv',contentType:'text/csv',
      data:Buffer.from(control.csv('INV-9174','INV-9574',laterDue)).toString('base64'),
    }],
  }])
  const reviewerSync = await reviewer.request.post(app+'/api/source-accounts/sync',{data:{refresh:true}})
  assert.equal(reviewerSync.status(),200,await reviewerSync.text())
  const synced = await reviewerSync.json()
  assert.deepEqual([synced.success,synced.synced],[true,1])
  await approve()
  await status(reviewer,'Đã duyệt hồ sơ.')
  assert.equal((await control.scope()).invoice.number,'INV-9174')
  assert.deepEqual((await detail(control.target)).exception.events.map(event=>event.action),['request_evidence','submit','approve'])
  record('New mail with a wrong sender, wrong mailbox, wrong PO, old source time or byte-identical copy does not block approval.',true)

  const live = await pendingCase('PO-9978','INV-9078','INV-9178')
  const duplicateUid = 'PO-9978-same-bytes'
  await live.mail('same-bytes',live.bytes,1)
  const pause = accounts['mua-hang'].pauseAttachment(duplicateUid)
  const oldAttempt = reviewer.waitForResponse(response=>response.url()===app+handoffs && response.request().method()==='POST')
  let timer, newEmail
  try {
    await approve()
    await Promise.race([pause.entered,new Promise((_,reject)=>{
      timer = setTimeout(()=>reject(new Error('Chrome approval did not reach the duplicate attachment after reading the shortlist')),6500)
    })])
    newEmail = await live.mail('b',live.csv('INV-9178','INV-9278',laterDue),0.5)
  } finally {
    clearTimeout(timer)
    pause.release()
  }

  // The replacement synced while the first manifest was in use and is still unregistered.
  const blocked = await oldAttempt
  assert.equal(blocked.status(),409,await blocked.text())
  assert.deepEqual(await blocked.json(),{error:blockText})
  await status(reviewer,blockText)
  assert.equal((await live.scope()).invoice.number,'INV-9178')
  assert.equal((await live.scope()).decisionId,null)
  assert.deepEqual((await detail(live.target)).exception.events.map(event=>event.action),['request_evidence','submit'])
  const blockedAgain = await reviewer.request.post(app+handoffs,{
    data:{action:'approve',handoffId:live.target},headers:{'Idempotency-Key':randomUUID()},
  })
  assert.equal(blockedAgain.status(),409,await blockedAgain.text())
  assert.deepEqual(await blockedAgain.json(),{error:blockText})
  const newFiles = await request('/api/emails/'+newEmail+'/attachments')
  const newFile = newFiles.attachments[0].id
  assert.equal((await reviewer.request.get(app+'/api/emails/'+newEmail+'/attachments')).status(),404)
  assert.equal((await reviewer.request.get(app+handoffs+'?'+new URLSearchParams({id:live.target,file:newFile}))).status(),404)
  assert.equal((await outsider.request.post(app+handoffs,{
    data:{action:'approve',handoffId:live.target},headers:{'Idempotency-Key':randomUUID()},
  })).status(),404)
  await capture('PO-9978-tab-cu-chan-duyet',reviewer)
  record('The new correction syncs while Chrome approval is in flight. The stale transaction writes no decision and the reviewer sees a scoped hold without mailbox access.',true)

  await page.goto(app+'/inbox')
  const row = page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).getByRole('listitem')
    .filter({has:page.getByRole('heading',{name:/^PO-9978 ·/})})
  await link(row,'Xem trước chứng từ mới').click()
  await page.waitForURL(url=>url.pathname==='/commitments/payment' && url.searchParams.get('file')===newFile)
  await button(page,'Ghi nhận hóa đơn').click()
  await status(page,'Đã ghi nhận chứng từ.')
  await link(page,'Mở hồ sơ đối soát').click()
  const current = await live.handover()
  await reviewer.reload()
  await reviewer.getByText('Đã có lần bàn giao mới',{exact:true}).waitFor()
  assert.equal(await button(reviewer,'Duyệt bản bổ sung').count(),0)
  await reviewer.goto(app+handoffPage+'?id='+current)
  await reviewer.getByRole('region',{name:'So sánh bản bổ sung'}).getByText('Bản bổ sung · INV-9278',{exact:true}).waitFor()
  const attempts = []
  const pattern = '**'+handoffs
  await reviewer.route(pattern,async route=>{
    if (route.request().method()!=='POST' || route.request().postDataJSON().action!=='approve') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),receipt:await response.json()})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  try {
    await approve()
    await button(reviewer,'Thử lại cùng yêu cầu').click()
    await status(reviewer,'Đã duyệt hồ sơ.')
  } finally {
    await reviewer.unroute(pattern)
  }
  assert.deepEqual(attempts.map(attempt=>[attempt.status,attempt.receipt.replayed]),[[200,false],[200,true]])
  assert.equal(attempts[0].key,attempts[1].key)
  assert.ok(attempts[0].receipt.decisionId)
  assert.equal(attempts[0].receipt.decisionId,attempts[1].receipt.decisionId)
  await reviewer.reload()
  await reviewer.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
  const closed = await detail(current)
  assert.deepEqual(closed.exception.events.map(event=>[event.action,event.invoice]),[
    ['request_evidence','INV-9078'],['submit','INV-9178'],['submit','INV-9278'],['approve','INV-9278'],
  ])
  const committed = await live.scope()
  assert.deepEqual([committed.decisionId,committed.invoice.evidence.emailId,committed.invoice.evidence.attachmentId],
    [attempts[0].receipt.decisionId,newEmail,newFile])
  await capture('PO-9978-da-duyet-ban-moi',reviewer)
  record('The buyer delegates the exact corrected attachment, the old tab stays superseded, and a lost response replays the single persisted decision for the new version.',true)
}
