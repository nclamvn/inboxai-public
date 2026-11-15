import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const handoffs = '/api/commitments/handoffs'
const dues = '/api/commitments/dues'
const settlements = '/api/commitments/settlements'
const button = (page, name) => page.getByRole('button', { name, exact:true })
const routeToHandoff = id => '/commitments/handoffs?id=' + id
const row = (page, invoice) => page.getByRole('listitem').filter({ has:page.getByRole('heading', { name:new RegExp('^'+invoice+' ·') }) })
const headers = () => ({ 'Idempotency-Key':randomUUID() })
const original = 'INV-8702'
const reference = 'PO-9422'

export async function rehearsePurchaseException({ app,buyer,accountant,outsider,buyerMail,request,supplier,invoice,legacy,
  competingReviewer,bank,capture,record,purchaseBatches,purchaseFocus,purchaseSupplements }) {
  const reason = 'Bổ sung hóa đơn đúng PO có ngày thanh toán theo xác nhận nhà cung cấp.'
  const focus = purchaseFocus ? (await import('./purchase-focus.mjs')).exercisePurchaseFocus({
    app,buyer,accountant,outsider,capture,record }) : null
  const newDue = new Date(Date.now()+8*86_400_000).toISOString().slice(0,10)
  const oldDue = new Date(Date.now()+10*86_400_000).toISOString().slice(0,10)

  async function dueItems(actor) {
    const response = await actor.request.get(app+dues)
    assert.equal(response.status(),200,await response.text())
    return (await response.json()).items
  }
  async function detail(id, actor=accountant, status=200) {
    const response = await actor.request.get(app+handoffs+'?id='+id)
    assert.equal(response.status(),status,await response.text())
    return response.json()
  }
  async function write(actor, command, status) {
    const response = await actor.request.post(app+handoffs,{ data:command,headers:headers() })
    assert.equal(response.status(),status,await response.text())
    return response.json()
  }
  async function retryAfterLoss(actor, action, trigger) {
    const attempts = []
    await actor.route('**'+handoffs,async route=>{
      if (route.request().method()!=='POST' || route.request().postDataJSON().action!==action) return route.continue()
      const response = await route.fetch({maxRetries:0})
      attempts.push({ status:response.status(),key:route.request().headers()['idempotency-key'],body:await response.json() })
      if (attempts.length===1 && response.ok()) return route.abort()
      return route.fulfill({response})
    })
    try {
      await button(actor,trigger).click()
      await button(actor,'Thử lại cùng yêu cầu').click()
      await actor.getByRole('status').filter({hasText:action==='approve'?'Đã duyệt hồ sơ.':'Đã giao yêu cầu bổ sung cho Mua hàng.'}).waitFor()
    } finally {
      await actor.unroute('**'+handoffs)
    }
    assert.deepEqual(attempts.map(attempt=>[attempt.status,attempt.body.replayed]),[[200,false],[200,true]])
    assert.equal(attempts[0].key,attempts[1].key)
    assert.equal(attempts[0].body.id,attempts[1].body.id)
    assert.equal(attempts[0].body.decisionId,attempts[1].body.decisionId)
    return attempts[1].body
  }

  const transfer = ['po,invoice,transfer,paid_on,amount,currency',
    [reference,original,'BANK-EXCEPTION',bank.transferDate,15000,'VND'].join(','),''].join('\n')
  const bankMail = await bank.deliver('exception-bank','chung-tu-tam-giu.csv',transfer,reference)
  const bankQuery = await bank.openEvidence(bankMail,'chung-tu-tam-giu.csv')
  const readyPayment = await bank.getPreview(bankQuery)
  assert.equal(readyPayment.remaining,60000)

  await accountant.setViewportSize({ width:1024,height:900 })
  await accountant.goto(app+'/commitments/dues')
  await row(accountant,original).getByRole('link',{name:'Yêu cầu bổ sung chứng từ'}).click()
  await accountant.getByLabel('Chứng từ cần bổ sung').fill(reason)
  const command = {action:'request_evidence',handoffId:legacy.handoffId,reason}
  await write(buyer,command,404)
  await write(outsider,command,404)
  await retryAfterLoss(accountant,'request_evidence','Giao yêu cầu cho Mua hàng')
  await accountant.getByText('Chờ Mua hàng bổ sung',{exact:true}).waitFor()
  await write(accountant,command,409)
  assert.deepEqual((await detail(legacy.handoffId)).exception.events.map(event=>event.action),['request_evidence'])
  assert.equal((await bank.getPreview(bankQuery,409)).error,'Đang chờ bổ sung hoặc duyệt lại. Khoản thanh toán tạm giữ.')
  assert.equal((await accountant.request.post(app+settlements,{data:readyPayment.command,headers:headers()})).status(),409)

  await buyer.goto(app+'/commitments/dues')
  await row(buyer,original).getByText('Chờ Mua hàng bổ sung',{exact:true}).waitFor()
  assert.equal(await row(buyer,original).getByRole('link',{name:'Yêu cầu bổ sung chứng từ'}).count(),0)
  await row(buyer,original).getByRole('link',{name:'Mở hồ sơ',exact:true}).click()
  await buyer.getByText(reason,{exact:true}).waitFor()
  await capture('14-ngoai-le-cho-mua-hang',buyer)
  await focus?.supply({ ...legacy,reason })
  if (purchaseBatches) {
    await accountant.goto(app+'/commitments/dues')
    const selection = row(accountant,original).getByRole('checkbox',{name:'Chọn '+original+' vào đợt'})
    await selection.waitFor()
    assert.equal(await selection.isDisabled(),true)
    assert.equal((await accountant.request.get(app+'/api/commitments/batches?selected='+legacy.handoffId)).status(),409)
    record('An installment held for evidence is disabled in the batch selector and rejected by the authenticated preview endpoint.',true)
  }
  assert.deepEqual(await dueItems(outsider),[])
  await detail(legacy.handoffId,outsider,404)
  await detail(legacy.handoffId,buyer,404)
  record('A single request survives a lost acknowledgement, assigns the buyer, and holds both new and previously previewed payment writes. Outsider and buyer cannot open the reviewer action.',true)

  async function previewCorrection({ number,replaces,age,deadline,ref=reference }) {
    const header = invoice+(deadline?',payment_due':'')
    const contents = [header,[ref,number,replaces,'B',30,'bộ',2000,'VND',...(deadline?[deadline]:[])].join(','),''].join('\n')
    const filename = number.toLowerCase()+'.csv'
    const mail = await buyerMail('evidence-'+number.toLowerCase(),'mua-hang',supplier,age,'Hóa đơn đính chính',
      'Chứng từ nhà cung cấp.',[{filename,contentType:'text/csv',data:Buffer.from(contents).toString('base64')}],reference)
    await buyer.goto(app+'/inbox?email='+mail)
    await buyer.getByRole('link',{name:'Bảng giá hoặc hóa đơn · '+filename,exact:true}).click()
    return { mail,filename }
  }
  async function registerCorrection(correction) {
    const source = await previewCorrection(correction)
    await button(buyer,'Ghi nhận hóa đơn').click()
    await buyer.getByRole('status').filter({hasText:'Đã ghi nhận chứng từ.'}).waitFor()
    await buyer.getByRole('link',{name:'Mở hồ sơ đối soát',exact:true}).click()
    await buyer.getByText('Hóa đơn thay thế '+correction.replaces,{exact:true}).waitFor()
    return source
  }
  const payment = '/api/commitments/payment?id='+legacy.orderId
  const scope = () => request(payment)
  const ownerHandoff = invoiceId => request(handoffs+'?'+new URLSearchParams({commitment:legacy.orderId,invoice:invoiceId}))

  const wrong = await previewCorrection({number:'INV-8799',replaces:original,age:purchaseSupplements ? 0.25 : 4,deadline:newDue,ref:'PO-9423'})
  await buyer.getByText('Mã PO trên email và trong CSV phải trùng nhau.',{exact:true}).waitFor()
  assert.equal(await button(buyer,'Ghi nhận hóa đơn').count(),0)
  assert.equal((await scope()).invoice.number,original)

  await registerCorrection({number:'INV-8710',replaces:original,age:4})
  await button(buyer,'Bàn giao bản bổ sung').click()
  await buyer.getByText('Cần hóa đơn đính chính cùng đợt và đủ thông tin được yêu cầu.',{exact:true}).waitFor()
  const incomplete = await scope()
  assert.equal((await ownerHandoff(incomplete.invoice.id)).pending,null)
  assert.equal((await detail(legacy.handoffId)).exception.stage,'buyer')
  record('A mismatched PO is blocked in the inbox and an otherwise valid correction without a due date cannot hand off or change the responsible role.',true)

  await registerCorrection({number:'INV-8712',replaces:'INV-8710',age:2,deadline:oldDue})
  const first = await scope()
  await write(buyer,{action:'submit',commitmentId:legacy.orderId,invoiceId:first.invoice.id,
    proof:first.command.proof,reviewer:competingReviewer},409)
  assert.equal((await ownerHandoff(first.invoice.id)).pending,null)
  await button(buyer,'Bàn giao bản bổ sung').click()
  await buyer.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const firstResponse = (await ownerHandoff(first.invoice.id)).pending.id
  await accountant.goto(app+routeToHandoff(firstResponse))
  await button(accountant,'Duyệt bản bổ sung').waitFor()
  await focus?.delegated({handoffId:firstResponse})

  const late = await previewCorrection({number:'INV-8711',replaces:purchaseSupplements ? original : 'INV-8712',
    age:purchaseSupplements ? 0.5 : 3,deadline:newDue})
  await buyer.getByText('Hóa đơn đính chính phải mới hơn và thay đúng chứng từ đang hiệu lực của đợt.',{exact:true}).waitFor()
  assert.equal(await button(buyer,'Ghi nhận hóa đơn').count(),0)
  assert.equal((await scope()).invoice.number,'INV-8712')

  const finalSource = purchaseSupplements
    ? await (await import('./purchase-supplements.mjs')).rehearsePurchaseSupplements({
      app,buyer,accountant,outsider,buyerMail,request,scope,supplier,invoice,reference,newDue,
      caseId:legacy.handoffId,wrong,late,capture,record,
    })
    : await registerCorrection({number:'INV-8713',replaces:'INV-8712',age:1,deadline:newDue})
  await write(accountant,{action:'approve',handoffId:firstResponse},409)
  await write(accountant,{action:'approve',handoffId:legacy.handoffId},409)
  await focus?.superseded({handoffId:firstResponse,emailId:finalSource.mail})
  await accountant.reload()
  await accountant.getByText('Chứng từ đã đổi',{exact:true}).waitFor()
  assert.equal(await button(accountant,'Duyệt bản bổ sung').count(),0)
  await button(accountant,'Trả lại hồ sơ').click()
  await accountant.getByLabel('Lý do trả lại').fill('Nhà cung cấp đã gửi bản có hạn mới. Bàn giao lại bản mới.')
  await button(accountant,'Xác nhận trả lại').click()
  await accountant.getByRole('status').filter({hasText:'Đã trả lại hồ sơ.'}).waitFor()
  assert.equal((await detail(legacy.handoffId)).exception.stage,'buyer')
  await buyer.reload()
  await buyer.getByText('Chờ Mua hàng bổ sung',{exact:true}).waitFor()
  await button(buyer,'Bàn giao bản bổ sung').click()
  await buyer.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const corrected = await scope()
  const responseHandoff = (await ownerHandoff(corrected.invoice.id)).pending.id
  const waiting = (await dueItems(accountant)).filter(item=>item.reference===reference)
  assert.equal(waiting.length,1)
  assert.deepEqual(waiting[0].exception,{ stage:'reviewer',reviewHandoff:responseHandoff })
  assert.equal(waiting[0].deadline,null)
  assert.equal((await dueItems(buyer)).find(item=>item.reference===reference).exception.reviewHandoff,null)

  if (focus) await focus.review({handoffId:responseHandoff})
  else {
    await accountant.goto(app+'/commitments/dues')
    await row(accountant,original).getByText('Chờ Kế toán duyệt lại',{exact:true}).waitFor()
    await row(accountant,original).getByRole('link',{name:'Mở hồ sơ',exact:true}).click()
    await accountant.waitForURL('**/commitments/handoffs?id='+responseHandoff)
  }
  const comparison = accountant.getByRole('region',{name:'So sánh bản bổ sung'})
  await comparison.getByText('Bản đã duyệt · '+original,{exact:true}).waitFor()
  await comparison.getByText('Bản bổ sung · INV-8713',{exact:true}).waitFor()
  await comparison.getByText('Hạn thanh toán '+newDue,{exact:true}).waitFor()
  await accountant.setViewportSize({width:390,height:844})
  await comparison.scrollIntoViewIfNeeded()
  await capture('15-so-sanh-ban-bo-sung-mobile',accountant)
  await write(outsider,{action:'approve',handoffId:responseHandoff},404)
  await write(buyer,{action:'approve',handoffId:responseHandoff},404)
  record('An older email delivered after the active correction is rejected. An authoritative later correction makes the prior approval stale. Reassignment targets the same accountant and shows one review row with a before/after comparison.',true)

  const receipt = await retryAfterLoss(accountant,'approve','Duyệt bản bổ sung')
  assert.ok(receipt.decisionId)
  await focus?.closed()
  if (purchaseSupplements) {
    const endpoint = '/api/commitments/supplements?case='+legacy.handoffId
    assert.deepEqual(await request(endpoint),[])
  }
  if (focus) await accountant.goto(app+routeToHandoff(responseHandoff))
  await accountant.reload()
  await accountant.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
  const closed = (await detail(responseHandoff)).exception
  assert.deepEqual(closed.events.map(event=>[event.action,event.invoice]),[
    ['request_evidence',original],['submit','INV-8712'],['return','INV-8712'],['submit','INV-8713'],['approve','INV-8713'],
  ])
  assert.deepEqual((await detail(legacy.handoffId)).exception.events,closed.events)
  const approved = await scope()
  assert.equal(approved.decisionId,receipt.decisionId)
  assert.equal(approved.invoice.evidence.emailId,finalSource.mail)
  const refreshed = (await dueItems(accountant)).filter(item=>item.reference===reference)
  assert.equal(refreshed.length,1)
  assert.deepEqual([refreshed[0].invoice,refreshed[0].deadline,refreshed[0].remaining,refreshed[0].exception],
    ['INV-8713',newDue,60000,null])
  await accountant.goto(app+'/commitments/dues')
  await row(accountant,'INV-8713').getByText('Hạn '+newDue.split('-').reverse().join('/'),{exact:true}).waitFor()
  assert.equal(await row(accountant,original).count(),0)
  assert.equal(await row(accountant,'INV-8713').getByRole('link',{name:'Yêu cầu bổ sung chứng từ'}).count(),0)
  await buyer.goto(app+'/commitments/payment?id='+legacy.orderId+'&invoice='+corrected.invoice.id)
  await buyer.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
  await buyer.getByRole('region',{name:'Ngoại lệ công nợ'}).scrollIntoViewIfNeeded()
  await capture('16-ngoai-le-da-khep',buyer)
  const invoiceLine = buyer.getByRole('region',{name:'Dòng B',exact:true})
  await invoiceLine.getByText('Chứng từ dòng B',{exact:true}).click()
  const finalSubject = purchaseSupplements ? '[PO-9422] Trả lời yêu cầu bổ sung' : '[PO-9422] Hóa đơn đính chính'
  await invoiceLine.getByRole('link',{name:finalSubject,exact:true}).click()
  await buyer.waitForURL('**/inbox?email='+finalSource.mail)
  const finalFileLink = buyer.getByRole('link',{name:'Bảng giá hoặc hóa đơn · '+finalSource.filename,exact:true})
  if (finalSource.fileId) {
    const href = '/commitments/payment?'+new URLSearchParams({email:finalSource.mail,file:finalSource.fileId})
    await finalFileLink.and(buyer.locator('a[href="'+href+'"]')).waitFor()
  } else await finalFileLink.waitFor()
  const oldConfirm = await accountant.request.post(app+settlements,{data:readyPayment.command,headers:headers()})
  assert.equal(oldConfirm.status(),409)
  const newTransfer = transfer.replace(original,'INV-8713')
  const newBankMail = await bank.deliver('exception-bank-new','chung-tu-ban-moi.csv',newTransfer,reference)
  assert.equal((await bank.getPreview(await bank.openEvidence(newBankMail,'chung-tu-ban-moi.csv'))).remaining,60000)
  record('Lost approval acknowledgement replays one decision. Reload retains the five events, the right source email and the new deadline. New payment preview is available only against the approved revision.',true)
}
