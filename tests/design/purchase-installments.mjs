import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const api = '/api/commitments/payment'
const ledger = '/api/commitments'
const button = (scope, name) => scope.getByRole('button', { name, exact: true })
const post = (value, key = randomUUID()) => ({
  method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
})

export async function rehearsePurchaseInstallments({ app, page, deliver, request, accounts, capture, login,
  previousEmail, admin, googleProvider, record, runtimeErrors, orderCode, supplier, warehouse }) {
  const prices = 'po,price_sheet,line,quantity,unit,unit_price,currency'
  const invoices = 'po,invoice,replaces,line,quantity,unit,unit_price,currency'
  const receipts = 'po,document,corrects,line,quantity,unit'
  const csv = (header,...rows) => [header,...rows.map(row=>[orderCode,...row].join(',')), ''].join('\n')
  const remit = (uid,mailbox,from,age,subject,filename,value) => deliver(uid,mailbox,from,age,subject,'Chứng từ đính kèm.',
    [{filename,contentType:'text/csv',data:Buffer.from(value).toString('base64')}])
  const invoiceBytes = (number, replaces, qty) => csv(invoices,[number,replaces,'B',qty,'bộ',8000,'VND'])
  const receiveBytes = (number, qty, corrects = '') => csv(receipts,[number,corrects,'B',qty,'bộ'])
  const invoiceMail = (suffix, number, replaces, qty, age) => remit('inst-invoice-'+suffix,'mua-hang',supplier,age,
    'Chứng từ nhà cung cấp',suffix+'.csv',invoiceBytes(number,replaces,qty))
  const warehouseMail = (suffix, number, qty, age, corrects) => remit('inst-receipt-'+suffix,'ky-thuat',warehouse,age,
    'Biên nhận kho',suffix+'.csv',receiveBytes(number,qty,corrects))

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
  await textApproval(await deliver('inst-order','mua-hang',supplier,10,'Đặt hàng',order),order)
  const id = (await request(ledger)).items.find(item=>item.state.title==='Đối soát '+orderCode).id
  const query = invoice => new URLSearchParams(invoice ? { id, invoice } : { id })
  const dossier = invoice => app + '/commitments/payment?' + query(invoice)
  const read = invoice => request(api+'?'+query(invoice))
  const balance = async (invoice, approved, remaining, over=0) => {
    const row = (await read(invoice)).balances.find(item=>item.code==='B')
    assert.deepEqual([row.approved,row.remaining,row.over],[approved,remaining,over])
  }
  await page.goto(app+'/commitments?group=waiting&id='+id)
  await button(page,'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog',{name:'Thiết lập nguồn nhập kho'})
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup,'Bật đối soát').click()
  await setup.waitFor({state:'hidden'})
  const priceMail = await remit('inst-price','mua-hang',supplier,8,'Đơn giá','bang-gia.csv',
    csv(prices,['BG-7701','A',100,'bộ',12000,'VND'],['BG-7701','B',100,'bộ',8000,'VND']))
  await register(priceMail,'bang-gia.csv','Duyệt đơn giá PO')
  await receive(await warehouseMail('nhap-90','PN-7701',90,5),'nhap-90.csv')

  const firstMail = await invoiceMail('dot-mot','INV-7701','',60,4)
  await register(firstMail,'dot-mot.csv','Ghi nhận hóa đơn')
  const first = (await read()).invoice.id

  const secondMail = await invoiceMail('dot-hai','INV-7702','',50,3)
  await register(secondMail,'dot-hai.csv','Ghi nhận hóa đơn')
  const secondSnapshot = await read()
  const second = secondSnapshot.invoice.id
  assert.equal(secondSnapshot.status,'ready')
  await page.goto(dossier(first))
  await button(page,'Duyệt đủ căn cứ thanh toán').click()
  await page.getByRole('status').filter({hasText:'Đã duyệt đối soát.'}).waitFor()
  const firstDecision = (await read(first)).decisionId
  await request(api,post(secondSnapshot.command),409)
  assert.equal((await read(second)).status,'blocked')
  await balance(second,60,30)

  await page.goto(app+'/inbox')
  const inbox = page.getByRole('list',{name:'Hóa đơn cần đối soát'})
  await inbox.getByRole('link',{name:'INV-7702 · '+orderCode,exact:true}).click()
  await page.waitForURL(url=>url.searchParams.get('invoice')===second)
  await page.getByText('Vượt cộng dồn 20 bộ',{exact:true}).waitFor()
  await page.getByText(/có thể duyệt tối đa 30 bộ/).waitFor()
  assert.equal(await button(page,'Duyệt đủ căn cứ thanh toán').count(),0)
  await capture('01-vuot-cong-don')
  record('Separate 60 and 50 unit invoices each fit 90 received before any approval. Approval of 60 invalidates the other preview and blocks its 20-unit excess.',true)

  await page.goto(app+'/search')
  const question = 'Đối soát nhiều hóa đơn theo đợt ' + orderCode
  await page.getByLabel('Nội dung tìm kiếm',{exact:true}).fill(question)
  await button(page,'Hỏi email').click()
  const ask = page.getByRole('region',{name:'Đối chiếu ba bên'})
  await ask.getByText('Vượt cộng dồn 20 bộ',{exact:true}).waitFor()
  await ask.getByText('Chứng từ dòng B',{exact:true}).click()
  for (const [name, bytes] of [['nhap-90.csv',receiveBytes('PN-7701',90)],['dot-mot.csv',invoiceBytes('INV-7701','',60)]]) {
    const href = await ask.getByRole('link',{name:name+' · dòng 2',exact:true}).getAttribute('href')
    const response = await page.request.get(app+href)
    assert.equal(response.status(),200)
    assert.deepEqual(await response.body(),Buffer.from(bytes))
  }
  const restricted = await request('/api/ask-inbox/answer',post({query:question,accountIds:[accounts['mua-hang'].id]}))
  assert.deepEqual([restricted.status,restricted.payment.status],['insufficient','unavailable'])
  await capture('02-ask-hoa-don-truoc')
  record('Ask explains remaining capacity with the exact warehouse receipt and earlier approved invoice. Hiding a source makes it abstain.',true)

  await receive(await warehouseMail('nhap-them-10','PN-7702',10,6),'nhap-them-10.csv')
  await page.goto(dossier(second))
  await page.getByText('Vượt cộng dồn 10 bộ',{exact:true}).waitFor()
  const corrected = await invoiceMail('dot-hai-dinh-chinh','INV-7703','INV-7702',40,2)
  await register(corrected,'dot-hai-dinh-chinh.csv','Ghi nhận hóa đơn')
  const replacement = (await read()).invoice.id
  assert.equal((await read(second)).status,'superseded')
  assert.equal((await read(first)).decisionId,firstDecision)
  const duplicate = await invoiceMail('ban-gui-lai','INV-7703','INV-7702',40,1.8)
  await openFile(duplicate,'ban-gui-lai.csv')
  await page.getByText('Chứng từ này đã được ghi nhận.',{exact:true}).waitFor()
  assert.equal(await button(page,'Ghi nhận hóa đơn').count(),0)
  await balance(replacement,60,40)
  record('An older warehouse receipt fixes only ten units. The correct successor replaces its own installment, the resend is blocked and the first approval is preserved.',true)

  const attempts = []
  await page.route('**'+api,async route=>{
    if (route.request().method()!=='POST' || route.request().postDataJSON().action!=='approve') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await page.setViewportSize({width:390,height:844})
  await page.goto(dossier(replacement))
  await button(page,'Duyệt đủ căn cứ thanh toán').click()
  await button(page,'Thử lại cùng yêu cầu').click()
  await page.getByRole('status').filter({hasText:'Đã duyệt đối soát.'}).waitFor()
  assert.equal(attempts.length,2)
  assert.equal(attempts[0].key,attempts[1].key)
  assert.deepEqual(attempts.map(item=>[item.status,item.result.replayed]),[[200,false],[200,true]])
  assert.equal(attempts[0].result.decisionId,attempts[1].result.decisionId)
  await page.reload()
  await page.getByText('Đủ căn cứ thanh toán',{exact:true}).waitFor()
  await balance(replacement,100,0)
  await capture('03-tong-100-mobile')
  record('Approval response loss and Chrome reload preserve a single decision and exactly 100 approved units.',true)

  await receive(await warehouseMail('giam-ve-89','DC-7701',89,1,'PN-7701'),'giam-ve-89.csv')
  await page.goto(app+'/inbox')
  await page.getByRole('list',{name:'Hóa đơn cần đối soát'}).getByRole('link',{name:'INV-7703 · '+orderCode,exact:true}).click()
  await page.getByText('Vượt cộng dồn 1 bộ',{exact:true}).waitFor()
  await balance(replacement,100,0,1)
  await page.getByText('Hóa đơn và bản thay thế trên PO',{exact:true}).click()
  const history = page.getByRole('link',{name:'INV-7701',exact:true}).locator('..')
  await history.getByText(/Đã có lần duyệt/).waitFor()
  await capture('04-lich-su-va-vuot')
  record('A warehouse correction after approval raises a one-unit cumulative excess while preserving earlier approvals and correction history.',true)

  const revisedFirst = await invoiceMail('dot-mot-dinh-chinh','INV-7704','INV-7701',59,0.6)
  await register(revisedFirst,'dot-mot-dinh-chinh.csv','Ghi nhận hóa đơn')
  const revised = (await read()).invoice.id
  assert.equal((await read(revised)).status,'ready')
  await balance(revised,100,0,1)
  await page.goto(dossier(revised))
  await button(page,'Duyệt đủ căn cứ thanh toán').click()
  await page.getByRole('status').filter({hasText:'Đã duyệt đối soát.'}).waitFor()
  await balance(revised,99,0)
  assert.equal((await read(first)).status,'superseded')
  assert.equal((await read(replacement)).status,'approved')
  assert.equal(googleProvider.calls.sendAttempts,0)
  record('Correcting an approved installment reserves its old quantity until its replacement is approved, then replaces the allocation without double billing.',true)

  const aReceipt = await remit('inst-race-stock','ky-thuat',warehouse,0.5,'Nhập A','nhap-a.csv',
    csv(receipts,['PN-7703','','A',90,'bộ']))
  await receive(aReceipt,'nhap-a.csv')
  const competingIds = []
  for (let index=0; index<2; index++) {
    const filename = 'duyet-dong-thoi-' + index + '.csv'
    const email = await remit('inst-race-'+index,'mua-hang',supplier,0.3,'Hóa đơn cạnh tranh ' + index,filename,
      csv(invoices,['INV-771'+index,'','A',60,'bộ',12000,'VND']))
    await register(email,filename,'Ghi nhận hóa đơn')
    competingIds.push((await read()).invoice.id)
  }
  const candidates = await Promise.all(competingIds.map(read))
  assert.ok(candidates.every(candidate=>candidate.status==='ready'))
  const concurrent = await Promise.all(candidates.map(candidate=>page.request.post(app+api,{
    data:candidate.command,headers:{'Idempotency-Key':randomUUID()},
  })))
  assert.deepEqual(concurrent.map(result=>result.status()).sort(),[200,409])
  const afterRace = await Promise.all(competingIds.map(read))
  assert.deepEqual(afterRace.map(result=>result.status).sort(),['approved','blocked'])
  assert.deepEqual(afterRace[0].balances.find(item=>item.code==='A'),{code:'A',unit:'bộ',approved:60,remaining:30,over:0})
  record('Two simultaneous approvals cannot spend the same 90 received units. One receives a decision and one is blocked.',true)

  assert.equal((await fetch(app+api+'?'+query(revised))).status,401)
  assert.equal((await admin.from('whitelist').upsert({email:previousEmail,is_active:true},{onConflict:'email'})).error,null)
  const outsider = await login(previousEmail)
  assert.equal((await outsider.request.get(app+api+'?'+query(revised))).status(),404)
  assert.equal((await outsider.request.post(app+api,{data:secondSnapshot.command,headers:{'Idempotency-Key':randomUUID()}})).status(),404)
  assert.deepEqual(runtimeErrors,[])
  record('Chrome checks other-tenant access, zero email sends, axe and horizontal overflow.',true)
}
