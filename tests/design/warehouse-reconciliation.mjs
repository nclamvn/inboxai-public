import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const ledger = '/api/commitments'
const purchaseOrder = 'PO-9418'
const supplier = 'quynh-nha-cung-cap@example.test'
const warehouse = 'khoi-kho@example.test'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const command = (value, key = randomUUID()) => ({
  method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
})
const at = daysAgo => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

export async function rehearseWarehouseReconciliation({ app, base, email, previousEmail, password, userId, admin, appFetch, googleProvider, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const accounts = {}
  for (const department of ['mua-hang', 'ky-thuat']) {
    const address = department + '@warehouse.example.test'
    const google = googleProvider.registerMailbox(address, true)
    const id = randomUUID()
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: google.tokens.access_token, refreshToken: google.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: google.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    accounts[department] = { ...google, id, address }
  }

  async function request(path, init, status = 200) {
    const response = await appFetch(path, init)
    const result = await response.json()
    assert.equal(response.status, status, path + ' ' + JSON.stringify(result))
    return result
  }

  async function deliver(uid, department, from, age, subject, body) {
    const account = accounts[department]
    account.deliver([{ id: uid, threadId: department + '-' + purchaseOrder, messageId: '<' + uid + '@example.test>',
      from, at: at(age), subject: '[' + purchaseOrder + '] ' + subject, body }])
    await request('/api/source-accounts/sync', command({ refresh: true }))
    const result = await admin.from('emails').select('id').eq('user_id', userId)
      .eq('source_account_id', account.id).eq('original_uid', uid).single()
    assert.equal(result.error, null)
    return result.data.id
  }

  const browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
  const runtimeErrors = []
  let page
  async function login(address) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', viewport: { width: 1380, height: 920 } })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    const target = await context.newPage()
    target.setDefaultTimeout(15_000)
    target.on('pageerror', error => runtimeErrors.push(error.message))
    await target.goto(app + '/login')
    await target.getByLabel('Email', { exact: true }).fill(address)
    await target.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button(target, 'Đăng nhập').click()
    await target.waitForURL('**/inbox')
    return target
  }

  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
  }

  async function review(source, quote, expectRetry = false) {
    await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + source)
    await page.getByText(quote, { exact: true }).waitFor()
    await button(page, 'Xem và xác nhận').click()
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    await dialog.getByText(quote, { exact: true }).waitFor()
    await button(dialog, 'Xác nhận và ghi vào sổ').click()
    if (expectRetry) await button(dialog, 'Thử lưu lại').click()
    await dialog.waitFor({ state: 'hidden' })
  }

  try {
    page = await login(email)
    const due = at(-5).slice(0, 10)
    const initial = 'Bên em xác nhận giao 200 bộ khớp nối chậm nhất ngày ' + due + '.'
    const order = await deliver('warehouse-order', 'mua-hang', supplier, 9, 'Xác nhận đơn khớp nối', initial)
    await review(order, initial)
    const list = await request(ledger)
    const id = list.items.find(item => item.state.title === 'giao 200 bộ khớp nối').id
    const detail = () => request(ledger + '/' + id)
    const receiving = ledger + '/' + id + '/receiving'
    const detailUrl = app + '/commitments?group=waiting&id=' + id
    await page.goto(detailUrl)
    await button(page, 'Thiết lập nguồn nhập kho').click()
    const setup = page.getByRole('dialog', { name: 'Thiết lập nguồn nhập kho' })
    await setup.getByLabel('Hộp thư nhận phiếu nhập').selectOption(accounts['ky-thuat'].id)
    await setup.getByLabel('Email nhân viên kho').fill(warehouse)
    await button(setup, 'Bật đối soát').click()
    await setup.waitFor({ state: 'hidden' })
    assert.equal((await detail()).version, 2)

    const shipped = 'Bên tôi đã giao đủ 200/200 bộ.'
    const sent = await deliver('warehouse-shipped', 'mua-hang', supplier, 5, 'Điều vận xác nhận đã giao', shipped)
    await review(sent, shipped)
    const sourceReceipt = 'Biên nhận PN-4832 – thực nhập 180 bộ.'
    const first = await deliver('warehouse-first', 'ky-thuat', warehouse, 3, 'Phiếu kiểm đếm đợt chính', sourceReceipt)
    const receiveAttempts = []
    const closeAttempts = []
    await page.route('**/receiving', async route => {
      const value = route.request().postDataJSON()
      const attempts = value.operation === 'close' ? closeAttempts
        : value.operation === 'receive' && value.emailId === first ? receiveAttempts : null
      if (!attempts) return route.continue()
      const response = await route.fetch({ maxRetries: 0 })
      attempts.push({ key: route.request().headers()['idempotency-key'], data: await response.json() })
      if (attempts.length === 1 && response.ok()) return route.abort()
      return route.fulfill({ response })
    })
    assert.deepEqual([(await detail()).state.status, (await detail()).state.receiving.received], ['open', 0])
    await request(receiving, command({ operation: 'close', expectedVersion: 3 }), 409)
    await review(first, sourceReceipt, true)
    assert.equal(receiveAttempts.length, 2)
    assert.equal(receiveAttempts[0].key, receiveAttempts[1].key)
    assert.deepEqual(receiveAttempts.map(attempt => [attempt.data.version, attempt.data.replayed]), [[4,false],[4,true]])
    let current = await detail()
    assert.deepEqual([current.version, current.state.receiving.received, current.state.status], [4,180,'open'])
    assert.deepEqual([current.history[0].sources[0].emailId,current.history[0].sources[0].quote], [first,sourceReceipt])
    record('one approved 180-unit warehouse receipt survives a lost Chrome acknowledgement without a duplicate revision', true)

    const repeated = await deliver('warehouse-copy', 'ky-thuat', warehouse, 1, 'Gửi lại phiếu kiểm đếm', sourceReceipt)
    const wrongUnit = await deliver('warehouse-unit', 'ky-thuat', warehouse, 2, 'Đơn vị chưa đối chiếu', 'Phiếu nhập PN-4835: kho nhận 20 kiện.')
    const spoof = 'Phiếu nhập PN-4836: kho nhận 20 bộ.'
    const wrongSender = await deliver('warehouse-spoof', 'ky-thuat', 'nguoi-gui-khac@example.test', 2, 'Bản sao từ điều vận', spoof)
    for (const [source, expected] of [[repeated,'duplicate_receipt'], [wrongUnit,'quantity'], [wrongSender,'warehouse']]) {
      const proposals = await request(ledger + '/catchup?source=' + source)
      assert.equal(proposals.proposals[0].blocked,expected)
      assert.equal(proposals.proposals[0].review,null)
    }
    await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + wrongUnit)
    await page.getByText('Số lượng hoặc đơn vị trong thư khác cam kết. Cần kiểm tra trước khi cập nhật.', { exact: true }).waitFor()
    await button(page, 'Đã kiểm tra, giữ nguyên sổ').click()
    await page.getByRole('status').filter({ hasText: 'Đã kiểm tra và giữ nguyên sổ' }).waitFor()
    await page.goto(app + '/inbox')
    const attention = page.getByRole('region', { name: 'Cam kết cần chú ý' })
    const task = attention.getByRole('listitem').filter({ hasText: 'giao 200 bộ khớp nối' })
    await task.getByText('Chênh lệch nhập kho', { exact: true }).waitFor()
    for (const label of ['200 bộ','180 bộ','20 bộ']) await task.getByText(label,{ exact: true }).waitFor()
    await capture('01-nhan-thieu')
    assert.equal(googleProvider.calls.sendAttempts,0)
    await button(task,'Xem trước lời nhắc').click()
    const reminder = page.getByRole('dialog', { name: 'Xem trước lời nhắc' })
    await reminder.getByText(supplier,{ exact: true }).waitFor()
    await reminder.getByText(/còn thiếu 20 bộ/).waitFor()
    const reminderPath = ledger + '/' + id + '/reminder'
    const preview = await request(reminderPath)
    await button(reminder,'Xác nhận và gửi lời nhắc').click()
    await reminder.getByText('Đã gửi lời nhắc',{ exact: true }).waitFor()
    assert.equal((await request(reminderPath, command({ accountId: preview.accountId, version: preview.version, proof: preview.proof }))).state,'accepted')
    assert.equal(googleProvider.calls.sendAttempts,1)
    assert.deepEqual([googleProvider.calls.sent[0].from, googleProvider.calls.sent[0].to], [accounts['mua-hang'].address,[supplier]])
    record('duplicate receipt, wrong unit and wrong sender are blocked; Action Inbox shows the shortage and sends one approved reminder',true)

    await page.goto(app + '/search')
    await page.getByLabel('Nội dung tìm kiếm',{ exact: true }).fill('Kho thực nhận và còn thiếu bao nhiêu cho ' + purchaseOrder + '?')
    await button(page,'Hỏi email').click()
    const answer = page.getByRole('region',{ name: 'Đối soát nhập kho', exact: true })
    await answer.getByText(sourceReceipt,{ exact: true }).waitFor()
    await answer.getByText(shipped,{ exact: true }).waitFor()
    await answer.getByText('20 bộ',{ exact: true }).waitFor()
    const restricted = await request('/api/ask-inbox/answer',command({
      query: 'Đối soát nhập kho ' + purchaseOrder, accountIds: [accounts['mua-hang'].id],
    }))
    assert.deepEqual([restricted.status,restricted.warehouse],['insufficient',null])
    await capture('02-ask-doi-soat')
    record('Ask Inbox cites both accounts, reports the shortage and abstains when a filter hides warehouse evidence',true)

    const lateQuote = 'Phiếu nhập PN-4810: kho đã nhận 20 bộ.'
    const late = await deliver('warehouse-late', 'ky-thuat', warehouse, 6, 'Thư đồng bộ muộn từ kho', lateQuote)
    assert.equal((await detail()).state.receiving.received, 180)
    await review(late,lateQuote)
    current = await detail()
    assert.deepEqual([current.version,current.state.receiving.received,current.state.status],[5,200,'open'])
    assert.equal(current.history[0].sources[0].emailId,late)
    await page.goto(app + '/inbox')
    const ready = page.getByRole('region', { name: 'Cam kết cần chú ý' }).getByRole('listitem').filter({ hasText: 'giao 200 bộ khớp nối' })
    await ready.getByText('Đủ hàng · Chờ khép', { exact: true }).waitFor()
    await ready.getByRole('link', { name: 'Xem và khép cam kết' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await button(page,'Xem trước và khép cam kết').click()
    const close = page.getByRole('dialog',{ name: 'Xác nhận khép đối soát' })
    for (const quote of [shipped, sourceReceipt, lateQuote]) await close.getByText(quote,{ exact: true }).waitFor()
    await capture('03-preview-khep-mobile')
    await button(close,'Xác nhận khép cam kết').click()
    await button(close, 'Thử lưu lại').click()
    await close.waitFor({ state: 'hidden' })
    assert.equal(closeAttempts.length, 2)
    assert.equal(closeAttempts[0].key, closeAttempts[1].key)
    assert.deepEqual(closeAttempts.map(attempt => [attempt.data.version, attempt.data.replayed]), [[6,false],[6,true]])
    current = await detail()
    assert.deepEqual([current.version,current.state.status,current.state.receiving.received],[6,'completed',200])
    assert.deepEqual(current.history[0].sources.map(source => source.emailId),[sent,late])
    await page.goto(app + '/commitments?group=closed&id=' + id)
    await page.getByRole('region', { name: 'giao 200 bộ khớp nối', exact: true }).getByText('Hoàn tất', { exact: true }).first().waitFor()
    await capture('04-da-khep')
    record('an older, unique receipt is counted once, both totals must agree and Chrome closes with evidence and replays the lost close acknowledgement',true)

    assert.equal((await fetch(app + receiving,command({ operation:'close',expectedVersion:6 }))).status,401)
    assert.equal((await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })).error,null)
    const stranger = await login(previousEmail)
    assert.equal((await stranger.request.post(app + receiving,{ data:{ operation:'close',expectedVersion:6 },
      headers:{ 'Idempotency-Key':randomUUID() } })).status(),404)
    assert.deepEqual(runtimeErrors,[])
    record('anonymous and other-tenant approvals are rejected and Chrome reports no runtime errors',true)
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
