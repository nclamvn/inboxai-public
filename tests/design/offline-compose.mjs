import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const require = createRequire(import.meta.url)
const shell = '/offline-workspace/index.html'
const endpoint = '/api/compose-drafts'
const passphrase = 'Synthetic-offline-compose-6204'
const subject = 'Biên bản chạy thử MX-6204'
const sourceTitle = 'Nguồn bàn giao MX-6204'
const localBody = 'Chốt biên bản lúc 14 giờ, sau khi nhận số đo.'
const serverBody = 'Dời lịch chốt biên bản đến 17 giờ.'
const finalBody = 'Chốt biên bản lúc 14 giờ, kèm kết quả đo ngoại tuyến.'
const to = 'quan-doc@example.test'
const cc = 'do-luong@example.test'
const name = 'bien-ban.bin'
const onlineBytes = Buffer.from('SYNTHETIC-ORIGINAL-6204')
const offlineBytes = Buffer.from('SYNTHETIC-OFFLINE-6204!')
const composeBody = (page, label) => page.getByRole('textbox', { name: label, exact: true })
const label = (page, name) => page.getByLabel(name, { exact: true })
const button = (page, name) => page.getByRole('button', { name, exact: true })
const status = (page, text) => page.getByRole('status').filter({ hasText: new RegExp('^' + text + '$') }).waitFor()
const json = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
const upload = bytes => ({ name, mimeType: 'application/octet-stream', buffer: bytes })

async function seedLegacyDevice(page, owner) {
  await page.evaluate(async ({ owner, passphrase }) => {
    const name = 'inboxai-offline-v1'
    const encoder = new TextEncoder()
    const epoch = crypto.randomUUID()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
    async function encrypt(label, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const additionalData = encoder.encode(JSON.stringify([name, owner, epoch, label]))
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(JSON.stringify(value)))
      return { iv, ciphertext }
    }
    const verifier = await encrypt('verifier', name)
    const mail = await encrypt('mail:legacy', { subject: 'Thư đã lưu trước nâng cấp', sender: 'legacy@example.test',
      at: null, text: 'Nội dung giả lập được lưu ở phiên bản 1.', reply: null })
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('scope').put({ owner, epoch, salt, verifier }, 'active')
        db.createObjectStore('entries', { keyPath: 'key' }).put({ key: 'mail:legacy', ...mail })
      }
      request.onsuccess = () => { request.result.close(); resolve() }
    })
  }, { owner, passphrase })
}

export async function rehearseOfflineCompose({ app, base, email, password, userId, admin, appFetch, sql,
  googleProvider, previousEmail, record, output }) {
  const credentials = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const provider = googleProvider.registerMailbox(address, true)
    await credentials.write({ userId, accountId: id }, {
      kind: 'google', accessToken: provider.tokens.access_token, refreshToken: provider.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: provider.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { ...provider, address, id }
  }
  const operations = await mailbox('van-hanh@example.test')
  const quality = await mailbox('kiem-dinh@example.test')
  for (const account of [operations, quality]) account.deliver([{
    id: 'mx-6204', subject: sourceTitle, from: 'bao-tri@example.test', body: 'Hồ sơ giả lập của ' + account.address,
    at: new Date(Date.now() - 300_000).toISOString(), messageId: '<mx-6204@example.test>', threadId: 'mx-6204-thread',
  }])
  async function api(path, data) {
    const response = await appFetch(path, data && json(data))
    const result = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(result)}`)
    return result
  }
  await api('/api/source-accounts/sync', { refresh: true })
  const source = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${operations.id}'
    AND original_uid='mx-6204'`).trim()
  assert.match(source, /^[0-9a-f-]{36}$/)
  const profile = await mkdtemp(join(process.cwd(), '.codex-offline-browser-'))
  let context, page, otherBrowser, lost = null, replayed = 0
  const errors = [], captures = [], lossCodes = []
  const monitor = async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (![app, base].includes(url.origin)) return route.abort()
    const deviceUpload = url.pathname === '/api/compose-files' && request.method() === 'POST' && request.headers()['x-draft-file-id']
    const command = url.pathname === endpoint && request.method() === 'POST' ? request.postDataJSON() : null
    if (deviceUpload) replayed++
    if ((lost === 'file' && deviceUpload) || (lost === 'create' && command?.clientId)) {
      lost = null
      const response = await route.fetch({ maxRetries: 0 })
      lossCodes.push(response.status())
      return route.abort()
    }
    return route.continue()
  }
  async function open(offline = false, mobile = false) {
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', locale: 'vi-VN', serviceWorkers: 'allow',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 900 }, reducedMotion: 'reduce',
      proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') })
    await context.route('**/*', monitor)
    await context.setOffline(offline)
    page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(16_000)
    page.on('pageerror', error => errors.push(error.message))
  }
  async function login(target, address) {
    await target.goto(app + '/login')
    await label(target, 'Email').fill(address)
    await label(target, 'Mật khẩu').fill(password)
    await button(target, 'Đăng nhập').click()
    await target.waitForURL('**/inbox')
  }
  async function unlock(target, secret = passphrase) {
    await label(target, 'Mật khẩu ngoại tuyến').fill(secret)
    await button(target, 'Mở khóa').click()
  }
  async function enable() {
    await button(page, 'Bật lưu bản nháp trên thiết bị').click()
    await Promise.race([
      status(page, 'Đã lưu trên thiết bị'),
      page.getByRole('dialog', { name: 'Mở khóa ngoại tuyến' }).waitFor(),
    ])
    const dialog = page.getByRole('dialog', { name: 'Mở khóa ngoại tuyến' })
    if (await dialog.count()) await unlock(dialog)
    await status(page, 'Đã lưu trên thiết bị')
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
    captures.push(name)
  }
  async function reconcile() {
    await page.getByRole('link', { name: 'Đối chiếu bản nháp trên máy chủ', exact: true }).click()
    await page.getByRole('heading', { name: 'Đồng bộ bản nháp', exact: true }).waitFor()
    await button(page, 'Kiểm tra và đồng bộ').click()
    await unlock(page.getByRole('dialog', { name: 'Mở khóa ngoại tuyến' }))
  }

  try {
    await open()
    await page.goto(app + '/login')
    await seedLegacyDevice(page, userId)
    await login(page, email)
    await page.goto(app + '/compose')
    await label(page, 'Từ').selectOption(quality.id)
    await label(page, 'Đến').fill(to)
    await button(page, 'Cc').click()
    await label(page, 'Cc').fill(cc)
    await label(page, 'Tiêu đề').fill(subject)
    await label(page, 'Chọn tệp đính kèm').setInputFiles(upload(onlineBytes))
    await page.getByRole('list', { name: 'Tệp đính kèm' }).getByText(name, { exact: false }).waitFor()
    await status(page, 'Bản nháp đã lưu')
    const draftUrl = page.url()
    const id = new URL(draftUrl).searchParams.get('draft')
    const initial = await api(endpoint + '?id=' + id)
    await enable()
    await context.setOffline(true)
    await composeBody(page, 'Nội dung thư').fill(localBody)
    await label(page, 'Chọn tệp đính kèm').setInputFiles(upload(offlineBytes))
    await status(page, 'Đã lưu trên thiết bị')
    assert.equal(await page.getByRole('list', { name: 'Tệp đính kèm' }).getByRole('listitem').count(), 2)
    assert.equal((await api(endpoint + '?id=' + id)).revision, initial.revision)
    const raw = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('inboxai-offline-v1')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(['entries', 'compose-files'], 'readonly')
        const drafts = tx.objectStore('entries').getAll()
        const files = tx.objectStore('compose-files').getAll()
        tx.oncomplete = () => {
          db.close()
          resolve({ drafts: drafts.result.map(item => ({ ...item, ciphertext: Array.from(new Uint8Array(item.ciphertext)) })),
            files: files.result.map(item => ({ ...item, ciphertext: Array.from(new Uint8Array(item.ciphertext)) })) })
        }
      }
    }))
    assert.equal(raw.files.length, 2)
    for (const sample of [subject, name, to, localBody, onlineBytes.toString(), offlineBytes.toString()]) {
      assert.ok(!JSON.stringify(raw).includes(sample))
      for (const file of raw.files) assert.ok(!Buffer.from(file.ciphertext).includes(Buffer.from(sample)))
    }
    await context.close()
    record('offline body and two same-name files are encrypted with no draft revision or Gmail dispatch while disconnected', true)

    await open(true, true)
    await page.goto(draftUrl)
    await page.waitForURL(url => url.pathname === shell && url.searchParams.get('draft') === id)
    await unlock(page, 'Wrong-passphrase-6204')
    await page.getByRole('alert').getByText('Mật khẩu ngoại tuyến chưa đúng.').waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Bản nháp thư mới' }).count(), 0)
    await unlock(page)
    await page.getByRole('heading', { name: 'Bản nháp thư mới' }).waitFor()
    assert.equal(await label(page, 'Tài khoản gửi').inputValue(), quality.id)
    assert.equal(await composeBody(page, 'Người nhận').inputValue(), to)
    assert.equal(await composeBody(page, 'Cc').inputValue(), cc)
    assert.equal(await composeBody(page, 'Tiêu đề').inputValue(), subject)
    assert.equal(await composeBody(page, 'Nội dung thư').inputValue(), localBody)
    for (const [index, bytes] of [onlineBytes, offlineBytes].entries()) {
      const [download] = await Promise.all([page.waitForEvent('download'),
        button(page, 'Tải tệp ' + name).nth(index).click()])
      assert.equal(download.suggestedFilename(), name)
      assert.deepEqual(await readFile(await download.path()), bytes)
    }
    await composeBody(page, 'Nội dung thư').fill(finalBody)
    await label(page, 'Thêm tệp trên thiết bị').setInputFiles({ name: 'bo-qua.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('temporary file') })
    await button(page, 'Gỡ tệp bo-qua.bin').click()
    await status(page, 'Đã lưu trên thiết bị')
    assert.equal(await page.getByText('bo-qua.bin', { exact: false }).count(), 0)
    await capture('01-khoi-phuc-ngoai-tuyen')
    record('cold Chrome restart rejects a wrong password, restores the exact sender, envelope and both duplicate-name byte sequences, then saves more edits', true)

    otherBrowser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
    const other = await otherBrowser.newContext({ serviceWorkers: 'block' })
    await other.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await other.route('**/*', monitor)
    const online = await other.newPage()
    await login(online, email)
    await online.goto(draftUrl)
    await status(online, 'Bản nháp đã lưu')
    await composeBody(online, 'Nội dung thư').fill(serverBody)
    await status(online, 'Bản nháp đã lưu')
    await context.setOffline(false)
    await reconcile()
    const conflict = page.getByRole('region', { name: 'Bản nháp đã thay đổi ở hai nơi' })
    await conflict.getByText(serverBody, { exact: true }).waitFor()
    await conflict.getByText(finalBody, { exact: true }).waitFor()
    assert.equal((await api(endpoint + '?id=' + id)).fields.body, serverBody)
    await capture('02-doi-chieu-sau-ket-noi')
    lost = 'file'
    await button(conflict, 'Dùng bản trên thiết bị').click()
    await page.getByRole('alert').getByText('Chưa đồng bộ được bản nháp', { exact: true }).waitFor()
    assert.deepEqual(lossCodes, [200])
    await button(conflict, 'Dùng bản trên thiết bị').click()
    await status(page, 'Đã đồng bộ')
    const merged = await api(endpoint + '?id=' + id)
    assert.equal(merged.fields.body, finalBody)
    assert.deepEqual(merged.files.map(file => file.sha256), [onlineBytes, offlineBytes].map(bytes => createHash('sha256').update(bytes).digest('hex')))
    assert.equal(replayed, 2)
    assert.equal(sql(`SELECT count(*) FROM private.mail_files WHERE user_id='${userId}' AND filename='${name}'`).trim(), '2')
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('reconnect compares both versions and an explicit device choice replays one uncertain upload without duplicating file rows', true)

    await page.getByRole('link', { name: 'Mở bản nháp đã đồng bộ', exact: true }).click()
    await status(page, 'Bản nháp đã lưu')
    await button(page, 'Xem trước thư gửi').click()
    const preview = page.getByRole('dialog', { name: 'Xem trước thư gửi' })
    await preview.getByText(finalBody, { exact: true }).waitFor()
    await button(preview, 'Xác nhận gửi').click()
    await page.waitForURL('**/sent')
    assert.equal(googleProvider.calls.sendAttempts, 1)
    const [mail] = googleProvider.calls.sent
    assert.equal(mail.from, quality.address)
    assert.deepEqual(mail.attachments.map(file => Buffer.from(file.data, 'base64')), [onlineBytes, offlineBytes])
    record('only separate approval dispatches, once, from the correct Gmail identity with both original files', true)

    await page.goto(app + '/compose?forward=' + source)
    await page.getByRole('heading', { name: 'Chuyển tiếp thư', exact: true }).waitFor()
    await enable()
    await context.setOffline(true)
    await label(page, 'Đến').fill(to)
    await status(page, 'Đã lưu trên thiết bị')
    await context.close()
    await open(true)
    await page.goto(app + '/compose?forward=' + source)
    await page.waitForURL(url => url.pathname === shell && url.searchParams.get('forward') === source)
    await unlock(page)
    await page.getByRole('heading', { name: 'Bản nháp chuyển tiếp', exact: true }).waitFor()
    assert.equal(await label(page, 'Tài khoản gửi').inputValue(), operations.id)
    assert.match(await composeBody(page, 'Nội dung thư').inputValue(), /van-hanh@example\.test/)
    assert.equal(await composeBody(page, 'Người nhận').inputValue(), to)
    await context.setOffline(false)
    lost = 'create'
    await reconcile()
    await page.getByRole('alert').getByText('Chưa đồng bộ được bản nháp', { exact: true }).waitFor()
    assert.deepEqual(lossCodes, [200, 200])
    await context.close()
    await open()
    await page.goto(app + '/drafts')
    await page.getByRole('link', { name: 'Bản nháp trên thiết bị', exact: true }).click()
    await unlock(page)
    await page.getByRole('link', { name: 'Thư đã lưu trước nâng cấp', exact: true }).click()
    await page.getByText('Nội dung giả lập được lưu ở phiên bản 1.', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Về thư và bản nháp trên thiết bị', exact: true }).click()
    await page.getByRole('link', { name: 'Fwd: ' + sourceTitle, exact: true }).click()
    record('IndexedDB upgrade preserves and decrypts a v1 pinned message using its original password', true)
    await reconcile()
    await status(page, 'Đã đồng bộ')
    assert.equal(sql(`SELECT count(*) FROM private.file_compose_drafts WHERE user_id='${userId}' AND source_id='${source}'`).trim(), '1')
    record('forward restores the correct source from two matching Gmail messages and a lost create acknowledgement survives a restart without a duplicate', true)

    const lockedEditor = await context.newPage()
    await lockedEditor.goto(app + '/compose')
    await label(lockedEditor, 'Từ').selectOption(operations.id)
    await button(lockedEditor, 'Bật lưu bản nháp trên thiết bị').click()
    await unlock(lockedEditor.getByRole('dialog', { name: 'Mở khóa ngoại tuyến' }))
    await status(lockedEditor, 'Đã lưu trên thiết bị')
    await composeBody(lockedEditor, 'Nội dung thư').fill('Nội dung chỉ người dùng cũ được thấy.')
    await status(lockedEditor, 'Đã lưu trên thiết bị')
    await page.goto(app + shell)
    await unlock(page)
    await context.setOffline(true)
    await button(page, 'Soạn thư trên thiết bị').click()
    await composeBody(page, 'Tiêu đề').fill('Nháp chỉ có trên thiết bị')
    await status(page, 'Đã lưu trên thiết bị')
    const localUrl = page.url()
    const key = new URL(localUrl).searchParams.get('compose')
    assert.ok(key)
    await context.setOffline(false)
    const admission = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admission.error, null)
    const switcher = await context.newPage()
    await switcher.goto(app + '/settings')
    await button(switcher, 'Tài khoản của bạn').click()
    await button(switcher, 'Đăng xuất').click()
    await switcher.waitForURL('**/login')
    await page.getByText('Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.', { exact: true }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'Tiêu đề', exact: true }).count(), 0)
    await lockedEditor.getByText('Kho bản nháp đã khóa', { exact: true }).waitFor()
    assert.equal(await lockedEditor.getByRole('textbox', { name: 'Nội dung thư', exact: true }).count(), 0)
    await login(switcher, previousEmail)
    assert.equal((await switcher.request.get(app + '/api/compose-files?id=' + merged.files[1].id)).status(), 404)
    const replayAfterSwitch = await switcher.request.post(app + '/api/compose-files', {
      headers: { 'X-Draft-Owner': userId, 'X-Draft-File-Id': randomUUID(), 'X-File-Name': name,
        'Content-Type': 'application/octet-stream' }, data: offlineBytes,
    })
    assert.equal(replayAfterSwitch.status(), 403)
    assert.equal((await switcher.request.get(app + endpoint + '?creation=' + key,
      { headers: { 'X-Draft-Owner': userId } })).status(), 403)
    await switcher.goto(localUrl)
    await switcher.getByText('Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    record('offline compose starts in the shell and account switch clears ciphertext, locks the open tab, and denies file access', true)
    await writeFile(output + '/workflow.json', JSON.stringify({ chrome: context.browser()?.version() ?? 'Google Chrome',
      accounts: 2, independentProfiles: 2, coldRestarts: 3, encryptedFiles: raw.files.length, lostResponses: lossCodes.length,
      gmailDispatches: googleProvider.calls.sendAttempts, captures }, null, 2) + '\n')
  } catch (reason) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw reason
  } finally {
    await otherBrowser?.close()
    await context?.close()
    await rm(profile, { recursive: true, force: true, maxRetries: 3 })
  }
}
