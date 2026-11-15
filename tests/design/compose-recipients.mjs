import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const require = createRequire(import.meta.url)
const search = '/api/compose-recipients'
const drafts = '/api/compose-drafts'
const name = 'Đặng Minh Anh'
const chosen = 'minhanh.vattu@example.test'
const sameName = 'minhanh.kiemdinh@example.test'
const financeAddress = 'minhanh.congno@example.test'
const ccAddress = 'huy.do@example.test'
const subject = 'Duyệt hồ sơ nhập kho B07'
const body = 'Nhờ anh/chị kiểm tra hồ sơ nhập kho B07 trước khi chốt ca.'
const json = { 'Content-Type': 'application/json' }

export async function rehearseComposeRecipients({ app, base, email, password, userId, admin, appFetch,
  sql, googleProvider, previousEmail, restartNext, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID(), provider = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: provider.tokens.access_token, refreshToken: provider.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: provider.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { ...provider, address, id }
  }
  const buying = await mailbox('mua-hang@example.test')
  const finance = await mailbox('ke-toan@example.test')
  const mail = (id, label, from, fields = {}) => ({
    id, subject: label, from, body: 'Hồ sơ giả lập để đối chiếu người nhận.',
    at: new Date(Date.now() - 300_000).toISOString(), threadId: id + '-thread', messageId: '<' + id + '@example.test>', ...fields,
  })
  const source = mail('b07-nguon', 'Hồ sơ nguồn B07', `"${name}" <${chosen}>`)
  buying.deliver([source,
    mail('b07-out-1', 'Xác nhận vật tư', buying.address, { sent: true, to: `"${name}" <${chosen}>` }),
    mail('b07-out-2', 'Xác nhận kiểm định', buying.address, { sent: true, to: `"${name}" <${sameName}>` }),
    mail('b07-in-only', 'Người chỉ gửi đến', `"${name}" <minhanh.inbound@example.test>`),
  ])
  finance.deliver([
    mail('finance-out', 'Đối chiếu công nợ', finance.address, { sent: true, to: `"${name}" <${financeAddress}>`, cc: `"Đỗ Quốc Huy" <${ccAddress}>` }),
    mail('finance-in', 'Phản hồi kế toán', `"${name}" <${financeAddress}>`),
  ])
  async function request(path, init) {
    const response = await appFetch(path, init)
    const data = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  const post = (path, data) => request(path, { method: 'POST', headers: json, body: JSON.stringify(data) })
  const lookup = (account, q) => search + '?' + new URLSearchParams({ account: account.id, q })
  await post('/api/source-accounts/sync', { refresh: true })
  const sourceId = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${buying.id}' AND original_uid='${source.id}'`).trim()
  assert.match(sourceId, /^[a-f0-9-]{36}$/)
  const [accented, unaccented] = await Promise.all([request(lookup(buying, name)), request(lookup(buying, 'dang minh anh'))])
  assert.deepEqual(accented.items, unaccented.items)
  assert.deepEqual(new Set(unaccented.items.map(item => item.address)), new Set([chosen, sameName]))
  assert.deepEqual((await request(lookup(finance, 'dang minh anh'))).items, [{ name, address: financeAddress }])
  record('real loopback sync builds distinct accent-insensitive suggestions per sending account from Sent', true)

  let browser, context, page, storageState, chrome, dropResponse = false, lostResponse
  const captures = [], errors = []
  async function open(viewport = { width: 1440, height: 900 }) {
    browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
    chrome = browser.version()
    context = await browser.newContext({ locale: 'vi-VN', viewport, storageState, serviceWorkers: 'block', reducedMotion: 'reduce',
      hasTouch: viewport.width < 500, isMobile: viewport.width < 500, deviceScaleFactor: 1 })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') })
    await context.route('**/*', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (dropResponse && url.pathname === drafts && req.method() === 'POST' && req.postDataJSON().action === 'send') {
        dropResponse = false
        const response = await route.fetch({ maxRetries: 0 })
        lostResponse = await response.json()
        await context.setOffline(true)
        return route.abort()
      }
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => errors.push({ path: new URL(page.url()).pathname, error: error.message }))
  }
  const button = (label, scope = page) => scope.getByRole('button', { name: label, exact: true })
  const field = label => page.getByLabel(label, { exact: true })
  const options = () => page.getByRole('listbox', { name: 'Gợi ý người nhận', exact: true })
  const option = address => options().getByRole('option').filter({ hasText: address })
  const sender = () => field('Từ')
  const to = () => field('Đến')
  async function login(address, scope = page) {
    await scope.goto(app + '/login')
    await scope.getByLabel('Email', { exact: true }).fill(address)
    await scope.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập', scope).click()
    await scope.waitForURL('**/inbox')
  }
  async function capture(label) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + label + '.png', animations: 'disabled' })
    captures.push(label)
  }

  try {
    await open()
    await login(email)
    await page.goto(app + '/compose')
    await sender().selectOption(buying.id)
    await to().fill('dang minh anh')
    await option(chosen).waitFor()
    await option(sameName).waitFor()
    assert.equal(await options().getByText(name, { exact: true }).count(), 2)
    assert.equal(await option(financeAddress).count(), 0)
    await page.getByText('Đã liên hệ từ ' + buying.address, { exact: true }).waitFor()
    await capture('01-nguoi-trung-ten')
    const addresses = await options().getByRole('option').allTextContents()
    const index = addresses.findIndex(text => text.includes(chosen))
    assert.ok(index >= 0)
    for (let i = 0; i <= index; i++) await to().press('ArrowDown')
    await to().press('Enter')
    assert.equal(await to().inputValue(), chosen)
    assert.equal(await options().count(), 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('keyboard selection distinguishes two people with the same name without submitting the message', true)

    await sender().selectOption(finance.id)
    assert.equal(await to().inputValue(), chosen)
    await page.getByText('Đã đổi tài khoản gửi. Kiểm tra lại địa chỉ trong Đến và Cc trước khi duyệt.', { exact: true }).waitFor()
    await button('Cc').click()
    await field('Cc').fill('dang minh anh')
    await option(financeAddress).waitFor()
    assert.equal(await options().getByRole('option').count(), 1)
    await page.getByText('Đã liên hệ từ ' + finance.address, { exact: true }).waitFor()
    await field('Cc').fill('do quoc huy')
    await option(ccAddress).click()
    assert.equal(await field('Cc').inputValue(), ccAddress)
    await field('Tiêu đề').fill(subject)
    await field('Nội dung thư').fill(body)
    await button('Lưu bản nháp').click()
    await page.waitForURL('**/compose?draft=*')
    const draftUrl = page.url()
    const id = new URL(draftUrl).searchParams.get('draft')
    const saved = await request(drafts + '?id=' + id)
    assert.deepEqual([saved.accountId, saved.fields.to, saved.fields.cc], [finance.id, chosen, ccAddress])
    storageState = await context.storageState()
    await browser.close()
    await restartNext()
    await open({ width: 390, height: 844 })
    await page.goto(draftUrl)
    await page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()
    await sender().locator('option').filter({ hasText: finance.address }).waitFor({ state: 'attached' })
    assert.deepEqual([await sender().inputValue(), await to().inputValue(), await field('Cc').inputValue()],
      [finance.id, chosen, ccAddress])
    await capture('02-ban-nhap-khoi-phuc')
    await field('Cc').fill('do quoc huy')
    await option(ccAddress).tap()
    assert.equal(await field('Cc').inputValue(), ccAddress)
    record('switching accounts preserves To, and mobile Chrome restores all three fields and accepts touch selection', true)

    await button('Xem trước thư gửi').click()
    const preview = page.getByRole('dialog', { name: 'Xem trước thư gửi' })
    for (const text of [finance.address, chosen, ccAddress, body]) await preview.getByText(text, { exact: true }).waitFor()
    const missing = await appFetch('/api/emails/send?check=1', {
      method: 'POST', headers: { ...json, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ sourceAccountId: finance.id, to: [chosen], cc: [ccAddress], subject, text: body }),
    })
    assert.equal(missing.status, 409)
    assert.equal((await missing.json()).code, 'send_operation_missing')
    assert.equal(googleProvider.calls.sendAttempts, 0)
    finance.box.dropSendAcknowledgement = true
    dropResponse = true
    await button('Xác nhận gửi', preview).click()
    await page.getByText('Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.', { exact: true }).waitFor()
    assert.equal(lostResponse.state, 'unknown')
    const [sent] = googleProvider.calls.sent
    assert.deepEqual({ from: sent.from, to: sent.to, cc: sent.cc, subject: sent.subject, body: sent.body },
      { from: finance.address, to: [chosen], cc: [ccAddress], subject, body })
    await browser.close()
    await open()
    await page.goto(draftUrl)
    await page.getByText('Đang chờ xác minh', { exact: true }).waitFor()
    await button('Kiểm tra trạng thái gửi').click()
    await page.waitForURL('**/sent')
    const replays = await Promise.all([post(drafts, { action: 'send', id }), post(drafts, { action: 'check', id })])
    assert.ok(replays.every(receipt => receipt.state === 'accepted' && receipt.operationId === lostResponse.operationId))
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.equal(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND source_account_id='${finance.id}'
      AND message_id='${sent.messageId}' AND direction='outbound'`).trim(), '1')
    record('approved identity and recipients match the MIME; losing both acknowledgements and replay leaves one Gmail send and one Sent row', true)

    await page.goto(app + '/compose?forward=' + sourceId)
    await page.getByRole('heading', { name: 'Chuyển tiếp thư' }).waitFor()
    await page.waitForFunction(() => !document.querySelector('#compose-to')?.matches(':disabled'))
    await to().fill('dang minh anh')
    await option(sameName).waitFor()
    assert.equal(await option(financeAddress).count(), 0)
    await page.goto(app + '/compose?reply=' + sourceId)
    await page.getByText('Gửi từ ' + buying.address, { exact: true }).waitFor()
    assert.equal(await field('Người nhận').inputValue(), chosen)
    await field('Cc').fill('dang minh anh')
    await option(sameName).waitFor()
    await capture('03-goi-y-trong-tra-loi')
    record('reply and forward use the source Gmail account and retain the established reply recipient', true)

    const admission = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admission.error, null)
    const switcher = await context.newPage()
    await switcher.goto(app + '/settings')
    await button('Tài khoản của bạn', switcher).click()
    await button('Đăng xuất', switcher).click()
    await switcher.waitForURL('**/login')
    await options().waitFor({ state: 'hidden' })
    await login(previousEmail)
    await page.goto(app + '/compose')
    await to().fill('dang minh anh')
    assert.equal(await options().count(), 0)
    for (const account of [buying, finance]) {
      assert.equal((await page.request.get(app + lookup(account, 'dang minh anh'))).status(), 404)
    }
    assert.equal((await page.request.get(app + drafts + '?id=' + id)).status(), 404)
    assert.equal((await fetch(app + lookup(buying, 'dang minh anh'))).status, 401)
    assert.deepEqual(errors, [])
    record('signing out clears suggestions in the open tab; the second user and anonymous callers cannot read the history or draft', true)
    await writeFile(output + '/workflow.json', JSON.stringify({ chrome, accounts: 2, sameNameCandidates: 2,
      chromeRestart: true, providerDispatches: googleProvider.calls.sendAttempts, lostProviderAndBrowserAcknowledgements: true,
      captures }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser?.close()
  }
}
