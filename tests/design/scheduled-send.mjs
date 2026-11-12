import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const zone = 'Asia/Ho_Chi_Minh'
const format = new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const picker = time => format.format(time).replace(' ', 'T')
const iso = time => new Date(time).toISOString()
const json = { 'Content-Type': 'application/json' }
const outbox = '/api/scheduled-mail'
const composeApi = '/api/compose-drafts'
const exec = promisify(execFile)
const movedSubject = 'Lịch bàn giao báo cáo'
const canceledSubject = 'Phiên bản báo giá cũ'
const originalSubject = 'Xác nhận cửa sổ nhận hàng'
const replySubject = 'Re: ' + originalSubject
const recipient = 'dieu-phoi@example.test'
const cc = 'quan-ly@example.test'
const attachment = { name: 'Biên bản bàn giao.csv', mimeType: 'text/csv', buffer: Buffer.from('mã,số lượng\nLOT-7,36\n') }

export async function rehearseScheduledSend({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
  previousEmail, restartNext, cronSecret, record, output }) {
  const start = Math.floor(Date.now() / 60_000) * 60_000
  const due = start + 10 * 60_000
  const movedTo = start + 35 * 60_000
  const setClock = time => sql(`CREATE OR REPLACE FUNCTION private.scheduled_mail_now() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path='' AS $$ SELECT TIMESTAMPTZ '${iso(time)}' $$;`)
  setClock(start)
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: iso(Date.now() + 3_600_000), scope: fixture.tokens.scope, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const a = await mailbox('van-hanh@example.test')
  const b = await mailbox('kho-hang@example.test')
  const original = { id: 'arrival-window', subject: originalSubject, body: 'Kho có nhận lô 7 lúc 11:00?',
    from: 'nha-cung-cap@example.test', at: iso(start - 60_000), messageId: '<arrival-window@example.test>', threadId: 'arrival-77' }
  b.deliver([original])

  async function request(path, body, status = 200) {
    const response = await appFetch(path, body ? { method: 'POST', headers: json, body: JSON.stringify(body) } : {})
    const result = await response.json()
    assert.equal(response.status, status, `${path} ${JSON.stringify(result)}`)
    return result
  }
  assert.ok((await request('/api/source-accounts/sync', { refresh: true })).success)
  const source = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${b.id}' AND original_uid='${original.id}'`).trim()
  assert.match(source, /^[a-f0-9-]{36}$/)
  const worker = async () => {
    const { stdout } = await exec(process.execPath, ['scripts/scheduled-send-worker.mjs', '--once'], {
      env: { ...process.env, INBOXAI_SCHEDULED_SEND_URL: app, CRON_SECRET: cronSecret }, timeout: 70_000,
    })
    return JSON.parse(stdout)
  }

  let browser, context, page
  const pageErrors = []
  let chromeVersion
  async function open(viewport, time = start) {
    browser = await chromium.launch({ channel: 'chrome' })
    chromeVersion = browser.version()
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: zone, viewport, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { synced: 0 } })
      return route.continue()
    })
    page = await context.newPage()
    await page.clock.setFixedTime(new Date(time))
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  const button = name => page.getByRole('button', { name, exact: true })
  const field = name => page.getByLabel(name, { exact: true })
  const dialog = () => page.getByRole('dialog')
  const row = subject => page.getByRole('article', { name: subject, exact: true })
  async function login(address) {
    await page.goto(app + '/login')
    await field('Email').fill(address)
    await field('Mật khẩu').fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
  }
  async function compose(subject, account, body, file) {
    await page.goto(app + '/compose')
    await field('Từ').selectOption(account.id)
    await field('Đến').fill(recipient)
    await field('Tiêu đề').fill(subject)
    await field('Nội dung thư').fill(body)
    if (file) {
      await page.locator('input[type=file]').setInputFiles(file)
      await page.getByRole('list', { name: 'Tệp đính kèm', exact: true }).getByText(file.name, { exact: false }).waitFor()
    }
    await button('Lên lịch gửi').click()
    await dialog().getByText(account.address, { exact: true }).waitFor()
    await dialog().getByText(recipient, { exact: true }).waitFor()
  }
  async function setTime(time) {
    await dialog().getByLabel(/Ngày và giờ gửi/).fill(picker(time))
  }
  async function confirmSchedule() {
    await button('Xác nhận lên lịch').click()
    await page.waitForURL('**/outbox')
  }

  try {
    assert.equal((await fetch(app + '/api/cron/send-scheduled', { method: 'POST' })).status, 401)
    assert.equal((await fetch(app + outbox)).status, 401)
    await open({ width: 1440, height: 900 })
    await login(email)

    await compose(movedSubject, a, 'Đính kèm biên bản cho lô 7.', attachment)
    await dialog().getByText(attachment.name, { exact: false }).waitFor()
    await dialog().getByText('Đính kèm biên bản cho lô 7.', { exact: true }).waitFor()
    await setTime(start - 60_000)
    await button('Xác nhận lên lịch').click()
    await dialog().getByRole('alert').getByText(/trong tương lai/).waitFor()
    await setTime(due)
    await capture('01-duyet-lich-va-tep')

    let lostApproval
    await page.route(app + composeApi, async route => {
      const command = route.request().postDataJSON()
      if (command.action !== 'schedule') return route.continue()
      const response = await route.fetch()
      assert.ok(response.ok(), await response.text())
      lostApproval = { ...command, ...await response.json() }
      await route.abort()
    }, { times: 1 })
    await button('Xác nhận lên lịch').click()
    await dialog().getByRole('alert').getByText(/Mất kết nối/).waitFor()
    await confirmSchedule()
    await row(movedSubject).waitFor()
    let rows = await request(outbox)
    assert.deepEqual(rows.map(mail => mail.id), [lostApproval.id])
    const moved = rows[0]
    assert.equal((await request(composeApi, { action: 'schedule', id: moved.draftId, revision: lostApproval.revision,
      at: iso(due), requestId: lostApproval.requestId })).id, moved.id)
    await request(composeApi, { action: 'send', id: moved.draftId }, 409)
    await request(composeApi, { action: 'edit', id: moved.draftId }, 409)
    record('Schedule confirmation shows account, recipient, body and attachment, rejects past time, replays a lost approval and blocks immediate send/edit', googleProvider.calls.sendAttempts === 0)

    await page.goto(app + '/compose?reply=' + source)
    await field('Nội dung thư').fill('Kho xác nhận nhận lô 7 lúc 11:00.')
    await field('Cc').fill(cc)
    await button('Xem trước thư gửi').click()
    await dialog().getByText(b.address, { exact: true }).waitFor()
    await button('Lên lịch gửi').click()
    await dialog().getByText(original.from, { exact: true }).waitFor()
    await dialog().getByText(cc, { exact: true }).waitFor()
    await setTime(due)
    await confirmSchedule()
    await row(replySubject).waitFor()

    await compose(canceledSubject, b, 'Bản nháp cần rà soát lại số lượng.')
    await setTime(due)
    await confirmSchedule()
    await row(canceledSubject).waitFor()
    rows = await request(outbox)
    const canceled = rows.find(mail => mail.subject === canceledSubject)
    const reply = rows.find(mail => mail.subject === replySubject)
    assert.equal(rows.length, 3)
    assert.equal(reply.account, b.address)
    assert.deepEqual(reply.cc, [cc])

    await row(movedSubject).getByRole('button', { name: 'Dời lịch gửi' }).click()
    await setTime(movedTo)
    await button('Lưu giờ mới').click()
    await dialog().waitFor({ state: 'hidden' })
    await row(movedSubject).locator(`time[datetime^="${iso(movedTo).slice(0, 19)}"]`).waitFor()
    await request(outbox, { action: 'cancel', id: moved.id, version: moved.version }, 409)
    await row(canceledSubject).getByRole('button', { name: 'Hủy lịch gửi' }).click()
    await button('Xác nhận hủy lịch').click()
    await row(canceledSubject).getByText('Đã hủy lịch', { exact: true }).waitFor()
    await capture('02-cho-gui-hai-tai-khoan')
    await row(canceledSubject).getByRole('link', { name: 'Mở bản nháp' }).click()
    await page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()
    assert.equal(await field('Nội dung thư').inputValue(), 'Bản nháp cần rà soát lại số lượng.')
    assert.equal(await field('Nội dung thư').isEditable(), true)
    record('Moving invalidates stale edits, cancelling restores the exact editable draft, and the second account retains its reply schedule', true)

    await browser.close()
    await open({ width: 390, height: 844 })
    const admitted = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admitted.error, null)
    await login(previousEmail)
    await page.goto(app + '/compose')
    await page.getByRole('link', { name: 'Chờ gửi', exact: true }).click()
    await page.getByText('Chưa có thư lên lịch.', { exact: true }).waitFor()
    for (const action of [{ action: 'cancel', version: reply.version }, { action: 'check' }]) {
      const denial = await page.request.post(app + outbox, { data: { ...action, id: reply.id } })
      assert.equal(denial.status(), 404)
    }
    record('Anonymous and other-tenant actors cannot read schedules, cancel jobs or check receipts', true)

    await browser.close()
    assert.equal(browser.isConnected(), false)
    setClock(due - 1)
    assert.deepEqual(await worker(), { claimed: 0, unrecorded: 0 })
    assert.equal(googleProvider.calls.sendAttempts, 0)
    await restartNext()
    b.box.dropSendAcknowledgement = true
    setClock(due)
    const concurrent = await Promise.all([worker(), worker()])
    assert.equal(concurrent.reduce((count, item) => count + item.claimed, 0), 1)
    assert.equal(googleProvider.calls.sendAttempts, 1)
    const replyMime = googleProvider.calls.sent[0]
    assert.equal(replyMime.from, b.address)
    assert.deepEqual(replyMime.to, [original.from])
    assert.deepEqual(replyMime.cc, [cc])
    assert.equal(replyMime.inReplyTo, original.messageId)
    assert.equal(replyMime.threadId, original.threadId)
    const stateOf = async id => (await request(outbox)).find(mail => mail.id === id)
    assert.equal((await stateOf(reply.id)).state, 'unknown')
    assert.equal((await stateOf(reply.id)).sentId, null)
    assert.equal((await stateOf(moved.id)).state, 'scheduled')
    record('With Chrome closed and Next restarted, two workers race at the due time and Gmail receives only one reply in the correct thread', true)

    await restartNext()
    setClock(due + 30_000)
    assert.equal((await worker()).claimed, 1)
    const confirmed = await stateOf(reply.id)
    assert.equal(confirmed.state, 'accepted')
    assert.ok(confirmed.sentId)
    const replyMirror = await request('/api/emails/' + confirmed.sentId)
    assert.equal(replyMirror.email.message_id, replyMime.messageId)
    assert.equal(googleProvider.calls.sendAttempts, 1)
    record('A dropped Gmail acknowledgement stays unconfirmed, then a fresh worker reconciles the same Message-ID from Sent after restart without dispatch', true)

    setClock(movedTo - 1)
    assert.equal((await worker()).claimed, 0)
    setClock(movedTo)
    assert.equal((await worker()).claimed, 1)
    const movedMime = googleProvider.calls.sent[1]
    assert.equal(movedMime.from, a.address)
    assert.deepEqual(movedMime.to, [recipient])
    assert.equal(movedMime.subject, movedSubject)
    assert.equal(movedMime.attachments[0].filename, attachment.name)
    assert.deepEqual(Buffer.from(movedMime.attachments[0].data, 'base64'), attachment.buffer)
    assert.equal((await stateOf(canceled.id)).state, 'canceled')
    setClock(movedTo + 120_000)
    assert.equal((await worker()).claimed, 0)
    assert.equal(googleProvider.calls.sendAttempts, 2)
    record('The moved job sends the approved attachment bytes at the new time, the cancelled job stays unsent, and subsequent ticks dispatch nothing', true)

    await open({ width: 390, height: 844 }, movedTo + 120_000)
    await login(email)
    await page.goto(app + '/compose')
    await page.getByRole('link', { name: 'Chờ gửi', exact: true }).click()
    await row(replySubject).getByText('Đã gửi', { exact: true }).waitFor()
    await row(movedSubject).getByText('Đã gửi', { exact: true }).waitFor()
    await row(canceledSubject).getByText('Đã hủy lịch', { exact: true }).waitFor()
    await capture('03-trang-thai-mobile')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await capture('04-trang-thai-mobile-toi')
    await row(movedSubject).getByRole('link', { name: 'Mở thư đã gửi' }).click()
    await page.getByText(attachment.name, { exact: false }).waitFor()
    assert.deepEqual(pageErrors, [])
    record('Chrome mobile viewport shows durable status and opens the exact Sent message with its attachment; light and dark screens have no axe violations or horizontal overflow', true)
    await writeFile(output + '/workflow.json', JSON.stringify({
      status: 'PASS', chromeVersion, timezone: zone, browserClosedDuringBothDispatches: true, nextRestarts: 2,
      providerSendAttempts: googleProvider.calls.sendAttempts, gmailAccounts: 2, scenarios: [
        { subject: replySubject, initialAt: iso(due), final: 'accepted', lostAcknowledgement: true, messageId: replyMime.messageId },
        { subject: movedSubject, initialAt: iso(due), movedTo: iso(movedTo), final: 'accepted', messageId: movedMime.messageId },
        { subject: canceledSubject, initialAt: iso(due), final: 'canceled' },
      ],
    }, null, 2) + '\n')
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser?.close()
  }
}
