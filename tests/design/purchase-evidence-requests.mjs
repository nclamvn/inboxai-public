import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setupPurchase } from './purchase-dues.mjs'

const endpoint = '/api/commitments/evidence-requests'
const handoffs = '/api/commitments/handoffs'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const link = (page,name) => page.getByRole('link',{name,exact:true})
const status = (page,text) => page.getByRole('status').filter({hasText:text}).waitFor()

export async function rehearsePurchaseEvidenceRequests(options) {
  const {app,page,reviewer,outsider,request,accounts,capture,record,restartNext,googleProvider,reviewerMailbox,sql,invoice} = options
  const po = 'PO-9992', original = 'INV-9092', corrected = 'INV-9192'
  const supplier = 'chung-tu@example.test'
  const base = new Date().toISOString().slice(0,10)
  const day = offset => new Date(Date.parse(base)+offset*86_400_000).toISOString().slice(0,10)
  const due = day(7)
  const setup = await setupPurchase({...options,reference:po,number:original,supplier,paymentDue:due})
  const context = () => request(endpoint+'?case='+setup.handoffId)
  const mailbox = accounts['mua-hang']
  const outer = page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).getByRole('listitem')
    .filter({has:page.getByRole('heading',{name:/^PO-9992 ·/})})
  const panel = outer.getByRole('region',{name:'Yêu cầu và theo dõi chứng từ'})
  const files = outer.getByRole('region',{name:'Chứng từ bổ sung từ email'})
  const counts = () => [googleProvider.calls.sendAttempts,googleProvider.calls.sent.length]
  const scope = () => request('/api/commitments/payment?id='+setup.orderId)
  const dateLabel = 'Ngày kiểm tra lại (giờ Việt Nam)'
  const reason = 'Cần hóa đơn đính chính có hạn thanh toán và mã hóa đơn được thay thế.'

  async function clock(offset) {
    const time = day(offset)+'T02:00:00Z'
    sql(`CREATE OR REPLACE FUNCTION private.reply_followup_today() RETURNS date LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT (TIMESTAMPTZ '${time}' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $$;`)
    await page.clock.setFixedTime(new Date(time))
  }
  async function inbox() { await page.goto(app+'/inbox'); await panel.waitFor() }
  async function track(offset) {
    await page.getByLabel(dateLabel).fill(day(offset))
    await button(page,'Theo dõi hồi đáp').click()
    await page.getByText('Đang theo dõi hồi đáp',{exact:true}).waitFor()
  }
  async function previewSend() {
    await button(page,'Xem trước thư gửi').click()
    const modal = page.getByRole('dialog',{name:'Xem trước thư gửi'})
    await modal.getByText(mailbox.address,{exact:true}).waitFor()
    await modal.getByText(supplier,{exact:true}).waitFor()
    return modal
  }
  async function cutResponse(path,action,click) {
    const pattern = '**'+path
    const done = Promise.withResolvers()
    let timer
    await page.route(pattern,async route=>{
      if (route.request().method()!=='POST' || action && route.request().postDataJSON().action!==action) return route.continue()
      try {
        const response = await route.fetch({maxRetries:0})
        assert.ok(response.ok(),await response.text())
        const result = await response.json()
        await route.abort('internetdisconnected')
        done.resolve(result)
      } catch(error) { done.reject(error); await route.abort().catch(()=>{}) }
    })
    try {
      await click()
      return await Promise.race([done.promise,new Promise((_,reject)=>{
        timer = setTimeout(()=>reject(new Error('The simulated response loss did not complete: '+path)),55_000)
      })])
    } finally { clearTimeout(timer); await page.unroute(pattern) }
  }
  async function restartOffline() {
    try { await page.context().setOffline(true); await restartNext() }
    finally { await page.context().setOffline(false) }
    await page.reload()
  }
  async function deliverReply(id,parent,body,attachments=[]) {
    mailbox.deliver([{id,threadId:'mua-hang-'+po,messageId:'<'+id+'@example.test>',inReplyTo:parent,
      from:supplier,at:new Date().toISOString(),subject:'Re: ['+po+'] Chứng từ PO',body,attachments}])
    await request('/api/source-accounts/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{"refresh":true}'})
    return sql(`SELECT id FROM public.emails WHERE source_account_id='${mailbox.id}' AND original_uid='${id}'`).trim()
  }
  const attachment = bytes => ({filename:'hoa-don.csv',contentType:'text/csv',data:Buffer.from(bytes).toString('base64')})

  await reviewer.goto(app+'/commitments/handoffs?id='+setup.handoffId)
  await button(reviewer,'Yêu cầu bổ sung chứng từ').click()
  await reviewer.getByLabel('Chứng từ cần bổ sung').fill(reason)
  await button(reviewer,'Giao yêu cầu cho Mua hàng').click()
  await status(reviewer,'Đã giao yêu cầu bổ sung cho Mua hàng.')
  assert.equal((await context()).request,null)
  for (const actor of [reviewer,outsider]) {
    assert.equal((await actor.request.get(app+endpoint+'?case='+setup.handoffId)).status(),404)
    assert.equal((await actor.request.post(app+endpoint,{data:{caseId:setup.handoffId}})).status(),404)
  }
  assert.equal((await fetch(app+endpoint+'?case='+setup.handoffId)).status,401)
  assert.equal((await page.request.post(app+endpoint,{data:{caseId:setup.handoffId,userId:randomUUID()}})).status(),400)
  await clock(0)
  await inbox()
  await cutResponse(endpoint,null,()=>button(panel,'Soạn yêu cầu gửi nhà cung cấp').click())
  await panel.getByRole('alert').waitFor()
  const first = (await context()).request
  assert.equal(first.state,'draft')
  assert.deepEqual(counts(),[0,0])
  await page.reload()
  await link(panel,'Tiếp tục bản nháp yêu cầu').click()
  await page.waitForURL('**/compose?reply='+first.sourceId)
  const initial = await request('/api/replies?source='+first.sourceId)
  assert.equal(initial.accountId,mailbox.id)
  assert.equal(initial.draft.id,first.draftId)
  assert.equal(await page.getByLabel('Người nhận',{exact:true}).inputValue(),supplier)
  const body = await page.getByLabel('Nội dung thư').inputValue()
  assert.ok(body.includes(reason) && body.includes(po) && body.includes(original))
  await page.getByLabel('Nội dung thư').fill(body+'\nNhờ gửi trước 15 giờ để Kế toán duyệt lại.')
  await button(page,'Lưu bản nháp').click()
  await page.getByText('Bản nháp đã lưu',{exact:true}).waitFor()
  await page.reload()
  assert.ok((await page.getByLabel('Nội dung thư').inputValue()).includes('trước 15 giờ'))
  await previewSend()
  mailbox.box.dropSendAcknowledgement=true
  const lost = await cutResponse('/api/replies','send',()=>button(page.getByRole('dialog',{name:'Xem trước thư gửi'}),'Xác nhận gửi').click())
  assert.equal(lost.state,'unknown')
  await restartOffline()
  await button(page,'Kiểm tra trạng thái gửi').click()
  await link(page,'Mở thư đã gửi').waitFor()
  assert.equal((await context()).request.draftId,first.draftId)
  assert.deepEqual(counts(),[1,1])
  const firstSent = googleProvider.calls.sent[0]
  assert.equal(firstSent.inReplyTo,'<invoice-'+po+'@example.test>')
  assert.equal(firstSent.threadId,'mua-hang-'+po)
  assert.deepEqual([firstSent.from,firstSent.to],[mailbox.address,[supplier]])
  await track(1)
  await inbox()
  await panel.getByText('Đang chờ chứng từ bổ sung.',{exact:true}).waitFor()
  await panel.scrollIntoViewIfNeeded()
  await capture(po+'-yeu-cau-da-luu-va-gui',page)
  const sentSource = (await context()).request.sentId
  assert.ok(sentSource)
  await link(panel,'Mở yêu cầu đã gửi').click()
  await page.waitForURL('**/inbox?email='+sentSource)
  await inbox()
  record('A lost prepare response preserves the edited case draft. After Gmail accepts but loses its receipt, a Next restart and receipt check recover exactly one send in the original buyer thread.',true)

  reviewerMailbox.deliver([{id:po+'-wrong-mailbox',threadId:'mua-hang-'+po,inReplyTo:firstSent.messageId,
    from:supplier,subject:firstSent.subject,at:new Date().toISOString(),body:'Đã nộp đủ chứng từ ở hộp thư Kế toán.'}])
  assert.equal((await reviewer.request.post(app+'/api/source-accounts/sync',{data:{refresh:true}})).status(),200)
  assert.equal((await context()).request.replyId,null)
  await clock(1)
  await inbox()
  await button(panel,'Dời ngày kiểm tra').click()
  let modal = page.getByRole('dialog',{name:'Ngày kiểm tra lại',exact:true})
  await modal.getByLabel(dateLabel).fill(day(2))
  // Hold the browser's background read after the successful schedule mutation.
  // Server state can already be waiting while the previous due UI is still mounted.
  const refreshPattern = '**'+endpoint+'?case='+setup.handoffId
  const refreshGate = Promise.withResolvers()
  const refreshStarted = page.waitForRequest(req=>req.method()==='GET' && req.url()===app+endpoint+'?case='+setup.handoffId,{timeout:20_000})
  const refreshFinished = page.waitForResponse(res=>res.request().method()==='GET' && res.url()===app+endpoint+'?case='+setup.handoffId,{timeout:20_000})
  await page.route(refreshPattern,async route=>{
    const response = await route.fetch({maxRetries:0})
    await refreshGate.promise
    await route.fulfill({response})
  })
  try {
    await button(modal,'Lưu ngày kiểm tra').click()
    await modal.waitFor({state:'hidden'})
    await refreshStarted
    assert.equal((await context()).request.work.status,'waiting')
    refreshGate.resolve()
    // Closing the dialog acknowledges the write, not the async context refresh.
    // Observe the newly rendered date before asserting the old due action is gone.
    await panel.locator('time[datetime="'+day(2)+'"]').waitFor({state:'visible'})
    await button(panel,'Xem trước thư nhắc chứng từ').waitFor({state:'hidden'})
    assert.equal(await button(panel,'Xem trước thư nhắc chứng từ').count(),0)
  } finally {
    refreshGate.resolve()
    await refreshFinished
    await page.unroute(refreshPattern)
  }
  record('A delayed context refresh after postponing the evidence check renders the new appointment and removes the old reminder action before continuing.',true)
  await clock(2)
  await inbox()
  await button(panel,'Xem trước thư nhắc chứng từ').click()
  modal = page.getByRole('dialog',{name:'Xem trước thư nhắc',exact:true})
  await button(modal,'Xác nhận gửi thư nhắc').waitFor()
  assert.ok((await modal.innerText()).includes(reason))
  await modal.getByText(supplier,{exact:true}).waitFor()
  assert.deepEqual(counts(),[1,1])
  await capture(po+'-den-hen-xem-truoc-thu-nhac',page)
  mailbox.box.dropSendAcknowledgement=true
  await cutResponse('/api/replies','send-followup',()=>button(modal,'Xác nhận gửi thư nhắc').click())
  await restartOffline()
  await button(panel,'Kiểm tra thư nhắc chứng từ').click()
  modal = page.getByRole('dialog',{name:'Kiểm tra thư nhắc',exact:true})
  await button(modal,'Kiểm tra trạng thái gửi').click()
  await modal.waitFor({state:'hidden'})
  await panel.getByText('Đã gửi thư nhắc cho ngày hẹn này.',{exact:true}).waitFor()
  assert.deepEqual(counts(),[2,2])
  const reminder = googleProvider.calls.sent[1]
  assert.equal(reminder.inReplyTo,firstSent.messageId)
  assert.equal(reminder.threadId,firstSent.threadId)
  assert.deepEqual(reminder.to,[supplier])
  record('The other Gmail account cannot fulfill the request. A deferred appointment waits until its simulated date; reminder preview contains the exact evidence request, and a second lost receipt/restart cannot resend it.',true)

  const missingCsv = [invoice,[po,corrected,original,'B',30,'bộ',2000,'VND'].join(','),''].join('\n')
  const ackId = await deliverReply(po+'-ack',reminder.messageId,'Đã nhận yêu cầu. Tôi gửi trước bản hóa đơn chưa xác minh hạn.',[attachment(missingCsv)])
  await inbox()
  await panel.getByText('Đã có hồi đáp; hồ sơ vẫn chờ chứng từ được kiểm tra và duyệt.',{exact:true}).waitFor()
  assert.equal((await context()).request.replyId,ackId)
  assert.equal((await scope()).invoice.id,setup.invoiceId)
  await files.locator('summary').click()
  await files.getByText('Tệp chưa có hạn thanh toán được yêu cầu · hoa-don.csv',{exact:true}).waitFor()
  assert.equal(await link(files,'Xem trước chứng từ mới').count(),0)
  await link(panel,'Mở hồi đáp của nhà cung cấp').click()
  await page.waitForURL(url=>url.searchParams.get('email')===ackId)
  await inbox()
  await button(panel,'Soạn yêu cầu bổ sung tiếp').click()
  await page.waitForURL('**/compose?reply='+ackId)
  const second = (await context()).request
  assert.notEqual(second.draftId,first.draftId)
  assert.equal(second.sourceId,ackId)
  await previewSend()
  await button(page.getByRole('dialog',{name:'Xem trước thư gửi'}),'Xác nhận gửi').click()
  await link(page,'Mở thư đã gửi').waitFor()
  await track(3)
  assert.deepEqual(counts(),[3,3])
  const secondSent = googleProvider.calls.sent[2]
  assert.equal(secondSent.inReplyTo,'<'+po+'-ack@example.test>')
  assert.equal(secondSent.threadId,firstSent.threadId)
  await inbox()
  await panel.getByText('Đang chờ chứng từ bổ sung.',{exact:true}).waitFor()
  await page.setViewportSize({width:390,height:844})
  await panel.scrollIntoViewIfNeeded()
  await capture(po+'-cho-bo-sung-tiep-mobile',page)
  await page.setViewportSize({width:1380,height:920})
  record('A reply with an invoice lacking a due date keeps the exception open and the original ledger unchanged. The next explicit request replies to that exact email and retires the previous tracker.',true)

  const goodCsv = [invoice+',payment_due',[po,corrected,original,'B',30,'bộ',2000,'VND',due].join(','),''].join('\n')
  const correctedSource = await deliverReply(po+'-corrected',secondSent.messageId,'Tôi gửi bản đính chính đã xác minh hạn thanh toán.',[attachment(goodCsv)])
  await inbox()
  await link(files,'Xem trước chứng từ mới').click()
  await button(page,'Ghi nhận hóa đơn').click()
  await status(page,'Đã ghi nhận chứng từ.')
  await link(page,'Mở hồ sơ đối soát').click()
  await button(page,'Bàn giao bản bổ sung').click()
  await status(page,'Đã bàn giao hồ sơ cho Kế toán.')
  const current = await scope()
  const handed = await request(handoffs+'?'+new URLSearchParams({commitment:setup.orderId,invoice:current.invoice.id}))
  await clock(3)
  assert.equal((await context()).request.active,false)
  const blocked = await page.request.post(app+'/api/replies',{data:{action:'preview-followup',id:second.draftId}})
  assert.equal(blocked.status(),409)
  await reviewer.goto(app+'/commitments/handoffs?id='+handed.pending.id)
  await button(reviewer,'Duyệt bản bổ sung').click()
  await status(reviewer,'Đã duyệt hồ sơ.')
  await reviewer.reload()
  await reviewer.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
  await capture(po+'-da-duyet-va-khep-theo-doi',reviewer)
  const closed = await context()
  assert.equal(closed.canRequest,false)
  assert.equal(closed.request.tracking,false)
  assert.equal(closed.request.followupOn,null)
  const final = await scope()
  assert.ok(final.decisionId)
  assert.deepEqual([final.invoice.number,final.invoice.evidence.emailId],[corrected,correctedSource])
  await page.goto(app+'/inbox')
  // Wait for the other open cases so an unloaded Inbox cannot satisfy the absence assertion.
  await page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).waitFor()
  assert.equal(await outer.count(),0)
  assert.deepEqual(counts(),[3,3])
  record('Only the corrected attachment is handed to the accountant. Handoff blocks further reminders, approval survives reload, closes the case and stops its tracker without sending any additional mail.',true)
  sql(`CREATE OR REPLACE FUNCTION private.reply_followup_today() RETURNS date LANGUAGE sql STABLE SET search_path=''
    AS $$ SELECT (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $$;`)
}
