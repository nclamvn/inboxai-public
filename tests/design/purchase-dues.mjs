import assert from 'node:assert/strict'

const endpoint = '/api/commitments/dues'
const boardPath = '/commitments/dues'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const row = (page, number) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: new RegExp('^' + number + ' ·') }) })
const dayAfter = (day, days) => new Date(Date.parse(day) + days * 86_400_000).toISOString().slice(0, 10)

export async function setupPurchase({ app, page, reviewer, deliver, request, accounts, fileAction, assign,
  paymentDue, supplier, warehouse, invoice, receipts, reference, number, deadline }) {
  const quote = 'Đơn mua hàng nhiều dòng, hạn ' + dayAfter(paymentDue, 20) + ': A 6 bộ + B 30 bộ.'
  const source = await deliver('po-' + reference, 'mua-hang', supplier, 8, 'Đặt hàng', quote, [], reference)
  await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + source)
  await page.getByText(quote, { exact: true }).waitFor()
  await button(page, 'Xem và xác nhận').click()
  const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
  await button(dialog, 'Xác nhận và ghi vào sổ').click()
  await dialog.waitFor({ state: 'hidden' })
  const target = (await request('/api/commitments')).items.find(item => item.state.title === 'Đối soát ' + reference)
  assert.ok(target)
  await page.goto(app + '/commitments?group=waiting&id=' + target.id)
  await button(page, 'Thiết lập nguồn nhập kho').click()
  const setup = page.getByRole('dialog', { name: 'Thiết lập nguồn nhập kho' })
  await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
  await setup.getByLabel('Email nhân viên kho').fill(warehouse)
  await button(setup, 'Bật đối soát').click()
  await setup.waitFor({ state: 'hidden' })

  async function register(uid, from, age, kind, header, lines, action) {
    const filename = uid + '.csv'
    const contents = [header, ...lines.map(fields => [reference, ...fields].join(',')), ''].join('\n')
    const mail = await deliver(uid, 'mua-hang', from, age, 'Chứng từ PO', 'Chứng từ đính kèm.',
      [{ filename, contentType: 'text/csv', data: Buffer.from(contents).toString('base64') }], reference)
    await fileAction(mail, filename, action, kind)
  }
  await register('price-' + reference, supplier, 7, 'Bảng giá hoặc hóa đơn', 'po,price_sheet,line,quantity,unit,unit_price,currency',
    [['BG-8701','A',6,'bộ',3000,'VND'], ['BG-8701','B',30,'bộ',2000,'VND']], 'Duyệt đơn giá PO')
  await register('receipt-' + reference, warehouse, 6, 'Đối soát CSV', receipts,
    [['PN-8701','','B',30,'bộ']], 'Duyệt và ghi phiếu')
  await register('invoice-' + reference, supplier, 5, 'Bảng giá hoặc hóa đơn', deadline ? invoice+',payment_due' : invoice,
    [[number,'','B',30,'bộ',2000,'VND',...(deadline ? [deadline] : [])]], 'Ghi nhận hóa đơn')
  const paymentQuery = '/api/commitments/payment?id=' + target.id
  await page.goto(app + '/commitments/payment?id=' + target.id)
  const snapshot = await request(paymentQuery)
  await assign()
  await page.getByRole('status').filter({ hasText: 'Đã bàn giao hồ sơ cho Kế toán.' }).waitFor()
  const handoff = await request('/api/commitments/handoffs?' + new URLSearchParams({ commitment: target.id, invoice: snapshot.invoice.id }))
  await reviewer.goto(app + '/commitments/handoffs?id=' + handoff.pending.id)
  if (deadline) await reviewer.getByText('Hạn thanh toán trên hóa đơn ' + deadline, { exact: true }).waitFor()
  await button(reviewer, 'Duyệt đủ căn cứ thanh toán').click()
  await reviewer.getByRole('status').filter({ hasText: 'Đã duyệt hồ sơ.' }).waitFor()
  return { orderId:target.id, invoiceId:snapshot.invoice.id, handoffId:handoff.pending.id }
}

export async function rehearsePurchaseDues({ app, page, reviewer, outsider, deliver, request, accounts, fileAction, assign,
  capture, record, paymentDue, supplier, warehouse, invoice, receipts, mainInvoice, mainHandoff, previousEmail, purchaseBatches, purchaseFocus, purchaseSupplements }) {
  const movedDue = dayAfter(paymentDue, 1)
  const laterDue = dayAfter(paymentDue, 3)

  const setup = (reference, number, deadline) => setupPurchase({ app, page, reviewer, deliver, request,
    accounts, fileAction, assign, paymentDue, supplier, warehouse, invoice, receipts, reference, number, deadline })

  async function read(actor) {
    const response = await actor.request.get(app + endpoint)
    assert.equal(response.status(), 200, await response.text())
    return (await response.json()).items
  }
  async function open(actor) {
    await actor.goto(app + boardPath)
    await actor.getByRole('heading', { name: 'Công nợ cần xử lý' }).waitFor()
    await actor.getByRole('list', { name: 'Các khoản cần xử lý' }).waitFor()
  }

  const legacy = await setup('PO-9422', 'INV-8702', undefined)
  await setup('PO-9423', 'INV-8703', laterDue)
  await reviewer.goto(app + '/commitments')
  await reviewer.getByRole('link', { name: 'Công nợ cần xử lý', exact: true }).click()
  const records = await read(reviewer)
  assert.deepEqual(records.map(item => [item.reference, item.invoice, item.deadline, item.remaining]), [
    ['PO-9418','INV-7803',paymentDue,312000],
    ['PO-9423','INV-8703',laterDue,60000],
    ['PO-9422','INV-8702',null,60000],
  ])
  await row(reviewer,'INV-7803').waitFor()
  await row(reviewer,'INV-8702').getByText('Chưa xác minh hạn', { exact: true }).waitFor()
  assert.deepEqual(await read(outsider), [])
  await outsider.goto(app + boardPath)
  await outsider.getByText('Không có công nợ cần xử lý trong phạm vi của bạn.', { exact: true }).waitFor()
  assert.equal((await fetch(app + endpoint)).status, 401)
  assert.equal((await reviewer.request.get(app + endpoint + '?page=-1')).status(), 400)
  assert.deepEqual(await (await reviewer.request.get(app + endpoint + '?page=1')).json(), { items: [], hasMore: false })
  const downloadLink = row(reviewer,'INV-7803').getByRole('link', { name: 'Tải hóa đơn đã duyệt' })
  const invoiceDownload = await downloadLink.getAttribute('href')
  const downloadEvent = reviewer.waitForEvent('download')
  await downloadLink.click()
  const download = await downloadEvent
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  assert.equal(download.suggestedFilename(), 'dinh-chinh.csv')
  assert.ok(Buffer.concat(chunks).toString('utf8').includes('VND,' + paymentDue))
  assert.equal((await outsider.request.get(app + invoiceDownload)).status(), 404)
  assert.equal((await page.request.get(app + invoiceDownload)).status(), 404)
  assert.equal(records[0].id, mainHandoff)
  assert.equal(records[0].invoiceEmailId, null)
  assert.equal(records[0].orderId, null)
  assert.equal(records[0].invoiceId, null)
  await open(page)
  const buyerRecord = (await read(page))[0]
  assert.equal(buyerRecord.invoiceId, mainInvoice)
  assert.equal(buyerRecord.invoiceAttachmentId, null)
  await row(page,'INV-7803').getByRole('link', { name: 'Email hóa đơn' }).click()
  await page.waitForURL('**/inbox?email=' + buyerRecord.invoiceEmailId)
  await page.getByRole('link',{name:'Bảng giá hoặc hóa đơn · dinh-chinh.csv',exact:true}).waitFor()
  await capture('12-cong-no-nhieu-po', reviewer)
  record('Three POs sort by approved payment deadline, leave a legacy invoice undated, and isolate buyer email, exact delegated CSV and outsider access.', true)

  return {
    movedDue,
    async checkException(accountant, bank) {
      const { rehearsePurchaseException } = await import('./purchase-exception.mjs')
      await rehearsePurchaseException({ app,buyer:page,accountant,outsider,buyerMail:deliver,request,supplier,invoice,legacy,
        competingReviewer:previousEmail,bank,capture,record,purchaseBatches,purchaseFocus,purchaseSupplements })
    },
    async checkBatch(accountant, bank, scope) {
      const { rehearsePurchaseBatch } = await import('./purchase-batch.mjs')
      await rehearsePurchaseBatch({ app,buyer:page,accountant,approver:outsider,buyerMail:deliver,request,
        supplier,invoice,bank,capture,record,...scope })
    },
    async checkPartial(invoiceId, paymentMail) {
      await reviewer.clock.setFixedTime(new Date(paymentDue + 'T16:59:59Z'))
      await open(reviewer)
      await row(reviewer,'INV-7803').getByText('Đến hạn hôm nay', { exact: true }).waitFor()
      await reviewer.clock.setFixedTime(new Date(paymentDue + 'T17:00:00Z'))
      await button(reviewer, 'Làm mới công nợ').click()
      await row(reviewer,'INV-7803').getByText('Quá hạn', { exact: true }).waitFor()
      await row(reviewer,'INV-7803').getByText('112.000 ₫', { exact: true }).waitFor()
      await row(reviewer,'INV-8703').getByText('Sắp đến hạn', { exact: true }).waitFor()
      await open(page)
      const own = (await read(page)).find(item => item.invoiceId === invoiceId)
      assert.equal(own.remaining, 112000)
      assert.equal((await read(reviewer))[0].returnEmailId, null)
      await row(reviewer,'INV-7803').getByRole('link', { name: 'Mở hồ sơ', exact: true }).click()
      await reviewer.getByRole('link', { name: 'thanh-toan-dot-1.csv', exact: true }).click()
      await reviewer.waitForURL('**/inbox?email=' + paymentMail)
      await reviewer.clock.setFixedTime(new Date())
      record('Vietnam midnight changes the invoice from due today to overdue. Both roles see exactly 112000 VND remaining and the accountant opens the right payment email.', true)
    },
    async checkCorrection(oldHandoff) {
      await open(reviewer)
      await row(reviewer,'INV-7803').getByText('Cần đối soát lại', { exact: true }).waitFor()
      await row(reviewer,'INV-7803').getByText('Chưa xác minh hạn', { exact: true }).waitFor()
      assert.equal((await read(reviewer)).find(item => item.id === oldHandoff).deadline, null)
      assert.equal((await reviewer.request.get(app + invoiceDownload)).status(), 404)
    },
    async checkReapproved(newHandoff) {
      await open(reviewer)
      await row(reviewer,'INV-7804').getByText('104.000 ₫', { exact: true }).waitFor()
      assert.equal(await row(reviewer,'INV-7803').count(), 0)
      assert.equal((await read(reviewer)).find(item => item.id === newHandoff).deadline, movedDue)
      record('While correction is pending the old deadline and download are withdrawn. Approval replaces the row and installs the corrected deadline and balance.', true)
    },
    async checkClosed(accountant, number) {
      await open(accountant)
      assert.equal(await row(accountant,number).count(),0)
      assert.ok((await read(accountant)).every(item => item.reference !== 'PO-9418'))
      assert.equal((await read(accountant)).length,2)
      record('The fully paid installment exits the board while both other POs stay visible.', true)
    },
    async checkReopened(accountant, number, returnMail) {
      await open(accountant)
      await row(accountant,number).getByText('Công nợ mở lại', { exact: true }).waitFor()
      await row(accountant,number).getByText('104.000 ₫', { exact: true }).waitFor()
      const reopened = (await read(accountant)).filter(item => item.invoice === number)
      assert.equal(reopened.length, 1)
      assert.equal(reopened[0].returnEmailId, returnMail)
      await accountant.reload()
      await row(accountant,number).getByText('104.000 ₫', { exact: true }).waitFor()
      await accountant.setViewportSize({ width: 390, height: 844 })
      await capture('13-cong-no-mo-lai-mobile', accountant)
      await row(accountant,number).getByRole('link', { name:'Email chứng từ hoàn' }).click()
      await accountant.waitForURL('**/inbox?email=' + returnMail)
      await accountant.getByRole('link', { name:'Đối soát thanh toán · hoan-khoan-chuyen.csv' }).waitFor()
      await open(page)
      await row(page,number).getByText('104.000 ₫', { exact: true }).waitFor()
      assert.equal(await row(page,number).getByRole('link', { name:'Email chứng từ hoàn' }).count(), 0)
      await row(page,number).getByRole('link', { name: 'Mở hồ sơ', exact: true }).click()
      await page.getByText('Công nợ mở lại', { exact: true }).waitFor()
      record('A replayed and resent return restores exactly one 104000 VND row after reload. Only the accountant can open the return message.', true)
    },
  }
}
