import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const api = '/api/commitments/purchase-csv'
const ledger = '/api/commitments'
const button = (scope, name) => scope.getByRole('button', { name, exact: true })
const command = (value, key = randomUUID()) => ({
  method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
})

export async function rehearsePurchaseCsv({ app, page, deliver, request, accounts, capture, login,
  previousEmail, admin, record, runtimeErrors, orderCode, supplier, warehouse }) {
  const header = 'po,document,corrects,line,quantity,unit'
  const row = (document, line, amount, original = '') => [orderCode, document, original, line, amount, 'bộ'].join(',')
  const document = (...rows) => [header, ...rows, ''].join('\r\n')
  const attachment = (filename, content) => [{ filename, contentType: 'text/csv', data: Buffer.from(content).toString('base64') }]
  const sendFile = (uid, department, sender, age, subject, filename, content) =>
    deliver(uid, department, sender, age, subject, 'Gửi chứng từ kiểm đếm đính kèm.', attachment(filename, content))
  const fileUrl = (email, file) => api + '?' + new URLSearchParams({ email, file })
  const fileId = async emailId => {
    const response = await request('/api/emails/' + emailId + '/attachments')
    assert.equal(response.attachments.length, 1)
    return response.attachments[0].id
  }
  async function approveText(source, quote) {
    await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + source)
    await page.getByText(quote, { exact: true }).waitFor()
    await button(page, 'Xem và xác nhận').click()
    const review = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    await button(review, 'Xác nhận và ghi vào sổ').click()
    await review.waitFor({ state:'hidden' })
  }
  const due = new Date(Date.now()+5*86_400_000).toISOString().slice(0,10)
  const order = 'Đơn mua hàng nhiều dòng, hạn ' + due + ': A 100 bộ + B 100 bộ.'
  await approveText(await deliver('csv-order','mua-hang',supplier,10,'Đặt hàng',order),order)
  const id = (await request(ledger)).items.find(item => item.state.title === 'Đối soát ' + orderCode).id
  const detailUrl = app + '/commitments?group=waiting&id=' + id
  await page.goto(detailUrl)
  await button(page,'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog',{name:'Thiết lập nguồn nhập kho'})
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup,'Bật đối soát').click()
  await setup.waitFor({state:'hidden'})
  for (const code of ['A','B']) {
    const quote = 'Báo giao dòng ' + code + ': 100 bộ.'
    await approveText(await deliver('csv-ship-' + code,'mua-hang',supplier,6,'Báo giao ' + code,quote),quote)
  }

  const snapshot = async (version, quantities, status = 'open') => {
    const current = await request(ledger + '/' + id)
    assert.deepEqual([current.version,current.state.status,current.state.purchaseOrder.lines.map(line=>line.received)], [version,status,quantities])
    return current
  }
  const fileName = 'phieu-nhap.csv'
  const primary = '\uFEFF' + document(row('PN-7300','A',110),row('PN-7300','B',90))
  const other = await sendFile('csv-wrong-box','mua-hang',warehouse,4,'Mua hàng nhận bản sao',fileName,
    document(row('PN-7399','A',100),row('PN-7399','B',100)))
  const right = await sendFile('csv-right-box','ky-thuat',warehouse,4,'Kho kiểm đếm A và B',fileName,primary)
  const correctFile = await fileId(right)
  const wrongFile = await fileId(other)
  assert.notEqual(correctFile,wrongFile)
  await request(fileUrl(right,wrongFile),undefined,404)
  await page.goto(app + '/inbox?email=' + other)
  await page.getByRole('link',{name:'Đối soát CSV · ' + fileName,exact:true}).click()
  await page.getByText(/Email chưa khớp địa chỉ gửi và hộp thư kho/).waitFor()
  assert.equal(await button(page,'Duyệt và ghi phiếu').count(),0)
  await page.goto(app + '/inbox?email=' + right)
  await page.getByRole('link',{name:'Đối soát CSV · ' + fileName,exact:true}).click()
  await page.waitForURL(url=>url.searchParams.get('file')===correctFile)
  await page.getByRole('region',{name:'Dòng chứng từ'}).getByText('0 → 110 bộ',{exact:true}).waitFor()
  await page.getByText('Thừa 10 bộ',{exact:true}).waitFor()
  await page.getByText('Thiếu 10 bộ',{exact:true}).waitFor()
  await snapshot(4,[0,0])
  const exactSource = await page.getByRole('link',{name:'Tải CSV nguồn',exact:true}).getAttribute('href')
  const sourceBytes = await page.request.get(app+exactSource)
  assert.equal(sourceBytes.status(),200)
  assert.deepEqual(await sourceBytes.body(),Buffer.from(primary))
  await capture('01-xem-truoc-csv')

  const providerFile = accounts['ky-thuat'].box.messages.get('csv-right-box').attachments[0]
  const originalBytes = providerFile.data
  const beforeChange = await request(fileUrl(right,correctFile))
  try {
    providerFile.data = Buffer.from(primary.replace(',B,90,',',B,91,')).toString('base64')
    await request(api,command(beforeChange.approval),409)
    assert.equal((await page.request.get(app+exactSource)).status(),409)
    await snapshot(4,[0,0])
  } finally {
    providerFile.data = originalBytes
  }
  record('Chrome opens the exact attachment from the warehouse mailbox. Same-name files and mixed email/file IDs cannot substitute for it. Changed provider bytes invalidate preview and approval.',true)

  const attempts = []
  await page.route('**' + api,async route=>{
    if (route.request().method()!=='POST' || route.request().postDataJSON().attachmentId!==correctFile) return route.continue()
    const res = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'], result:await res.json(), status:res.status()})
    if (attempts.length===1 && res.ok()) return route.abort()
    return route.fulfill({response:res})
  })
  await button(page,'Duyệt và ghi phiếu').click()
  await button(page,'Thử lại duyệt phiếu').click()
  await page.getByRole('status').filter({hasText:'Đã ghi phiếu vào sổ'}).waitFor()
  assert.equal(attempts.length,2)
  assert.equal(attempts[0].key,attempts[1].key)
  assert.deepEqual(attempts.map(item=>[item.status,item.result.version,item.result.replayed]),[[200,5,false],[200,5,true]])
  const first = await snapshot(5,[110,90])
  assert.equal(first.history[0].sources.length,2)
  assert.deepEqual(first.history[0].sources.map(source=>[source.emailId,source.attachment.id,source.attachment.row]),
    [[right,correctFile,2],[right,correctFile,3]])
  await request(ledger+'/purchase',command({operation:'close',id,version:5}),409)
  record('One CSV approval posts both rows in one revision. Lost Chrome acknowledgement replays it. Equal order totals cannot close mismatched lines.',true)

  const missing = await sendFile('csv-missing','ky-thuat',warehouse,2,'Phiếu thiếu mã dòng','thieu-ma.csv',
    document(row('PN-7301','B',10),row('PN-7301','',2)))
  const duplicate = await sendFile('csv-resend','ky-thuat',warehouse,2,'Gửi lại phiếu','phieu-nhap-gui-lai.csv',primary)
  async function reviewLink(emailId) {
    await page.goto(app + '/inbox?email=' + emailId)
    await page.getByRole('link',{name:/^Đối soát CSV/}).click()
  }
  await reviewLink(missing)
  await page.getByText(/Dòng 3 của CSV thiếu mã dòng/).waitFor()
  assert.equal(await button(page,'Duyệt và ghi phiếu').count(),0)
  await capture('02-thieu-ma-dong')
  await reviewLink(duplicate)
  await page.getByText('Phiếu này đã được ghi vào sổ.',{exact:true}).waitFor()
  assert.equal(await button(page,'Duyệt và ghi phiếu').count(),0)
  await snapshot(5,[110,90])
  record('A valid row beside a row with no line code remains unposted. A resend with a renamed file is blocked by the document number.',true)

  await page.goto(app + '/inbox')
  const action = page.getByRole('region',{name:'Cam kết cần chú ý'}).getByRole('listitem').filter({hasText:orderCode})
  await action.getByText('Thừa 10 bộ',{exact:true}).waitFor()
  await action.getByText('Thiếu 10 bộ',{exact:true}).waitFor()
  const reminder = await request(ledger + '/' + id + '/reminder')
  assert.match(reminder.text,/Dòng B thiếu 10 bộ/)
  assert.doesNotMatch(reminder.text,/Dòng A thiếu/)
  await page.goto(app + '/search')
  const question = 'Đối soát từng dòng ' + orderCode
  await page.getByLabel('Nội dung tìm kiếm',{exact:true}).fill(question)
  await button(page,'Hỏi email').click()
  const ask = page.getByRole('region',{name:'Đối soát theo dòng đơn mua hàng',exact:true})
  const proof = ask.getByRole('region',{name:'Nguồn dòng B',exact:true}).getByRole('link',{name:fileName+' · dòng 3'})
  await proof.waitFor()
  const href = await proof.getAttribute('href')
  const downloaded = await page.request.get(app+href)
  assert.equal(downloaded.status(),200)
  assert.deepEqual(await downloaded.body(),Buffer.from(primary))
  const [download] = await Promise.all([page.waitForEvent('download'),proof.click()])
  assert.equal(download.suggestedFilename(),fileName)
  assert.equal(await download.failure(),null)
  const restricted = await request('/api/ask-inbox/answer',command({query:question,accountIds:[accounts['mua-hang'].id]}))
  assert.deepEqual([restricted.status,restricted.purchase],['insufficient',null])
  await capture('03-ask-chung-tu')
  record('Action Inbox and Ask use the approved rows. The CSV citation downloads the exact bytes. A mailbox filter hiding the warehouse makes Ask abstain.',true)

  const correction = await sendFile('csv-fix','ky-thuat',warehouse,1,'Đính chính dòng A','dinh-chinh.csv',document(row('DC-7300','A',100,'PN-7300')))
  await reviewLink(correction)
  await page.getByRole('region',{name:'Chứng cứ trước đính chính'}).getByRole('link',{name:fileName+' · dòng 2'}).waitFor()
  await page.getByText('110 → 100 bộ',{exact:true}).waitFor()
  await button(page,'Duyệt và ghi phiếu').click()
  await page.getByRole('status').filter({hasText:'Đã ghi phiếu vào sổ'}).waitFor()
  await snapshot(6,[100,90])
  const late = await sendFile('csv-late','ky-thuat',warehouse,5,'Phiếu B đồng bộ muộn','bo-sung.csv',document(row('PN-7302','B',10)))
  await reviewLink(late)
  await page.getByText('90 → 100 bộ',{exact:true}).waitFor()
  await button(page,'Duyệt và ghi phiếu').click()
  await page.getByRole('status').filter({hasText:'Đã ghi phiếu vào sổ'}).waitFor()
  await snapshot(7,[100,100])
  await page.setViewportSize({width:390,height:844})
  await page.goto(detailUrl)
  await button(page,'Xem trước và khép cam kết').click()
  const close = page.getByRole('dialog',{name:'Xác nhận khép đối soát'})
  for (const name of [fileName+' · dòng 2',fileName+' · dòng 3','dinh-chinh.csv · dòng 2','bo-sung.csv · dòng 2'])
    await close.getByRole('link',{name,exact:true}).waitFor()
  await capture('04-khep-don-mobile')
  await button(close,'Xác nhận khép cam kết').click()
  await close.waitFor({state:'hidden'})
  await snapshot(8,[100,100],'completed')
  record('A correction replaces A only. A late extra CSV adds B only. Mobile Chrome can verify the attachments and close a fully matched PO.',true)

  assert.equal((await fetch(app+href)).status,401)
  assert.equal((await admin.from('whitelist').upsert({email:previousEmail,is_active:true},{onConflict:'email'})).error,null)
  const outsider = await login(previousEmail)
  for (const path of [href,fileUrl(right,correctFile)]) assert.equal((await outsider.request.get(app+path)).status(),404)
  const foreignAsk = await outsider.request.post(app+'/api/ask-inbox/answer',{data:{query:question}})
  assert.equal((await foreignAsk.json()).status,'insufficient')
  assert.deepEqual(runtimeErrors,[])
  record('Anonymous and other-tenant users cannot preview or download warehouse proofs. All captured Chrome views pass axe and horizontal overflow checks.',true)
}
