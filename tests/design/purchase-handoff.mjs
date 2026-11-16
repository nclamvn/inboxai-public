import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const payment = '/api/commitments/payment'
const handoffs = '/api/commitments/handoffs'
const ledger = '/api/commitments'
const button = (scope, name) => scope.getByRole('button',{name,exact:true})
const path = id => '/commitments/handoffs?id=' + id
const key = () => ({ 'Idempotency-Key':randomUUID() })
const post = (value, headers = key()) => ({
  method:'POST', headers:{'content-type':'application/json',...headers},body:JSON.stringify(value),
})

export async function rehearsePurchaseHandoff({ app,page,deliver,request,accounts,capture,login,previousEmail,admin,
  email,password,sql,googleProvider,record,runtimeErrors,orderCode,supplier,warehouse,purchaseSettlement,purchaseReturn,purchaseDues,purchaseExceptions,purchaseBatches,purchaseFocus,purchaseSupplements,purchaseRelease,connectMailbox,output,restartNext }) {
  const reviewerEmail = 'ke-toan-handoff@example.test'
  for (const address of [reviewerEmail,previousEmail]) {
    assert.equal((await admin.from('whitelist').upsert({email:address,is_active:true},{onConflict:'email'})).error,null)
  }
  sql('UPDATE public.registration_policy SET enabled=true')
  let reviewerId
  try {
    const { data,error } = await admin.auth.admin.createUser({email:reviewerEmail,password,email_confirm:true})
    assert.equal(error,null)
    reviewerId = data.user.id
  } finally {
    sql('UPDATE public.registration_policy SET enabled=false')
  }
  const reviewer = await login(reviewerEmail)
  const outsider = await login(previousEmail)
  const csv = (header,...rows) => [header,...rows.map(row=>[orderCode,...row].join(',')),''].join('\n')
  const invoice = 'po,invoice,replaces,line,quantity,unit,unit_price,currency'
  const receipts = 'po,document,corrects,line,quantity,unit'
  const remit = (uid,department,from,age,name,contents) => deliver(uid,department,from,age,'Chứng từ PO',
    'Xin xem chứng từ đính kèm.',[{filename:name,contentType:'text/csv',data:Buffer.from(contents).toString('base64')}])
  const mailPayment = (uid,name,age,contents) => remit(uid,'mua-hang',supplier,age,name,contents)
  const mailReceipt = (uid,name,age,contents) => remit(uid,'ky-thuat',warehouse,age,name,contents)

  async function fileAction(mail,name,label,kind='Bảng giá hoặc hóa đơn') {
    await page.goto(app+'/inbox?email='+mail)
    await page.getByRole('link',{name:kind+' · '+name,exact:true}).click()
    await button(page,label).click()
    await page.getByRole('status').filter({hasText:kind==='Đối soát CSV'?'Đã ghi phiếu vào sổ':'Đã ghi nhận chứng từ.'}).waitFor()
  }
  async function assign(assignee=reviewerEmail) {
    await page.getByLabel('Email tài khoản Kế toán',{exact:true}).fill(assignee)
    await button(page,'Bàn giao hồ sơ').or(button(page,'Bàn giao lại')).click()
  }

  if (purchaseRelease) {
    const { rehearsePurchaseRelease } = await import('../eval/purchase-release/browser.mjs')
    const { rehearsePurchaseApprovalFreshness } = await import('./purchase-approval-freshness.mjs')
    const { rehearseSupplementProgress } = await import('./purchase-supplement-progress.mjs')
    const { rehearsePurchaseEvidenceRequests } = await import('./purchase-evidence-requests.mjs')
    const reviewerMailbox = await connectMailbox('ke-toan-release',reviewerId)
    const options = { app,page,reviewer,outsider,deliver,request,accounts,
      fileAction,assign,invoice,receipts,warehouse,capture,record,output,sql,reviewerId,reviewerMailbox,restartNext,googleProvider }
    await rehearsePurchaseRelease(options)
    await rehearsePurchaseApprovalFreshness(options)
    await rehearseSupplementProgress(options)
    assert.equal(googleProvider.calls.sendAttempts,0)
    await rehearsePurchaseEvidenceRequests(options)
    assert.deepEqual(runtimeErrors,[])
    return
  }

  const due = new Date(Date.now()+5*86_400_000).toISOString().slice(0,10)
  const quote = 'Đơn mua hàng nhiều dòng, hạn '+due+': A 100 bộ + B 100 bộ.'
  const original = await deliver('handoff-po','mua-hang',supplier,12,'Đặt hàng',quote)
  await page.goto(app+'/commitments?group=waiting&view=catchup&source='+original)
  await page.getByText(quote,{exact:true}).waitFor()
  await button(page,'Xem và xác nhận').click()
  const modal = page.getByRole('dialog',{name:'Xác nhận đề xuất'})
  await button(modal,'Xác nhận và ghi vào sổ').click()
  await modal.waitFor({state:'hidden'})
  const id = (await request(ledger)).items.find(item=>item.state.title==='Đối soát '+orderCode).id
  await page.goto(app+'/commitments?group=waiting&id='+id)
  await button(page,'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog',{name:'Thiết lập nguồn nhập kho'})
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup,'Bật đối soát').click()
  await setup.waitFor({state:'hidden'})

  const priceBytes = csv('po,price_sheet,line,quantity,unit,unit_price,currency',
    ['BG-7801','A',100,'bộ',12000,'VND'],['BG-7801','B',100,'bộ',8000,'VND'])
  const stockBytes = csv(receipts,['PN-7801','','B',90,'bộ'])
  await fileAction(await mailPayment('handoff-price','bang-gia.csv',11,priceBytes),'bang-gia.csv','Duyệt đơn giá PO')
  await fileAction(await mailReceipt('handoff-stock','phieu-kho.csv',10,stockBytes),'phieu-kho.csv','Duyệt và ghi phiếu','Đối soát CSV')
  const firstBytes = csv(invoice,['INV-7801','','B',50,'bộ',8000,'VND'])
  await fileAction(await mailPayment('handoff-first','dot-mot.csv',9,firstBytes),'dot-mot.csv','Ghi nhận hóa đơn')
  const paymentUrl = app+'/commitments/payment?id='+id
  const readPayment = () => request(payment+'?id='+id)
  await page.goto(paymentUrl)
  await button(page,'Duyệt đủ căn cứ thanh toán').click()
  await page.getByRole('status').filter({hasText:'Đã duyệt đối soát.'}).waitFor()
  const firstDecision = (await readPayment()).decisionId
  assert.ok(firstDecision)

  const draftBytes = csv(invoice,['INV-7802','','B',40,'bộ',8000,'VND'])
  await fileAction(await mailPayment('handoff-second','dot-hai.csv',8,draftBytes),'dot-hai.csv','Ghi nhận hóa đơn')
  const ownerCommand = (await readPayment()).command
  const irrelevantMail = await remit('handoff-private','mua-hang',supplier,7,'rieng.csv','Dữ liệu không thuộc bộ chứng từ.')
  const unrelated = (await request('/api/emails/'+irrelevantMail+'/attachments')).attachments[0].id
  await page.goto(paymentUrl)
  await assign(email)
  await page.getByText(/Chọn một tài khoản Kế toán đã xác minh/).waitFor()
  await assign()
  await page.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const { pending } = await request(handoffs+'?'+new URLSearchParams({commitment:id,invoice:ownerCommand.invoiceId}))
  const firstHandoff = pending.id
  await request(payment,post(ownerCommand),403)
  assert.equal(await button(page,'Duyệt đủ căn cứ thanh toán').count(),0)
  await reviewer.goto(app+'/commitments')
  await reviewer.getByRole('link',{name:'Hồ sơ Kế toán',exact:true}).click()
  await reviewer.getByRole('link',{name:'INV-7802 · '+orderCode,exact:true}).click()
  await reviewer.getByText('Chờ Kế toán duyệt',{exact:true}).waitFor()
  await reviewer.getByText('Chứng từ dòng B',{exact:true}).click()
  for (const [name,bytes] of [['bang-gia.csv',priceBytes],['phieu-kho.csv',stockBytes],['dot-mot.csv',firstBytes],['dot-hai.csv',draftBytes]]) {
    const link = reviewer.getByRole('link',{name:new RegExp('^'+name.replace('.','\\.')+' · dòng')})
    const href = await link.getAttribute('href')
    const response = await reviewer.request.get(app+href)
    assert.equal(response.status(),200)
    assert.deepEqual(await response.body(),Buffer.from(bytes))
    assert.equal((await outsider.request.get(app+href)).status(),404)
  }
  assert.equal((await reviewer.request.get(app+handoffs+'?id='+firstHandoff+'&file='+unrelated)).status(),404)
  assert.equal((await outsider.request.get(app+handoffs+'?id='+firstHandoff)).status(),404)
  assert.equal((await reviewer.request.get(app+payment+'?id='+id)).status(),404)
  assert.equal((await reviewer.request.get(app+'/api/attachments/'+unrelated)).status(),404)
  assert.equal((await reviewer.request.post(app+payment,{data:ownerCommand,headers:key()})).status(),404)
  const shared = await (await reviewer.request.get(app+handoffs+'?id='+firstHandoff)).json()
  assert.equal(shared.snapshot.invoice.evidence.emailId,undefined)
  assert.equal(shared.snapshot.command,undefined)
  for (const user of [page,outsider]) {
    assert.equal((await user.request.post(app+handoffs,{ data:{action:'approve',handoffId:firstHandoff},headers:key() })).status(),404)
  }
  await capture('01-ke-toan-chung-tu',reviewer)
  record('Verified separate reviewer only sees the assigned invoice, PO evidence, warehouse file and preceding allocation. Owner, outsider and raw mailbox cannot bypass.',true)

  await button(reviewer,'Trả lại hồ sơ').click()
  const reason = 'Cần chứng từ đính chính số lượng theo biên bản.'
  await reviewer.getByLabel('Lý do trả lại',{exact:true}).fill(reason)
  await button(reviewer,'Xác nhận trả lại').click()
  await reviewer.getByRole('status').filter({hasText:'Đã trả lại hồ sơ.'}).waitFor()
  await page.reload()
  await page.getByText(reason,{exact:true}).waitFor()
  await page.getByRole('listitem').filter({hasText:reason}).getByText(/^ke-toan-handoff@example.test/).waitFor()
  assert.equal((await reviewer.request.post(app+handoffs,{data:{action:'approve',handoffId:firstHandoff},headers:key()})).status(),409)
  await capture('02-mua-hang-nhan-tra-lai')
  record('Reviewer returns the original with a reason. Owner reads the attributed audit event; approval on the returned link is refused.',true)

  const paymentDue = purchaseDues ? new Date(Date.now()+2*86_400_000).toISOString().slice(0,10) : undefined
  const correctedBytes = paymentDue
    ? csv(invoice+',payment_due',['INV-7803','INV-7802','B',39,'bộ',8000,'VND',paymentDue])
    : csv(invoice,['INV-7803','INV-7802','B',39,'bộ',8000,'VND'])
  await fileAction(await mailPayment('handoff-corrected','dinh-chinh.csv',6,correctedBytes),'dinh-chinh.csv','Ghi nhận hóa đơn')
  await page.goto(paymentUrl)
  await assign()
  await page.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const corrected = (await readPayment()).invoice.id
  const currentAssignment = () => request(handoffs+'?'+new URLSearchParams({commitment:id,invoice:corrected}))
  const stale = (await currentAssignment()).pending.id
  await reviewer.goto(app+path(stale))
  await button(reviewer,'Duyệt đủ căn cứ thanh toán').waitFor()
  const moreBytes = csv(receipts,['PN-7802','','B',10,'bộ'])
  await fileAction(await mailReceipt('handoff-more','phieu-bo-sung.csv',5,moreBytes),'phieu-bo-sung.csv','Duyệt và ghi phiếu','Đối soát CSV')
  const staleAttempt = await reviewer.request.post(app+handoffs,{data:{action:'approve',handoffId:stale},headers:key()})
  assert.equal(staleAttempt.status(),409)
  await reviewer.reload()
  await reviewer.getByText('Chứng từ đã đổi',{exact:true}).waitFor()
  assert.equal(await button(reviewer,'Duyệt đủ căn cứ thanh toán').count(),0)
  await page.goto(paymentUrl)
  await assign()
  await page.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const final = (await currentAssignment()).pending.id
  assert.notEqual(final,stale)
  await reviewer.goto(app+path(stale))
  await reviewer.getByText('Đã có lần bàn giao mới',{exact:true}).waitFor()
  assert.equal((await reviewer.request.get(app+handoffs+'?id='+stale+'&file='+unrelated)).status(),409)
  await reviewer.goto(app+path(final))
  await reviewer.getByText('INV-7803 · '+orderCode,{exact:true}).waitFor()
  await capture('03-ban-dinh-chinh',reviewer)
  record('A receipt change invalidates the prior approval even if the new quantities still match. Reassignment supersedes the earlier link and delegates the corrected invoice.',true)

  const attempts = []
  await reviewer.route('**'+handoffs,async route=>{
    if (route.request().method()!=='POST' || route.request().postDataJSON().action!=='approve') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
    if(attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await reviewer.setViewportSize({width:390,height:844})
  await button(reviewer,'Duyệt đủ căn cứ thanh toán').click()
  await button(reviewer,'Thử lại cùng yêu cầu').click()
  await reviewer.getByRole('status').filter({hasText:'Đã duyệt hồ sơ.'}).waitFor()
  assert.equal(attempts.length,2)
  assert.equal(attempts[0].key,attempts[1].key)
  assert.deepEqual(attempts.map(item=>[item.status,item.result.replayed]),[[200,false],[200,true]])
  assert.equal(attempts[0].result.decisionId,attempts[1].result.decisionId)
  await reviewer.reload()
  await reviewer.getByText('Đã duyệt',{exact:true}).waitFor()
  await capture('04-duyet-mobile',reviewer)
  await reviewer.unroute('**'+handoffs)
  await reviewer.setViewportSize({ width:1380,height:920 })
  const latest = await readPayment()
  assert.equal(latest.decisionId,attempts[0].result.decisionId)
  assert.equal(latest.balances.find(line=>line.code==='B').approved,89)
  assert.ok(latest.allocations.some(item=>item.decisionId===firstDecision))
  const history = (await currentAssignment()).history
  assert.equal(history.filter(event=>event.action==='approve' && event.actor===reviewerEmail).length,1)
  assert.equal(history.filter(event=>event.action==='submit' && event.actor===email && event.reviewer===reviewerEmail).length,3)
  assert.equal(googleProvider.calls.sendAttempts,0)
  assert.equal((await fetch(app+handoffs+'?id='+final)).status,401)
  assert.deepEqual(runtimeErrors,[])
  record('Lost Chrome approval acknowledgement replays one reviewer decision, persists after reload, preserves first approval and leaves exactly 89 approved units. Axe and tenant checks pass.',true)
  if (purchaseSettlement) {
    let board
    if (paymentDue) {
      const { rehearsePurchaseDues } = await import('./purchase-dues.mjs')
      board = await rehearsePurchaseDues({ app,page,reviewer,outsider,deliver,request,accounts,fileAction,assign,
        capture,record,paymentDue,supplier,warehouse,invoice,receipts,mainInvoice:corrected,mainHandoff:final,previousEmail,purchaseBatches,purchaseFocus,purchaseSupplements })
    }
    const { rehearsePurchaseSettlement } = await import('./purchase-settlement.mjs')
    await rehearsePurchaseSettlement({ app,page,reviewer,outsider,request,capture,admin,reviewerId,connectMailbox,
      orderCode,orderId:id,approvedHandoff:final,approvedInvoice:corrected,paymentUrl,assign,mailPayment,fileAction,
      readPayment,invoice,csv,googleProvider,record,runtimeErrors,purchaseReturn,board,purchaseExceptions,purchaseBatches,sql,reviewerEmail,previousEmail,
      reopenAccountant: () => login(reviewerEmail) })
  }
}
