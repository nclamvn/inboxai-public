import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const require = createRequire(import.meta.url)
const draftApi = '/api/compose-drafts'
const subject = 'Xác nhận bàn giao bộ gá J42'
const inboundSubject = 'Biên bản thử tải J42'
const to = 'truong.ca@example.test'
const cc = 'kiem-dinh@example.test'
const initialText = 'Hồ sơ bàn giao đang soạn.'
const text = 'Hồ sơ bàn giao chờ xác nhận trước ca chiều.'
const serverText = 'Xưởng xác nhận đủ hai bộ gá để bàn giao.'
const offlineText = 'Tạm hoãn bàn giao để kiểm tra dung sai bộ gá.'
const contents = Buffer.from([0, 255, 42, 77, 0])
const filename = 'kiem-dinh-j42.bin'
const json = { 'Content-Type': 'application/json' }
const field = (page, label) => page.getByLabel(label, { exact: true })
const button = (scope, label) => scope.getByRole('button', { name: label, exact: true })
const list = page => page.getByRole('list', { name: 'Bản nháp đã lưu', exact: true })
const row = (page, label) => list(page).getByRole('link').filter({ hasText: label })
const saved = page => page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()

export async function rehearseDraftContinuity({ app, base, email, password, userId, admin, appFetch,
  sql, googleProvider, previousEmail, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const provider = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: provider.tokens.access_token, refreshToken: provider.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: provider.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { ...provider, address, id }
  }
  const receiving = await mailbox('xuong-co-khi@example.test')
  const sending = await mailbox('ban-giao@example.test')
  receiving.deliver([{ id: 'j42-bien-ban', threadId: 'j42-bien-ban-thread', messageId: '<j42-bien-ban@example.test>',
    from: 'phong-thu-tai@example.test', subject: inboundSubject, body: 'Biên bản thử tải cho bộ gá J42.',
    at: new Date(Date.now() - 300_000).toISOString() }])
  assert.equal((await appFetch('/api/source-accounts/sync', {
    method: 'POST', headers: json, body: JSON.stringify({ refresh: true }),
  })).status, 200)
  const sourceId = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${receiving.id}'
    AND original_uid='j42-bien-ban'`).trim()
  assert.match(sourceId, /^[a-f0-9-]{36}$/)
  const browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
  const captures = [], errors = [], confirmations = [], creations = []
  let current, loss = 'save', lostSend

  async function profile(address, mobile = false) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', reducedMotion: 'reduce',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') })
    await context.route('**/*', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === draftApi && req.method() === 'POST') {
        const action = req.postDataJSON()
        if (action.clientId) creations.push(action.clientId)
        if (action.action === loss && (loss !== 'save' || action.clientId)) {
          loss = null
          const res = await route.fetch({ maxRetries: 0 })
          confirmations.push(res.status())
          if (action.action === 'send') lostSend = await res.json()
          return route.abort()
        }
      }
      return route.continue()
    })
    const page = current = await context.newPage()
    page.setDefaultTimeout(16_000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(app + '/login')
    await field(page, 'Email').fill(address)
    await field(page, 'Mật khẩu').fill(password)
    await button(page, 'Đăng nhập').click()
    await page.waitForURL('**/inbox')
    return { page, context }
  }

  async function capture(page, label) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + label + '.png', animations: 'disabled' })
    captures.push(label)
  }

  try {
    const first = await profile(email)
    const a = first.page
    await a.goto(app + '/drafts')
    await a.getByRole('link', { name: 'Soạn thư', exact: true }).last().click()
    await field(a, 'Từ').selectOption(sending.id)
    await field(a, 'Đến').fill(to)
    await button(a, 'Cc').click()
    await field(a, 'Cc').fill(cc)
    await field(a, 'Tiêu đề').fill(subject)
    await field(a, 'Nội dung thư').fill(initialText)
    await field(a, 'Chọn tệp đính kèm').setInputFiles({ name: filename, mimeType: 'application/octet-stream', buffer: contents })
    await a.getByText('Chưa nhận được xác nhận lưu.', { exact: false }).waitFor()
    assert.deepEqual(confirmations, [200])
    assert.equal(await field(a, 'Nội dung thư').inputValue(), initialText)
    await first.context.setOffline(true)
    await a.getByText('Chưa đồng bộ · Mất kết nối', { exact: true }).waitFor()
    await field(a, 'Nội dung thư').fill(text)
    await first.context.setOffline(false)
    await saved(a)
    await a.waitForURL('**/compose?draft=*')
    const draftUrl = a.url()
    const id = new URL(draftUrl).searchParams.get('draft')
    assert.deepEqual(creations, [creations[0], creations[0]])
    assert.equal(sql(`SELECT count(*) FROM private.file_compose_drafts WHERE user_id='${userId}' AND fields->>'subject'='${subject}'`).trim(), '1')
    assert.equal(googleProvider.calls.sendAttempts, 0)
    await first.context.close()
    record('idle autosave retries a committed creation with the same key, saves newer typing, and permits closing the profile', true)

    const second = await profile(email, true)
    const b = second.page
    await b.goto(app + '/drafts')
    await row(b, subject).click()
    await saved(b)
    assert.deepEqual(await Promise.all(['Từ', 'Đến', 'Cc', 'Tiêu đề', 'Nội dung thư'].map(label => field(b, label).inputValue())),
      [sending.id, to, cc, subject, text])
    await b.getByRole('list', { name: 'Tệp đính kèm' }).getByText(filename, { exact: false }).waitFor()
    const stored = await (await b.request.get(app + draftApi + '?id=' + id)).json()
    assert.equal(stored.files[0].sha256, createHash('sha256').update(contents).digest('hex'))
    await capture(b, '01-khoi-phuc-mobile')
    record('a separate mobile Chrome profile restores sender, To, Cc, subject, body and exact attachment hash', true)

    const third = await profile(email)
    current = b
    const c = third.page
    await c.goto(draftUrl)
    await saved(c)
    await second.context.setOffline(true)
    await field(b, 'Nội dung thư').fill(offlineText)
    await b.getByText('Chưa đồng bộ · Mất kết nối', { exact: true }).waitFor()
    const staying = b.waitForEvent('dialog')
    const navigate = b.getByRole('link', { name: 'Bản nháp', exact: true }).click()
    const warning = await staying
    assert.equal(warning.type(), 'confirm')
    await warning.dismiss()
    await navigate
    assert.equal(b.url(), draftUrl)
    assert.equal(await field(b, 'Nội dung thư').inputValue(), offlineText)
    await field(c, 'Nội dung thư').fill(serverText)
    await saved(c)
    await second.context.setOffline(false)
    const comparison = b.getByRole('region', { name: 'Bản nháp đã thay đổi ở hai nơi' })
    await comparison.getByText(offlineText, { exact: true }).waitFor()
    await comparison.getByText(serverText, { exact: true }).waitFor()
    const beforeChoice = await (await c.request.get(app + draftApi + '?id=' + id)).json()
    assert.equal(beforeChoice.fields.body, serverText)
    await capture(b, '02-doi-chieu-hai-ban')
    await button(comparison, 'Giữ bản đang soạn').click()
    await saved(b)
    const afterChoice = await (await c.request.get(app + draftApi + '?id=' + id)).json()
    assert.equal(afterChoice.fields.body, offlineText)
    assert.equal(afterChoice.id, id)
    assert.equal(afterChoice.revision, beforeChoice.revision + 1)
    record('offline edits survive reconnection; both versions appear and only explicit selection replaces the latest revision', true)

    current = c
    await c.goto(app + '/compose?reply=' + sourceId)
    await field(c, 'Nội dung thư').fill('Tôi đã nhận biên bản thử tải.')
    await saved(c)
    await c.goto(app + '/compose?forward=' + sourceId)
    await c.waitForFunction(() => !document.querySelector('#compose-to')?.matches(':disabled'))
    await field(c, 'Đến').fill('quan-doc@example.test')
    await saved(c)
    await c.goto(app + '/drafts')
    await row(c, subject).waitFor()
    await row(c, 'Re: ' + inboundSubject).waitFor()
    await row(c, 'Fwd: ' + inboundSubject).waitFor()
    await capture(c, '03-danh-sach-ban-nhap')
    await field(c, 'Tài khoản gửi').selectOption(receiving.id)
    await row(c, 'Re: ' + inboundSubject).waitFor()
    await row(c, 'Fwd: ' + inboundSubject).waitFor()
    assert.equal(await row(c, subject).count(), 0)
    await field(c, 'Tài khoản gửi').selectOption(sending.id)
    await row(c, subject).waitFor()
    assert.equal(await list(c).getByRole('link').count(), 1)
    await field(c, 'Tài khoản gửi').selectOption(receiving.id)
    await row(c, 'Re: ' + inboundSubject).click()
    await saved(c)
    assert.equal(await field(c, 'Nội dung thư').inputValue(), 'Tôi đã nhận biên bản thử tải.')
    current = b
    await b.goto(app + '/compose?reply=' + sourceId)
    await saved(b)
    await second.context.setOffline(true)
    await field(b, 'Nội dung thư').fill('Máy này chờ chữ ký biên bản.')
    await field(c, 'Nội dung thư').fill('Máy chủ đã nhận chữ ký biên bản.')
    await saved(c)
    await second.context.setOffline(false)
    const replyComparison = b.getByRole('region', { name: 'Bản nháp đã thay đổi ở hai nơi' })
    await replyComparison.getByText('Máy này chờ chữ ký biên bản.', { exact: true }).waitFor()
    await replyComparison.getByText('Máy chủ đã nhận chữ ký biên bản.', { exact: true }).waitFor()
    await button(replyComparison, 'Dùng bản trên máy chủ').click()
    await saved(b)
    assert.equal(await field(b, 'Nội dung thư').inputValue(), 'Máy chủ đã nhận chữ ký biên bản.')
    current = c
    await c.goto(app + '/drafts')
    await row(c, 'Fwd: ' + inboundSubject).click()
    await saved(c)
    assert.equal(await field(c, 'Đến').inputValue(), 'quan-doc@example.test')
    record('all three draft kinds reopen from the central list, account filter isolates rows, reply can retain the server version', true)

    current = b
    await b.goto(draftUrl)
    await saved(b)
    await button(b, 'Xem trước thư gửi').click()
    const preview = b.getByRole('dialog', { name: 'Xem trước thư gửi' })
    await preview.getByText(offlineText, { exact: true }).waitFor()
    assert.equal(googleProvider.calls.sendAttempts, 0)
    sending.box.dropSendAcknowledgement = true
    loss = 'send'
    await button(preview, 'Xác nhận gửi').click()
    await b.getByText('Đang chờ xác minh', { exact: true }).waitFor()
    assert.equal(lostSend.state, 'unknown')
    await b.goto(app + '/drafts')
    await row(b, subject).getByText('Chờ xác minh', { exact: true }).waitFor()
    await row(b, subject).click()
    await button(b, 'Kiểm tra trạng thái gửi').click()
    await b.waitForURL('**/sent')
    const [sent] = googleProvider.calls.sent
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.deepEqual(sent.attachments, [{ filename, contentType: 'application/octet-stream', data: contents.toString('base64') }])
    assert.deepEqual([sent.from, sent.to, sent.cc, sent.subject, sent.body], [sending.address, [to], [cc], subject, offlineText])
    const replays = await Promise.all(['send', 'check'].map(action => appFetch(draftApi, {
      method: 'POST', headers: json, body: JSON.stringify({ action, id }),
    }).then(response => response.json())))
    assert.ok(replays.every(receipt => receipt.state === 'accepted' && receipt.operationId === lostSend.operationId))
    assert.equal(googleProvider.calls.sendAttempts, 1)
    await b.goto(app + '/drafts')
    await row(b, 'Re: ' + inboundSubject).waitFor()
    assert.equal(await row(b, subject).count(), 0)
    record('an explicit approval with lost browser and Gmail acknowledgements yields one dispatch and a verifiable receipt', true)

    assert.equal((await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })).error, null)
    const stranger = (await profile(previousEmail)).page
    await stranger.goto(app + '/drafts')
    await row(stranger, 'Nháp trước nâng cấp').waitFor()
    assert.equal(await list(stranger).getByRole('link').count(), 1)
    await row(stranger, 'Nháp trước nâng cấp').click()
    await saved(stranger)
    assert.equal(await field(stranger, 'Nội dung thư').inputValue(), 'Bản gốc')
    record('a draft saved before the migration retains its account, text and access on upgrade', true)
    for (const path of [draftApi + '?id=' + id, '/api/replies?source=' + sourceId, '/api/drafts?account=' + receiving.id]) {
      assert.equal((await stranger.request.get(app + path)).status(), 404)
    }
    assert.equal((await fetch(app + '/api/drafts')).status, 401)
    assert.deepEqual(errors, [])
    record('anonymous and second InboxAI user cannot list, filter or directly open the owner’s drafts', true)
    await writeFile(output + '/workflow.json', JSON.stringify({ chrome: browser.version(), profiles: 4, accounts: 2,
      savesAfterLostResponse: 1, providerDispatches: googleProvider.calls.sendAttempts, captures }, null, 2) + '\n')
  } catch (error) {
    await current?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
