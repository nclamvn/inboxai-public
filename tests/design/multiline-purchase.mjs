import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const command = (value, key = randomUUID()) => ({
  method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
})

export async function rehearseMultilinePurchase({
  app, page, deliver, request, accounts, capture, login, previousEmail, admin, googleProvider, record, runtimeErrors, orderCode, supplier, warehouse,
}) {
  const ledger = '/api/commitments'
  const purchase = ledger + '/purchase'
  const heading = 'Đối soát ' + orderCode
  const openProposal = async (emailId, quote) => {
    await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + emailId)
    await page.getByText(quote, { exact: true }).waitFor()
    return page
  }
  const review = async (emailId, quote, { correction = false, loseAck = false, original } = {}) => {
    await openProposal(emailId, quote)
    const card = page.getByRole('listitem').filter({ has: page.getByText(quote, { exact: true }) })
    await button(card, 'Xem và xác nhận').click()
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    await dialog.getByText(quote, { exact: true }).waitFor()
    await dialog.getByRole('region', { name: 'Số lượng sau khi duyệt' }).getByRole('table').waitFor()
    if (original) await dialog.getByRole('region', { name: 'Phiếu nhập gốc' }).getByText(original, { exact: true }).waitFor()
    await button(dialog, correction ? 'Duyệt đính chính' : 'Xác nhận và ghi vào sổ').click()
    if (loseAck) await button(dialog, 'Thử lưu lại').click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('status').filter({ hasText:'Đã ghi vào sổ' }).waitFor()
  }

  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  const initial = 'Đơn mua hàng nhiều dòng, hạn ' + due + ': A 100 bộ + B 100 bộ.'
  const order = await deliver('multi-order', 'mua-hang', supplier, 9, 'Xác nhận hai dòng mua hàng', initial)
  assert.ok(!(await request(ledger)).items.some(item => item.state.title === heading))
  await review(order, initial)
  const id = (await request(ledger)).items.find(item => item.state.title === heading).id
  const detail = () => request(ledger + '/' + id)
  const detailUrl = app + '/commitments?group=waiting&id=' + id
  const snapshot = async (version, a, b, status = 'open') => {
    const current = await detail()
    assert.deepEqual([current.version, current.state.status, current.state.purchaseOrder.lines.map(line => [line.code,line.ordered,line.reported,line.received])],
      [version,status,[['A',100,...a],['B',100,...b]]])
    return current
  }
  await page.goto(detailUrl)
  await button(page, 'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog', { name: 'Thiết lập nguồn nhập kho' })
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup,'Bật đối soát').click()
  await setup.waitFor({ state: 'hidden' })
  await snapshot(2,[0,0],[0,0])

  const shipA = 'Báo giao dòng A: 100 bộ.'
  const shipB = 'Báo giao dòng B: 100 bộ.'
  await review(await deliver('multi-ship-a','mua-hang',supplier,7,'Báo giao A',shipA),shipA)
  await review(await deliver('multi-ship-b','mua-hang',supplier,6,'Báo giao B',shipB),shipB)
  const a110 = 'Phiếu nhập PN-7111 dòng A: kho thực nhận 110 bộ.'
  const b90 = 'Phiếu nhập PN-7111 dòng B: kho thực nhận 90 bộ.'
  const receiptA = await deliver('multi-primary','ky-thuat',warehouse,3,'Phiếu kiểm đếm A và B',a110 + '\n' + b90)
  const receiptB = receiptA
  await review(receiptA,a110)
  await snapshot(5,[100,110],[100,0])
  const attempts = { receive: [], close: [] }
  await page.route('**/api/commitments/purchase', async route => {
    const data = route.request().postDataJSON()
    const recorded = data.emailId === receiptB && data.quote === b90 ? attempts.receive : data.operation === 'close' ? attempts.close : null
    if (!recorded) return route.continue()
    const key = route.request().headers()['idempotency-key']
    const response = await route.fetch({ maxRetries: 0 })
    recorded.push({ key, status: response.status(), result: await response.json() })
    if (recorded.length === 1 && response.ok()) return route.abort()
    return route.fulfill({ response })
  })
  await review(receiptB,b90,{ loseAck: true })
  function replay(group, version) {
    assert.equal(group.length,2)
    assert.equal(group[0].key,group[1].key)
    assert.deepEqual(group.map(item => [item.status,item.result.version,item.result.replayed]),[[200,version,false],[200,version,true]])
  }
  replay(attempts.receive,6)
  await snapshot(6,[100,110],[100,90])
  await request(purchase, command({ operation:'close', id, version:6 }),409)
  assert.equal((await detail()).version,6)
  record('The same receipt number can cover two lines. A surplus of 10 cannot cancel B shortage of 10. Lost receipt approval replays one revision.',true)

  const missing = 'Phiếu nhập PN-7112: kho đã nhận 10 bộ.'
  const missingId = await deliver('multi-missing','ky-thuat',warehouse,2,'Phiếu không ghi dòng',missing)
  await openProposal(missingId,missing)
  await page.getByText(/Chưa xác định được mã dòng và đơn vị khớp/).waitFor()
  assert.equal(await button(page,'Xem và xác nhận').count(),0)
  await button(page,'Đã kiểm tra, giữ nguyên sổ').click()
  await page.getByRole('status').filter({ hasText:'Đã kiểm tra và giữ nguyên sổ' }).waitFor()
  const malformed = 'Phiếu nhập PN-7115 dòng A/B: kho thực nhận 10 bộ.'
  const ambiguousId = await deliver('multi-ambiguous','ky-thuat',warehouse,2,'Phiếu ghi hai mã dòng',malformed)
  await openProposal(ambiguousId,malformed)
  await page.getByText(/Chưa xác định được mã dòng và đơn vị khớp/).waitFor()
  assert.equal(await button(page,'Xem và xác nhận').count(),0)
  const duplicateId = await deliver('multi-copy','ky-thuat',warehouse,2,'Phiếu A đã nhận',a110)
  const duplicate = (await request(ledger + '/catchup?source=' + duplicateId)).proposals[0]
  assert.equal(duplicate.blocked,'duplicate_receipt')
  assert.equal(duplicate.review,null)
  await snapshot(6,[100,110],[100,90])
  record('Missing and ambiguous line codes cannot be approved. A copied receipt on the same line does not change quantities.',true)

  await page.goto(app + '/inbox')
  const task = page.getByRole('region',{ name:'Cam kết cần chú ý' }).getByRole('listitem').filter({ hasText:heading })
  await task.getByText('Chênh lệch theo dòng',{ exact:true }).waitFor()
  const table = task.getByRole('table')
  await table.getByRole('row').filter({ has: page.getByRole('rowheader',{name:'A',exact:true}) }).getByText('Thừa 10 bộ',{exact:true}).waitFor()
  await table.getByRole('row').filter({ has: page.getByRole('rowheader',{name:'B',exact:true}) }).getByText('Thiếu 10 bộ',{exact:true}).waitFor()
  await capture('01-chenh-lech')
  assert.equal(googleProvider.calls.sendAttempts,0)
  await button(task,'Xem trước lời nhắc').click()
  const reminder = page.getByRole('dialog',{name:'Xem trước lời nhắc'})
  await reminder.getByText(supplier,{exact:true}).waitFor()
  await reminder.getByText(/Dòng B thiếu 10 bộ/).waitFor()
  assert.doesNotMatch(await reminder.innerText(),/Dòng A thiếu/)
  const reminderPath = ledger + '/' + id + '/reminder'
  const preview = await request(reminderPath)
  await button(reminder,'Xác nhận và gửi lời nhắc').click()
  await reminder.getByText('Đã gửi lời nhắc',{exact:true}).waitFor()
  assert.equal((await request(reminderPath,command({ accountId:preview.accountId,version:preview.version,proof:preview.proof }))).state,'accepted')
  assert.equal(googleProvider.calls.sendAttempts,1)
  assert.deepEqual([googleProvider.calls.sent[0].from,googleProvider.calls.sent[0].to],[accounts['mua-hang'].address,[supplier]])
  record('Action Inbox distinguishes both discrepancies and sends the approved B-only reminder once from the purchasing account.',true)

  await page.goto(app + '/search')
  const question = 'Đối soát từng dòng ' + orderCode + ' còn thiếu bao nhiêu?'
  await page.getByLabel('Nội dung tìm kiếm',{exact:true}).fill(question)
  await button(page,'Hỏi email').click()
  const ask = page.getByRole('region',{name:'Đối soát theo dòng đơn mua hàng',exact:true})
  for (const [line,receipt,shipped] of [['A',a110,shipA],['B',b90,shipB]]) {
    const sources = ask.getByRole('region',{name:'Nguồn dòng ' + line,exact:true})
    await sources.getByText(receipt,{exact:true}).waitFor()
    await sources.getByText(shipped,{exact:true}).waitFor()
  }
  await ask.getByText(initial,{exact:true}).waitFor()
  assert.equal(await ask.getByRole('link',{name:/Mở nguồn/}).count(),5)
  const restricted = await request('/api/ask-inbox/answer',command({query:question,accountIds:[accounts['mua-hang'].id]}))
  assert.deepEqual([restricted.status,restricted.purchase],['insufficient',null])
  await capture('02-ask-theo-dong')
  await ask.getByRole('region',{name:'Nguồn dòng B',exact:true}).getByRole('link',{name:/Mở nguồn · .*Phiếu kiểm đếm A và B/}).click()
  await page.waitForURL(url => url.pathname === '/search/source' && url.searchParams.get('email') === receiptB)
  await page.getByText(b90,{exact:false}).first().waitFor()
  record('Ask Inbox cites the original order and both accounts per line. A source link opens the right receipt and restricted scope abstains.',true)

  const correction = 'Đính chính DC-7201 cho PN-7111 dòng A: kho thực nhận 100 bộ.'
  const fix = await deliver('multi-fix','ky-thuat',warehouse,1,'Điều chỉnh A',correction)
  await review(fix,correction,{correction:true,original:a110})
  await snapshot(7,[100,100],[100,90])
  const late = 'Phiếu nhập PN-7120 dòng B: kho thực nhận 10 bộ.'
  const lateId = await deliver('multi-late','ky-thuat',warehouse,4,'Phiếu B đồng bộ muộn',late)
  await snapshot(7,[100,100],[100,90])
  await review(lateId,late)
  await snapshot(8,[100,100],[100,100])
  await page.setViewportSize({width:390,height:844})
  await page.goto(detailUrl)
  await button(page,'Xem trước và khép cam kết').click()
  const close = page.getByRole('dialog',{name:'Xác nhận khép đối soát'})
  for (const quote of [initial,shipA,shipB,a110,b90,correction,late]) await close.getByText(quote,{exact:true}).waitFor()
  const approveBox = await button(close,'Xác nhận khép cam kết').boundingBox()
  assert.ok(approveBox && approveBox.y + approveBox.height <= 844, 'close approval is visible without scrolling the entire dialog')
  await capture('03-xem-truoc-khep-mobile')
  await button(close,'Xác nhận khép cam kết').click()
  await button(close,'Thử lưu lại').click()
  await close.waitFor({state:'hidden'})
  replay(attempts.close,9)
  const final = await snapshot(9,[100,100],[100,100],'completed')
  assert.equal(final.history.filter(item => item.version === 9).length,1)
  await page.goto(app + '/commitments?group=closed&id=' + id)
  await page.getByRole('region',{name:heading,exact:true}).getByText('Hoàn tất',{exact:true}).first().waitFor()
  await capture('04-da-khep-mobile')
  record('The correction changes A only. An older B receipt adds to B after approval. Mobile Chrome shows all evidence and retries close without a duplicate.',true)

  assert.equal((await fetch(app + purchase,command({operation:'close',id,version:9}))).status,401)
  assert.equal((await admin.from('whitelist').upsert({email:previousEmail,is_active:true},{onConflict:'email'})).error,null)
  const stranger = await login(previousEmail)
  assert.equal((await stranger.request.post(app + purchase,{data:{operation:'close',id,version:9},headers:{'Idempotency-Key':randomUUID()}})).status(),404)
  const strangerAnswer = await stranger.request.post(app + '/api/ask-inbox/answer',{data:{query:question}})
  assert.equal((await strangerAnswer.json()).status,'insufficient')
  assert.deepEqual(runtimeErrors,[])
  record('Anonymous and other-user approvals fail. The second user cannot retrieve evidence. No Chrome page errors or capture-time axe violations.',true)
}
