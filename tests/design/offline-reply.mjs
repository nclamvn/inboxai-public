import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const endpoint = '/api/replies'
const shell = '/offline-workspace/index.html'
const subject = '[PO-8195] Lịch giao hàng'
const sender = 'nha-cung-cap@example.test'
const sourceBody = 'Nhà cung cấp xác nhận giao 180 bộ gá vào ngày 17/11.'
const decoyBody = 'Hộp thư kế toán chỉ có bản đối chiếu công nợ.'
const baseBody = 'Tôi đã nhận lịch giao hàng.'
const deviceBody = 'Bên mua xác nhận nhận 180 bộ gá. Vui lòng gửi mã vận đơn.'
const finalBody = deviceBody + ' Kho mở cửa đến 16 giờ.'
const serverBody = 'Bản chỉnh sửa từ thiết bị thứ hai. Kho mở cửa tới 17 giờ.'
const passphrase = 'Synthetic-offline-passphrase-8195'
const json = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
const require = createRequire(import.meta.url)

export async function rehearseOfflineReply({
  app, base, email, password, userId, admin, appFetch, sql, googleProvider, previousEmail, record, output,
}) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address, body) {
    const id = randomUUID()
    const provider = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: provider.tokens.access_token, refreshToken: provider.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: provider.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    provider.deliver([{
      id: 'offline-8195', threadId: 'offline-thread-8195', messageId: '<offline-8195@example.test>',
      subject, from: sender, at: new Date(Date.now() - 1_200_000).toISOString(), body,
    }])
    return { id, address, ...provider }
  }
  const buying = await mailbox('mua-hang@example.test', sourceBody)
  const finance = await mailbox('ke-toan@example.test', decoyBody)
  async function request(path, init) {
    const response = await appFetch(path, init)
    const data = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  await request('/api/source-accounts/sync', json({ refresh: true }))
  const id = account => sql(`SELECT id FROM public.emails WHERE user_id='${userId}'
    AND source_account_id='${account.id}' AND original_uid='offline-8195'`).trim()
  const source = id(buying), other = id(finance)
  assert.match(source, /^[0-9a-f-]{36}$/)
  assert.match(other, /^[0-9a-f-]{36}$/)
  assert.notEqual(source, other)
  const reply = () => request(endpoint + '?source=' + source)
  const initial = await reply()
  const saved = await request(endpoint, json({
    action: 'save', source, id: null, revision: null, fingerprint: initial.fingerprint,
    to: initial.to, cc: '', body: baseBody,
  }))
  assert.equal(saved.body, baseBody)
  record('two Gmail fixtures have the same provider ID and subject in different accounts; the exact source has a server revision', true)

  const profile = await mkdtemp(join(process.cwd(), '.codex-offline-browser-'))
  let context, page, hideSendResponse = false
  const captures = [], pageErrors = []
  async function open(offline = false) {
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.INBOXAI_CHROMIUM_PATH ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' }),
      locale: 'vi-VN', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'allow',
    })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') })
    await context.route('**/*', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (hideSendResponse && url.pathname === endpoint && req.method() === 'POST' && req.postDataJSON()?.action === 'send') {
        hideSendResponse = false
        const result = await route.fetch()
        assert.ok(result.ok(), await result.text())
        return route.abort()
      }
      return route.continue()
    })
    await context.setOffline(offline)
    page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => {
      pageErrors.push({ path: new URL(page.url()).pathname, message: error.message })
    })
  }

  const button = (label, target = page) => target.getByRole('button', { name: label, exact: true })
  const body = () => page.getByRole('textbox', { name: 'Nội dung thư', exact: true })
  const status = label => page.getByRole('status').and(page.getByText(label, { exact: true }))
  async function login(address) {
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(address)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
  }
  async function unlock(target, value = passphrase) {
    await target.getByLabel('Mật khẩu ngoại tuyến', { exact: true }).fill(value)
    await button('Mở khóa', target).click()
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
    captures.push(name)
  }
  try {
    await open()
    await login(email)
    await page.goto(app + '/inbox?email=' + source)
    await page.getByRole('heading', { name: subject, exact: true }).waitFor()
    await button('Lưu đọc ngoại tuyến').click()
    const setup = page.getByRole('dialog', { name: 'Bật lưu ngoại tuyến' })
    await setup.getByLabel('Mật khẩu ngoại tuyến', { exact: true }).fill(passphrase)
    await setup.getByRole('button', { name: 'Bật lưu trên thiết bị' }).click()
    await status('Đã lưu đọc ngoại tuyến').waitFor()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await button('Trả lời').click()
    await page.getByRole('heading', { name: 'Trả lời hội thoại', exact: true }).waitFor()
    await body().waitFor()
    assert.equal(await body().inputValue(), baseBody)
    await context.setOffline(true)
    await body().fill(deviceBody)
    await status('Đã lưu trên thiết bị').waitFor()
    assert.ok(await button('Xem trước thư gửi').isDisabled())
    assert.equal((await reply()).draft.body, baseBody)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('online pin explicitly enrolls the device; typing offline commits a local draft and keeps the server and Gmail unchanged', true)

    await context.close()
    await open(true)
    await page.goto(app + '/compose?reply=' + source)
    await page.waitForURL(url => url.pathname === shell && url.searchParams.get('reply') === source)
    await page.getByRole('heading', { name: 'Đọc thư và soạn ngoại tuyến' }).waitFor()
    await unlock(page, 'Invalid-offline-passphrase')
    await page.getByRole('alert').getByText('Mật khẩu ngoại tuyến chưa đúng.').waitFor()
    assert.equal(await page.getByText(sourceBody, { exact: true }).count(), 0)
    await unlock(page)
    await page.getByText(sourceBody, { exact: true }).waitFor()
    assert.equal(await page.getByText(decoyBody, { exact: true }).count(), 0)
    assert.equal(await body().inputValue(), deviceBody)
    await page.getByText('Gửi từ ' + buying.address, { exact: true }).waitFor()
    await body().fill(finalBody)
    await status('Đã lưu trên thiết bị').waitFor()
    assert.equal(await page.getByRole('link', { name: 'Đối chiếu bản nháp trên máy chủ' }).isVisible(), false)
    assert.deepEqual(await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('inboxai-offline-v1')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const database = open.result
        const read = database.transaction('entries').objectStore('entries').getAll()
        read.onerror = () => { database.close(); reject(read.error) }
        read.onsuccess = () => {
          const data = read.result.map(entry => ({ fields: Object.keys(entry).sort(), binary: entry.ciphertext instanceof ArrayBuffer }))
          database.close()
          resolve(data)
        }
      }
    })), [
      { fields: ['ciphertext', 'iv', 'key'], binary: true },
      { fields: ['ciphertext', 'iv', 'key'], binary: true },
    ])
    const cached = await page.evaluate(async () => {
      const keys = (await caches.keys()).filter(key => key.startsWith('inboxai-offline-shell-'))
      const entries = await Promise.all(keys.map(async key => (await caches.open(key)).keys()))
      return entries.flat().map(entry => new URL(entry.url).pathname)
    })
    assert.deepEqual(cached.sort(), [
      'compose-editor.mjs', 'compose.mjs', 'fonts/inter-latin-ext-wght-normal.woff2',
      'fonts/inter-latin-wght-normal.woff2', 'fonts/inter-vietnamese-wght-normal.woff2',
      'index.html', 'storage.mjs', 'workspace.css', 'workspace.mjs',
    ].map(path => '/offline-workspace/' + path).sort())
    await capture('01-offline-after-restart')
    record('cold Chrome restart uses the cached shell while offline; wrong password stays locked, correct password restores only the selected mail and draft', true)

    const newer = await request(endpoint, json({
      action: 'save', source, id: saved.id, revision: saved.revision,
      fingerprint: initial.fingerprint, to: initial.to, cc: '', body: serverBody,
    }))
    assert.ok(newer.revision > saved.revision)
    await context.setOffline(false)
    await page.getByRole('link', { name: 'Đối chiếu bản nháp trên máy chủ' }).click()
    await page.waitForURL(url => url.pathname === '/compose')
    await button('Mở bản nháp trên thiết bị').click()
    await unlock(page)
    const conflict = page.getByRole('region', { name: 'Bản nháp đã thay đổi ở hai nơi' })
    await conflict.getByText(finalBody, { exact: true }).waitFor()
    await conflict.getByText(serverBody, { exact: true }).waitFor()
    assert.ok(await button('Xem trước thư gửi').isDisabled())
    await capture('02-conflict')
    await button('Giữ bản trên thiết bị').click()
    await conflict.waitFor({ state: 'hidden' })
    assert.equal(await body().inputValue(), finalBody)
    assert.equal((await reply()).draft.body, serverBody)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('reconnect presents both divergent versions and explicit choice; choosing the device version leaves the server untouched until save', true)

    await button('Xem trước thư gửi').click()
    const preview = page.getByRole('dialog', { name: 'Xem trước thư gửi' })
    await preview.getByText(finalBody, { exact: true }).waitFor()
    await preview.getByText(buying.address, { exact: true }).waitFor()
    assert.equal(googleProvider.calls.sendAttempts, 0)
    buying.box.dropSendAcknowledgement = true
    hideSendResponse = true
    await preview.getByRole('button', { name: 'Xác nhận gửi', exact: true }).click()
    await button('Kiểm tra trạng thái gửi').waitFor()
    await button('Kiểm tra trạng thái gửi').click()
    await status('Đã gửi').waitFor()
    const sent = (await reply()).draft
    assert.equal(sent.state, 'accepted')
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.equal(googleProvider.calls.sent.length, 1)
    assert.equal(googleProvider.calls.sent[0].from, buying.address)
    assert.equal(googleProvider.calls.sent[0].body, finalBody)
    assert.equal(hideSendResponse, false)
    assert.equal(buying.box.dropSendAcknowledgement, false)
    assert.ok(sent.sentId)
    const replay = await request(endpoint, json({ action: 'send', id: sent.id }))
    assert.equal(replay.state, 'accepted')
    assert.equal(googleProvider.calls.sendAttempts, 1)
    await capture('03-sent-once')
    record('approval sends from the correct Gmail account exactly once after provider and browser response loss, verification and retry', true)

    const offlineTab = await context.newPage()
    await offlineTab.goto(app + shell + '?email=' + source)
    await unlock(offlineTab)
    await offlineTab.getByText(sourceBody, { exact: true }).waitFor()
    await button('Tài khoản của bạn').click()
    await button('Đăng xuất').click()
    await page.waitForURL('**/login')
    await offlineTab.getByText('Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.', { exact: true }).waitFor()
    assert.equal(await offlineTab.getByText(sourceBody, { exact: true }).count(), 0)
    const admission = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admission.error, null)
    await login(previousEmail)
    await page.goto(app + shell + '?reply=' + source)
    await page.getByText('Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.', { exact: true }).waitFor()
    assert.equal(await page.getByText(finalBody, { exact: true }).count(), 0)
    assert.equal(await page.getByLabel('Mật khẩu ngoại tuyến').isVisible(), false)
    assert.equal((await page.request.get(app + endpoint + '?source=' + source)).status(), 404)
    assert.deepEqual(pageErrors, [])
    record('sign-out clears the encrypted store and immediately locks the open offline tab; the next InboxAI user cannot read the old reply', true)

    await writeFile(output + '/workflow.json', JSON.stringify({
      accounts: 2, coldRestart: true, conflict: 'device', browserAcknowledgementDropped: !hideSendResponse,
      providerDispatches: googleProvider.calls.sendAttempts, providerAccepted: googleProvider.calls.sent.length,
      chrome: await page.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]), captures,
    }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await context?.close()
    await rm(profile, { recursive: true, force: true })
  }
}
