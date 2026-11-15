import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const api = '/api/commitments/payment'
const ledger = '/api/commitments'
const button = (scope, name) => scope.getByRole('button', { name, exact: true })
const post = (value, key = randomUUID()) => ({
  method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
})

export async function rehearsePurchasePayment({ app, page, deliver, request, accounts, capture, login,
  previousEmail, admin, googleProvider, record, runtimeErrors, orderCode, supplier, warehouse }) {
  const prices = 'po,price_sheet,line,quantity,unit,unit_price,currency'
  const invoices = 'po,invoice,replaces,line,quantity,unit,unit_price,currency'
  const receipts = 'po,document,corrects,line,quantity,unit'
  const csv = (header,...rows) => [header,...rows.map(row=>[orderCode,...row].join(',')), ''].join('\n')
  const remit = (uid,mailbox,from,age,subject,filename,value) => deliver(uid,mailbox,from,age,subject,'Vui lòng xem chứng từ đính kèm.',
    [{filename,contentType:'text/csv',data:Buffer.from(value).toString('base64')}])
  const fileId = async emailId => (await request('/api/emails/' + emailId + '/attachments')).attachments[0].id

  async function textApproval(source, quote) {
    await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + source)
    await page.getByText(quote,{exact:true}).waitFor()
    await button(page,'Xem và xác nhận').click()
    const modal = page.getByRole('dialog',{name:'Xác nhận đề xuất'})
    await button(modal,'Xác nhận và ghi vào sổ').click()
    await modal.waitFor({state:'hidden'})
  }
  async function openFile(email, name, kind = 'Bảng giá hoặc hóa đơn') {
    await page.goto(app+'/inbox?email='+email)
    await page.getByRole('link',{name:kind+' · '+name,exact:true}).click()
  }
  async function register(email, name, label) {
    await openFile(email,name)
    await button(page,label).click()
    await page.getByRole('status').filter({hasText:'Đã ghi nhận chứng từ.'}).waitFor()
  }
  async function receive(email, name) {
    await openFile(email,name,'Đối soát CSV')
    await button(page,'Duyệt và ghi phiếu').click()
    await page.getByRole('status').filter({hasText:'Đã ghi phiếu vào sổ'}).waitFor()
  }
  const due = new Date(Date.now()+5*86_400_000).toISOString().slice(0,10)
  const order = 'Đơn mua hàng nhiều dòng, hạn ' + due + ': A 100 bộ + B 100 bộ.'
  await textApproval(await deliver('payment-order','mua-hang',supplier,10,'Đặt hàng',order),order)
  const id = (await request(ledger)).items.find(item=>item.state.title==='Đối soát '+orderCode).id
  const dossier = app + '/commitments/payment?id=' + id
  const read = () => request(api+'?id='+id)
  await page.goto(app+'/commitments?group=waiting&id='+id)
  await button(page,'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog',{name:'Thiết lập nguồn nhập kho'})
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup,'Bật đối soát').click()
  await setup.waitFor({state:'hidden'})
  const price = csv(prices,['BG-7601','A',100,'bộ',12000,'VND'],['BG-7601','B',100,'bộ',8000,'VND'])
  const priceEmail = await remit('payment-price','mua-hang',supplier,8,'Đơn giá đã thống nhất','bang-gia.csv',price)
  assert.equal((await read()).status,'missing_price')
  await register(priceEmail,'bang-gia.csv','Duyệt đơn giá PO')
  assert.equal((await read()).status,'missing_invoice')
  for (const code of ['A','B']) {
    const quote = 'Báo giao dòng ' + code + ': 100 bộ.'
    await textApproval(await deliver('payment-ship-'+code,'mua-hang',supplier,7,'Báo giao '+code,quote),quote)
  }
  const firstReceipt = csv(receipts,['PN-7601','','A',100,'bộ'],['PN-7601','','B',90,'bộ'])
  const warehouseMail = await remit('payment-receipt','ky-thuat',warehouse,5,'Kho nhận A và B','phieu-nhap.csv',firstReceipt)
  await receive(warehouseMail,'phieu-nhap.csv')
  const wrong = csv(invoices,['INV-7601','','A',100,'bộ',13000,'VND'],['INV-7601','','B',100,'bộ',8000,'VND'])
  const invoiceMail = await remit('payment-invoice','mua-hang',supplier,4,'Hóa đơn ban đầu','hoa-don.csv',wrong)
  await register(invoiceMail,'hoa-don.csv','Ghi nhận hóa đơn')
  assert.equal((await read()).status,'blocked')
  await page.goto(app+'/inbox')
  const attention = page.getByRole('list',{name:'Hóa đơn cần đối soát'}).getByRole('listitem')
  await attention.getByText('Cần kiểm tra hóa đơn',{exact:true}).waitFor()
  await attention.getByRole('link',{name:'INV-7601 · '+orderCode,exact:true}).click()
  await page.getByRole('region',{name:'Dòng A',exact:true}).getByText('Sai đơn giá',{exact:true}).waitFor()
  await page.getByRole('region',{name:'Dòng B',exact:true}).getByText('Thiếu 10 bộ thực nhận',{exact:true}).waitFor()
  assert.equal(await button(page,'Duyệt đủ căn cứ thanh toán').count(),0)
  await request(api,post({action:'approve',id,invoiceId:(await read()).invoice.id,proof:'a'.repeat(64)}),409)
  await capture('01-hai-chenh-lech')
  record('Action Inbox opens one invoice with independent quantity and price exceptions. The API refuses approval while blocked.',true)

  await page.goto(app + '/search')
  const question = 'Đối soát hóa đơn trước thanh toán ' + orderCode
  await page.getByLabel('Nội dung tìm kiếm',{exact:true}).fill(question)
  await button(page,'Hỏi email').click()
  const ask = page.getByRole('region',{name:'Đối chiếu ba bên'})
  const b = ask.getByRole('region',{name:'Dòng B',exact:true})
  await b.getByText('Thiếu 10 bộ thực nhận',{exact:true}).waitFor()
  await b.getByText('Chứng từ dòng B',{exact:true}).click()
  for (const [name,bytes] of [['bang-gia.csv',price],['phieu-nhap.csv',firstReceipt],['hoa-don.csv',wrong]]) {
    const href = await b.getByRole('link',{name:name+' · dòng 3',exact:true}).getAttribute('href')
    const download = await page.request.get(app+href)
    assert.equal(download.status(),200)
    assert.deepEqual(await download.body(),Buffer.from(bytes))
  }
  const restricted = await request('/api/ask-inbox/answer',post({query:question,accountIds:[accounts['mua-hang'].id]}))
  assert.deepEqual([restricted.status,restricted.payment.status],['insufficient','unavailable'])
  await capture('02-ask-ba-nguon')
  record('Ask Inbox cites the exact line and bytes across PO, warehouse and invoice. Hiding warehouse evidence makes it abstain.',true)

  const resend = await remit('payment-resend','mua-hang',supplier,3.5,'Gửi lại hóa đơn','hoa-don-ban-sao.csv',wrong)
  await openFile(resend,'hoa-don-ban-sao.csv')
  await page.getByText('Chứng từ này đã được ghi nhận.',{exact:true}).waitFor()
  assert.equal(await button(page,'Ghi nhận hóa đơn').count(),0)
  const late = await remit('payment-late','ky-thuat',warehouse,6,'Phiếu bổ sung B đến muộn','bo-sung.csv',
    csv(receipts,['PN-7602','','B',10,'bộ']))
  await receive(late,'bo-sung.csv')
  await page.goto(dossier)
  await page.getByText('Sai đơn giá',{exact:true}).waitFor()
  assert.equal(await page.getByText('Thiếu 10 bộ thực nhận',{exact:true}).count(),0)
  assert.equal(await button(page,'Duyệt đủ căn cứ thanh toán').count(),0)
  assert.equal((await read()).invoice.number,'INV-7601')
  record('Resending with a different filename does not duplicate the invoice. An earlier receipt fixes quantity while the price exception remains.',true)

  const corrected = csv(invoices,['INV-7602','INV-7601','A',100,'bộ',12000,'VND'],['INV-7602','INV-7601','B',100,'bộ',8000,'VND'])
  const wrongScope = await remit('payment-wrong-scope','ky-thuat',supplier,2,'Hóa đơn gửi sai hộp thư','hoa-don-sai-hop.csv',corrected)
  await openFile(wrongScope,'hoa-don-sai-hop.csv')
  await page.getByText(/Chứng từ phải từ nhà cung cấp qua hộp thư Mua hàng/).waitFor()
  const correction = await remit('payment-correction','mua-hang',supplier,1,'Hóa đơn đính chính','hoa-don-dinh-chinh.csv',corrected)
  await register(correction,'hoa-don-dinh-chinh.csv','Ghi nhận hóa đơn')
  await page.goto(dossier)
  await page.getByText('Hóa đơn thay thế INV-7601',{exact:true}).waitFor()
  assert.equal((await read()).subtotal,2_000_000)

  const approval = (await read()).command
  const providerFile = accounts['mua-hang'].box.messages.get('payment-correction').attachments[0]
  const originalBytes = providerFile.data
  try {
    providerFile.data = Buffer.from(corrected.replace(',12000,',',12001,')).toString('base64')
    await request(api,post(approval),409)
    assert.equal((await read()).status,'ready')
  } finally {
    providerFile.data = originalBytes
  }
  record('Only the configured purchasing source can replace the active invoice. Any attachment byte change blocks approval.',true)

  const attempts = []
  await page.route('**'+api,async route=>{
    if (route.request().method()!=='POST' || route.request().postDataJSON().action!=='approve') return route.continue()
    const response = await route.fetch({maxRetries:0})
    const result = await response.json()
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await page.setViewportSize({width:390,height:844})
  await capture('03-cho-duyet-mobile')
  await button(page,'Duyệt đủ căn cứ thanh toán').click()
  await button(page,'Thử lại cùng yêu cầu').click()
  await page.getByRole('status').filter({hasText:'Đã duyệt đối soát.'}).waitFor()
  assert.equal(attempts.length,2)
  assert.equal(attempts[0].key,attempts[1].key)
  assert.deepEqual(attempts.map(item=>[item.status,item.result.replayed]),[[200,false],[200,true]])
  assert.equal(attempts[0].result.decisionId,attempts[1].result.decisionId)
  await page.reload()
  await page.getByText('Đủ căn cứ thanh toán',{exact:true}).waitFor()
  await capture('04-da-duyet-mobile')
  assert.equal((await read()).decisionId,attempts[0].result.decisionId)
  assert.equal(googleProvider.calls.sendAttempts,0)
  record('An approved three-way match survives lost HTTP response and browser reload with a single decision and zero sends.',true)

  const reduce = await remit('payment-recheck','ky-thuat',warehouse,0.5,'Đính chính thiếu A','dinh-chinh-kho.csv',
    csv(receipts,['DC-7601','PN-7601','A',99,'bộ']))
  await receive(reduce,'dinh-chinh-kho.csv')
  await page.goto(dossier)
  await page.getByText('Thiếu 1 bộ thực nhận',{exact:true}).waitFor()
  assert.deepEqual([(await read()).status,(await read()).decisionId],['blocked',null])
  assert.equal(await button(page,'Duyệt đủ căn cứ thanh toán').count(),0)

  assert.equal((await fetch(app+api+'?id='+id)).status,401)
  assert.equal((await admin.from('whitelist').upsert({email:previousEmail,is_active:true},{onConflict:'email'})).error,null)
  const outsider = await login(previousEmail)
  assert.equal((await outsider.request.get(app+api+'?id='+id)).status(),404)
  assert.equal((await outsider.request.get(app+api+'?email='+correction+'&file='+await fileId(correction))).status(),404)
  assert.equal((await outsider.request.post(app+api,{data:approval,headers:{'Idempotency-Key':randomUUID()}})).status(),404)
  assert.deepEqual(runtimeErrors,[])
  record('A later warehouse correction invalidates the approval. Tenant boundaries, axe and capture overflow checks pass.',true)
}
