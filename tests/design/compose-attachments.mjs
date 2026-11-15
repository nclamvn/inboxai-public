import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const api = '/api/compose-drafts'
const json = { 'Content-Type': 'application/json' }
const binary = (name, mimeType, buffer) => ({ name, mimeType, buffer })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const recipient = 'nguoi-nhan@example.test'
const fresh = binary('Lịch giao hàng.csv', 'text/csv', Buffer.from('lô,số lượng\nA,48\n'))
const replyFile = binary('Biên bản đối chiếu.txt', 'text/plain', Buffer.from('Bản đối chiếu đã ký 1/2\n'))
const first = binary('Báo cáo.dat', 'application/octet-stream', Buffer.from([0, 1, 2, 3, 254, 255]))
const second = binary(first.name, first.mimeType, Buffer.from([255, 254, 3, 2, 1, 0]))

export async function rehearseComposeAttachments({ app, base, email, password, userId, admin, appFetch, sql,
  googleProvider, previousEmail, anon, restartNext, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const buying = await mailbox('mua-hang@example.test')
  const finance = await mailbox('ke-toan@example.test')
  const original = { id: 'dupe-docs', subject: 'Hai phiên bản báo cáo', messageId: '<two-files@example.test>',
    from: 'nha-cung-cap@example.test', body: 'Tài liệu phiên bản nháp và bản cuối cùng.',
    at: new Date().toISOString(), threadId: 'dupe-thread', attachments: [first, second].map(file => ({
      filename: file.name, contentType: file.mimeType, data: file.buffer.toString('base64'),
    })) }
  finance.deliver([original])
  async function request(path, body, expected) {
    const response = await appFetch(path, body ? { method: 'POST', headers: json, body: JSON.stringify(body) } : {})
    const data = await response.json()
    if (expected) assert.equal(response.status, expected, JSON.stringify(data))
    else assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  const sync = () => request('/api/source-accounts/sync', { refresh: true })
  await sync()
  const source = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${finance.id}' AND original_uid='${original.id}'`).trim()
  assert.match(source, /^[a-f0-9-]{36}$/)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let context, page
  const pageErrors = [], downloads = []
  async function open(viewport, storageState) {
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport,
      serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: true, storageState })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { synced: 0 } })
      return [app, base].includes(url.origin) ? route.continue() : route.abort()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  async function loginAs(address) {
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(address)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
  }
  const button = name => page.getByRole('button', { name, exact: true })
  const field = name => page.getByLabel(name, { exact: true })
  const attached = () => page.getByRole('list', { name: 'Tệp đính kèm', exact: true })
  async function attach(file) {
    await page.locator('input[type=file]').setInputFiles(file)
    await attached().getByText(file.name, { exact: false }).waitFor()
  }
  async function preview(from, to, file) {
    await button('Xem trước thư gửi').click()
    const dialog = page.getByRole('dialog', { name: 'Xem trước thư gửi' })
    await dialog.getByText(from, { exact: true }).waitFor()
    await dialog.getByText(to, { exact: true }).waitFor()
    await dialog.getByText(file.name, { exact: false }).waitFor()
    assert.equal(await dialog.getByRole('listitem').count(), 1)
    return dialog
  }
  function assertMime(index, from, to, file) {
    const sent = googleProvider.calls.sent[index]
    assert.equal(sent.from, from)
    assert.deepEqual(sent.to, [to])
    assert.equal(sent.attachments.length, 1)
    assert.equal(sent.attachments[0].filename, file.name)
    assert.equal(sent.attachments[0].contentType, file.mimeType)
    assert.deepEqual(Buffer.from(sent.attachments[0].data, 'base64'), file.buffer)
    return sent
  }
  async function download(trigger, expected) {
    const [downloaded] = await Promise.all([page.waitForEvent('download'), trigger.click()])
    assert.equal(downloaded.suggestedFilename(), expected.name)
    const bytes = await readFile(await downloaded.path())
    assert.deepEqual(bytes, expected.buffer)
    return hash(bytes)
  }

  try {
    await open({ width: 1440, height: 900 })
    await loginAs(email)
    await page.goto(app + '/compose')
    await field('Từ').selectOption(buying.id)
    await field('Đến').fill(recipient)
    await field('Tiêu đề').fill('Lịch giao hàng mới')
    await field('Nội dung thư').fill('Gửi anh/chị lịch giao của lô A.')
    await attach(fresh)
    await button('Lưu bản nháp').click()
    await page.waitForURL('**/compose?draft=*')
    await page.getByRole('link', { name: 'Soạn thư', exact: true }).click()
    await page.waitForURL('**/compose')
    await attached().waitFor({ state: 'hidden' })
    assert.equal(await field('Nội dung thư').inputValue(), '')
    await page.getByRole('navigation', { name: 'Bản nháp đã lưu' }).getByRole('link', { name: 'Lịch giao hàng mới' }).click()
    await attached().getByText(fresh.name, { exact: false }).waitFor()
    assert.equal(await field('Nội dung thư').inputValue(), 'Gửi anh/chị lịch giao của lô A.')
    const newDialog = await preview(buying.address, recipient, fresh)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    await capture('01-soan-va-duyet')
    await newDialog.getByRole('button', { name: 'Xác nhận gửi' }).click()
    await page.waitForURL('**/sent')
    const newMail = assertMime(0, buying.address, recipient, fresh)
    record('New Compose restores its attachment and sends exactly the reviewed MIME from account one', true)

    await page.goto(app + '/inbox?email=' + source)
    await button('Trả lời').click()
    await page.waitForURL('**/compose?reply=' + source)
    await field('Nội dung thư').fill('Đã đối chiếu, xin gửi lại biên bản.')
    await attach(replyFile)
    await button('Lưu bản nháp').click()
    await page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()
    await page.reload()
    await attached().getByText(replyFile.name, { exact: false }).waitFor()
    const replyDialog = await preview(finance.address, original.from, replyFile)
    await capture('02-tra-loi-dung-hoi-thoai')
    await replyDialog.getByRole('button', { name: 'Xác nhận gửi' }).click()
    await page.getByRole('link', { name: 'Mở thư đã gửi' }).waitFor()
    const replied = assertMime(1, finance.address, original.from, replyFile)
    assert.equal(replied.inReplyTo, original.messageId)
    assert.equal(replied.threadId, original.threadId)
    record('Reply restores its attachment and sends exact bytes with matching Gmail thread and In-Reply-To from account two', true)

    await page.goto(app + '/inbox?email=' + source)
    await button('Chuyển tiếp').click()
    await page.waitForURL('**/compose?forward=' + source)
    const part1 = () => page.getByRole('checkbox', { name: /Báo cáo\.dat · Tệp 1/ })
    const part2 = () => page.getByRole('checkbox', { name: /Báo cáo\.dat · Tệp 2/ })
    await part2().waitFor()
    assert.equal(await part1().isChecked(), false)
    assert.equal(await part2().isChecked(), false)
    await download(page.getByRole('link', { name: 'Tải tệp nguồn 2 Báo cáo.dat' }), second)
    await part2().click()
    await attached().getByText(second.name, { exact: false }).waitFor()
    assert.equal(await part2().isChecked(), true)
    await field('Từ').selectOption(buying.id)
    await field('Đến').fill(recipient)
    await button('Lưu bản nháp').click()
    await page.waitForURL('**/compose?draft=*')
    const forwardUrl = page.url()
    const draftId = new URL(forwardUrl).searchParams.get('draft')
    await page.reload()
    await part2().waitFor()
    assert.equal(await part1().isChecked(), false)
    assert.equal(await part2().isChecked(), true)
    await capture('03-chon-tep-trung-ten')
    const staleDialog = await preview(buying.address, recipient, second)
    const saved = await request(api + '?id=' + draftId)
    assert.equal(saved.files[0].sha256, hash(second.buffer))
    const sourceFiles = await request('/api/emails/' + source + '/attachments')
    const wrongSource = await request('/api/compose-files', { sourceId: randomUUID(), attachmentId: sourceFiles.attachments[1].id }, 404)
    assert.ok(wrongSource.error)
    await request(api, { action: 'save', id: draftId, revision: saved.revision, accountId: saved.accountId,
      sourceId: source, fields: saved.fields, fileIds: [] })
    await staleDialog.getByRole('button', { name: 'Xác nhận gửi' }).click()
    await button('Mở lại bản nháp').waitFor()
    assert.equal(googleProvider.calls.sendAttempts, 2)
    record('Forward distinguishes equal-name and equal-size MIME parts and rejects an approval after selection changes', true)
    await button('Mở lại bản nháp').click()
    await attached().waitFor({ state: 'hidden' })
    await part2().waitFor()
    assert.equal(await part2().isChecked(), false)
    await part2().click()
    await attached().getByText(second.name, { exact: false }).waitFor()
    const forwardDialog = await preview(buying.address, recipient, second)
    await capture('04-duyet-chuyen-tiep')

    buying.box.dropSendAcknowledgement = true
    let lostResponse
    await page.route(app + api, async route => {
      const action = route.request().method() === 'POST' && route.request().postDataJSON().action
      if (action !== 'send') return route.fallback()
      const response = await route.fetch({ maxRetries: 0, timeout: 40_000 })
      lostResponse = await response.json()
      await context.setOffline(true)
      await route.abort()
    })
    await forwardDialog.getByRole('button', { name: 'Xác nhận gửi' }).click()
    await page.getByText('Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.', { exact: true }).waitFor()
    assert.equal(lostResponse.state, 'unknown')
    const forwarded = assertMime(2, buying.address, recipient, second)
    assert.equal(forwarded.inReplyTo, undefined)
    assert.equal(forwarded.threadId, undefined)
    assert.match(forwarded.body, /Tài liệu phiên bản nháp và bản cuối cùng/)
    const storage = await context.storageState()
    await context.close()
    await restartNext()
    await open({ width: 390, height: 844 }, storage)
    await page.goto(forwardUrl)
    await page.getByText('Đang chờ xác minh', { exact: true }).waitFor()
    await capture('05-khoi-phuc-sau-mat-ket-noi')
    await button('Kiểm tra trạng thái gửi').click()
    await page.waitForURL('**/sent')
    const replay = await request(api, { action: 'send', id: draftId })
    assert.equal(replay.state, 'accepted')
    assert.equal(replay.operationId, lostResponse.operationId)
    assert.equal(googleProvider.calls.sendAttempts, 3)
    record('Lost provider and browser acknowledgement followed by restart recovers the same receipt without a repeated send', true)

    await sync()
    await context.close()
    await open({ width: 1440, height: 900 }, storage)
    let sentFileId
    for (const [mail, file] of [[newMail, fresh], [replied, replyFile], [forwarded, second]]) {
      await page.goto(app + '/sent')
      await page.getByRole('button', { name: mail.subject, exact: true }).press('Enter')
      await page.getByText(file.name, { exact: true }).waitFor()
      await page.getByText(mail.body, { exact: false }).waitFor()
      await page.getByText('Đến: ' + mail.to[0], { exact: false }).waitFor()
      const downloadHash = await download(button('Tải xuống'), file)
      const sentId = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND message_id='${mail.messageId}' AND direction='outbound'`).trim()
      const list = await request('/api/emails/' + sentId + '/attachments')
      assert.equal(list.attachments.length, 1)
      assert.equal(list.attachments[0].filename, file.name)
      assert.equal(list.attachments[0].size, file.buffer.length)
      sentFileId = list.attachments[0].id
      downloads.push({ filename: file.name, bytes: file.buffer.length, sha256: downloadHash })
    }
    await capture('06-tep-trong-sent')
    record('Sent downloads all three original byte sequences after provider sync, including only the selected duplicate-name part', true)

    const foreign = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.equal((await foreign.auth.signInWithPassword({ email: previousEmail, password })).error, null)
    const foreignDraft = await foreign.rpc('read_file_compose', { p_id: draftId })
    assert.equal(foreignDraft.error?.code, 'PT404')
    const foreignFile = await foreign.rpc('read_sent_mail_file', { p_id: sentFileId })
    assert.equal(foreignFile.error, null)
    assert.equal(foreignFile.data, null)
    await context.close()
    await open({ width: 1440, height: 900 })
    assert.equal((await context.request.get(app + '/api/attachments/' + sentFileId)).status(), 401)
    const admitted = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admitted.error, null)
    await loginAs(previousEmail)
    assert.equal((await context.request.get(app + '/api/attachments/' + sentFileId)).status(), 404)
    record('Anonymous and second-tenant users cannot read the Sent file or the saved draft', true)
    record('No uncaught browser errors, horizontal overflow or axe violations on the audited screens', pageErrors.length === 0)
    await writeFile(output + '/workflow.json', JSON.stringify({ accounts: 2, sends: googleProvider.calls.sendAttempts,
      matchedThread: replied.threadId, downloads, recoveredOperation: replay.operationId, pageErrors }, null, 2) + '\n')
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
