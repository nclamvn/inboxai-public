import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { gmailReadScope, gmailSendScope, googleEmailScope } from '../../src/lib/gmail/scopes.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const exec = promisify(execFile)
const zone = 'Asia/Ho_Chi_Minh'
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const iso = time => new Date(time).toISOString()
const json = { 'Content-Type': 'application/json' }
const originalSubject = '[PO-4382] Bản xác nhận 200 bộ gá'
const quote = 'Tôi dời hạn sang ngày 16/11/2026.'
const scheduledSubject = 'Xác nhận đã tiếp nhận đơn hàng'
const sender = 'linh@linhkien.example.test'
const scheduleRecipient = 'dieu-phoi@example.test'
const oauthScopes = [gmailReadScope, gmailSendScope, googleEmailScope]

export async function rehearseGmailReconnect({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
  previousEmail, restartNext, cronSecret, record, output }) {
  const start = Math.floor(Date.now() / 60_000) * 60_000
  const due = start + 10 * 60_000
  const setClock = time => sql(`CREATE OR REPLACE FUNCTION private.scheduled_mail_now() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path='' AS $$ SELECT TIMESTAMPTZ '${iso(time)}' $$;`)
  setClock(start)
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: iso(Date.now() + 3_600_000), scope: fixture.tokens.scope, googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const a = await mailbox('mua-hang@example.test')
  const b = await mailbox('kho-hang@example.test')
  const sourceMail = { id: 'original-4382', from: sender, subject: originalSubject,
    at: iso(start - 300_000), body: 'Tôi sẽ gửi bản xác nhận 200 bộ gá trước ngày 12/11/2026.',
    messageId: '<original-4382@example.test>', threadId: 'po-thread' }
  const reply = { ...sourceMail, id: 'delayed-reply', subject: 'Re: ' + originalSubject, at: iso(start + 60_000),
    body: quote, messageId: '<delayed-reply@example.test>', inReplyTo: sourceMail.messageId }
  const message = (id, subject) => ({ id, subject, from: 'system@example.test', at: iso(start + 120_000),
    body: 'Thông báo tự động từ kho.', messageId: '<' + id + '@example.test>' })
  a.deliver([sourceMail])
  b.deliver([message('warehouse-initial', 'Biên nhận kho đầu ngày')])

  async function request(path, body, extraHeaders = {}) {
    const response = await appFetch(path, body ? { method: 'POST', headers: { ...json, ...extraHeaders }, body: JSON.stringify(body) } : {})
    const data = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  async function worker(name) {
    const { stdout } = await exec(process.execPath, [`scripts/${name}-worker.mjs`, '--once'], {
      env: { ...process.env, INBOXAI_GMAIL_SYNC_URL: app, INBOXAI_SCHEDULED_SEND_URL: app, CRON_SECRET: cronSecret },
      timeout: 80_000,
    })
    return JSON.parse(stdout)
  }
  const sync = () => worker('gmail-sync')
  const send = () => worker('scheduled-send')
  const expireIdleThrottle = () => sql(`UPDATE public.source_accounts SET sync_status='pending'
    WHERE user_id='${userId}' AND sync_status='idle'`)
  const expireBackoff = account => sql(`UPDATE private.account_sync SET retry_at=clock_timestamp()-interval '1 second'
    WHERE user_id='${userId}' AND account_id='${account.id}' AND retry_at IS NOT NULL`)
  const checkpoint = account => JSON.parse(sql(`SELECT jsonb_build_object('cursor',s.cursor,'revision',s.revision,
    'lastSync',a.last_sync_at,'blocked',private.gmail_needs_reconnect(a.user_id,a.id))
    FROM public.source_accounts a JOIN private.account_sync s ON s.account_id=a.id AND s.user_id=a.user_id
    WHERE a.user_id='${userId}' AND a.id='${account.id}'`))
  const uid = (account, id) => sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${account.id}'
    AND original_uid='${id}' AND NOT provider_deleted`).trim()
  const operationCount = () => Number(sql(`SELECT count(*) FROM private.mail_send_operations WHERE user_id='${userId}'`))
  const scheduleState = async () => (await request('/api/scheduled-mail')).find(mail => mail.subject === scheduledSubject)

  assert.equal((await fetch(app + '/api/cron/sync-emails', { method: 'POST' })).status, 401)
  assert.equal((await fetch(app + `/api/source-accounts/${a.id}/reconnect?surface=inbox`, { method: 'POST' })).status, 401)
  assert.equal((await sync()).synced, 2)
  const sourceId = uid(a, sourceMail.id)
  assert.match(sourceId, /^[a-f0-9-]{36}$/)
  const { proposals } = await request('/api/commitments/catchup')
  const proposed = proposals.find(proposal => proposal.reference === 'PO-4382')
  assert.ok(proposed)
  await request('/api/commitments/detections', proposed.review.command, { 'Idempotency-Key': randomUUID() })

  let browser, context, page, storageState, oauthDecision, chromeVersion
  const pageErrors = []
  async function open(viewport = { width: 1440, height: 900 }) {
    browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
    chromeVersion = browser.version()
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: zone, viewport, storageState,
      serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === 'https://accounts.google.com') {
        assert.ok(oauthDecision)
        const callback = googleProvider.authorize(url, oauthDecision, app, 'reconnect')
        const href = callback.replaceAll('&', '&amp;')
        return route.fulfill({ contentType: 'text/html; charset=utf-8',
          body: `<h1>Google OAuth giả lập</h1><a href="${href}">Xác nhận tài khoản đã chọn</a>` })
      }
      if (![app, base].includes(url.origin)) return route.abort()
      // All Gmail sync during this journey comes from the separate background worker.
      if (url.pathname === '/api/source-accounts/sync' && route.request().method() === 'POST') {
        return route.fulfill({ json: { success: true, synced: 0, pending: false } })
      }
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  async function login(address) {
    await page.goto(app + '/login')
    await field('Email').fill(address)
    await field('Mật khẩu').fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
  }
  const button = name => page.getByRole('button', { name, exact: true })
  const field = name => page.getByLabel(name, { exact: true })
  const attention = () => page.getByRole('region', { name: 'Cam kết cần chú ý' })
  const row = account => attention().locator('details').getByRole('listitem').filter({ hasText: account.address })
  const scheduled = () => page.getByRole('article', { name: scheduledSubject })
  async function showStatus() {
    await page.goto(app + '/inbox')
    await attention().locator('summary').click()
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
  }
  async function authorize(selected, expected, label, surface, result, subject = selected.address) {
    oauthDecision = { email: selected.address, subject, mailbox: selected.box, scopes: oauthScopes, withRefresh: true,
      expectedEmail: expected.address, requestedScopes: oauthScopes }
    await button(label + ' cho ' + expected.address).click()
    await page.getByRole('link', { name: 'Xác nhận tài khoản đã chọn' }).click()
    await page.waitForURL(url => url.origin === app && url.pathname === '/' + surface && url.searchParams.get('gmail_reconnect') === result)
  }

  try {
    await open()
    await page.clock.setFixedTime(new Date(start))
    await login(email)
    await page.goto(app + '/compose')
    await field('Từ').selectOption(a.id)
    await field('Đến').fill(scheduleRecipient)
    await field('Tiêu đề').fill(scheduledSubject)
    await field('Nội dung thư').fill('Tôi xác nhận đã tiếp nhận đơn hàng 4382.')
    await button('Lên lịch gửi').click()
    const dialog = page.getByRole('dialog', { name: 'Lên lịch gửi' })
    await dialog.getByLabel(/Ngày và giờ gửi/).fill(formatter.format(due).replace(' ', 'T'))
    await dialog.getByRole('button', { name: 'Xác nhận lên lịch' }).click()
    await page.waitForURL('**/outbox')
    await scheduled().waitFor()
    const approved = await scheduleState()
    storageState = await context.storageState()
    await browser.close()
    assert.equal(browser.isConnected(), false)

    a.deliver([message('a-background', 'Thư nhận nền ở Mua hàng')])
    b.deliver([message('b-background', 'Thư nhận nền ở Kho hàng')])
    expireIdleThrottle()
    assert.equal((await sync()).synced, 2)
    assert.ok(uid(a, 'a-background') && uid(b, 'b-background'))
    record('Independent sync worker ingests new mail for both Gmail accounts with Chrome closed', true)

    a.box.online = false
    a.deliver([message('a-transient', 'Thư giữ khi mất mạng')])
    b.deliver([message('b-transient', 'Kho tiếp tục nhận khi Mua hàng mất mạng')])
    expireIdleThrottle()
    const beforeOutage = checkpoint(a)
    const outage = await sync()
    assert.equal(outage.errors, 1)
    assert.deepEqual(checkpoint(a), beforeOutage)
    assert.ok(uid(b, 'b-transient'))
    await open()
    await showStatus()
    await row(a).getByText(/Gián đoạn · chờ thử lại/).waitFor()
    assert.equal(await row(a).getByRole('button').count(), 0)
    a.box.online = true
    expireBackoff(a)
    assert.equal((await sync()).synced, 1)
    assert.ok(uid(a, 'a-transient'))
    record('Transient Gmail interruption keeps the cursor and recovers automatically while the other account stays current', true)

    await browser.close()
    a.revoke()
    a.deliver([reply, message('shared-uid', 'Chứng từ Mua hàng đến khi mất quyền')])
    b.deliver([message('shared-uid', 'Chứng từ riêng Kho hàng')])
    expireIdleThrottle()
    const beforeRevoke = checkpoint(a)
    const fullReads = a.box.fullReads
    const refreshBefore = googleProvider.calls.refreshes
    assert.equal((await sync()).errors, 1)
    assert.equal(googleProvider.calls.refreshes - refreshBefore, 1)
    assert.deepEqual(checkpoint(a), { ...beforeRevoke, blocked: true })
    assert.equal(uid(a, reply.id), '')
    assert.ok(uid(b, 'shared-uid'))
    setClock(due)
    for (let tick = 0; tick < 2; tick++) assert.deepEqual(await send(), { claimed: 0, unrecorded: 0 })
    assert.equal(operationCount(), 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    assert.equal((await scheduleState()).reconnectRequired, true)
    assert.equal((await scheduleState()).version, approved.version)
    record('Confirmed revoked refresh stops only the affected account and pauses due mail before any send claim', true)

    await restartNext()
    await open({ width: 390, height: 844 })
    await showStatus()
    await row(a).getByText(/Cần kết nối lại Gmail/).waitFor()
    await row(a).getByText(/Lần hoàn tất gần nhất/).waitFor()
    await row(b).getByText(/Đã đồng bộ/).waitFor()
    await capture('01-mat-quyen-mot-tai-khoan')

    const foreign = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(foreign.error, null)
    const foreignContext = await browser.newContext({ serviceWorkers: 'block' })
    const foreignPage = await foreignContext.newPage()
    await foreignPage.goto(app + '/login')
    await foreignPage.getByLabel('Email', { exact: true }).fill(previousEmail)
    await foreignPage.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await foreignPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await foreignPage.waitForURL('**/inbox')
    assert.equal((await foreignPage.request.post(app + `/api/source-accounts/${a.id}/reconnect?surface=inbox`)).status(), 404)
    await foreignContext.close()

    const revision = account => vault.status({ userId, accountId: account.id }).then(status => status.revision)
    const beforeRevisions = await Promise.all([revision(a), revision(b)])
    await authorize(b, a, 'Kết nối lại Gmail', 'inbox', 'account_mismatch')
    await page.getByRole('alert').getByText(/đã chọn nhầm tài khoản/).waitFor()
    await capture('02-tu-choi-tai-khoan-chon-nham')
    assert.deepEqual(await Promise.all([revision(a), revision(b)]), beforeRevisions)
    assert.deepEqual(checkpoint(a), { ...beforeRevoke, blocked: true })
    await showStatus()
    await authorize(a, a, 'Kết nối lại Gmail', 'inbox', 'account_mismatch', 'different-google-subject')
    assert.deepEqual(await Promise.all([revision(a), revision(b)]), beforeRevisions)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('Restart preserves the reconnect requirement, and wrong mailbox, wrong Google subject, foreign owner and anonymous actor cannot replace credentials', true)

    await page.goto(app + '/outbox')
    await scheduled().getByText(/Đang chờ kết nối lại Gmail/).waitFor()
    await capture('03-cho-gui-khi-mat-quyen')
    await authorize(a, a, 'Kết nối lại Gmail để gửi', 'outbox', 'connected')
    await page.getByRole('status').getByText(/Đã kết nối lại Gmail/).waitFor()
    assert.deepEqual(await Promise.all([revision(a), revision(b)]), [beforeRevisions[0] + 1, beforeRevisions[1]])
    assert.deepEqual(checkpoint(a), { ...beforeRevoke, blocked: false })
    assert.equal((await sync()).synced, 2)
    assert.equal(a.box.fullReads, fullReads)
    assert.equal(uid(a, sourceMail.id), sourceId)
    assert.ok(uid(a, 'shared-uid'))
    assert.notEqual(uid(a, 'shared-uid'), uid(b, 'shared-uid'))
    const replyId = uid(a, reply.id)
    assert.match(replyId, /^[a-f0-9-]{36}$/)
    expireIdleThrottle()
    assert.equal((await sync()).synced, 0)
    await showStatus()
    await row(a).getByText(/Đã đồng bộ/).waitFor()
    const caughtUp = await request('/api/commitments/catchup')
    assert.equal(caughtUp.proposals.find(proposal => proposal.quote === quote)?.emailId, replyId)
    await page.setViewportSize({ width: 1440, height: 900 })
    await attention().getByRole('link', { name: 'Xem toàn bộ việc chờ xử lý' }).click()
    await page.getByRole('heading', { name: 'Việc chờ xử lý' }).waitFor()
    const sourceLink = page.locator(`a[href="/inbox?email=${replyId}"]`).getByText(/Mở email nguồn/)
    await sourceLink.click()
    await page.waitForURL('**/inbox?email=' + replyId)
    await page.getByText(quote, { exact: true }).last().waitFor()
    await capture('04-phan-hoi-bat-kip-co-nguon')
    record('Bound reauthorization keeps the account ID and checkpoint, catches up once, separates matching provider IDs, and opens the cited commitment reply', true)

    a.box.dropSendAcknowledgement = true
    const competing = await Promise.all([send(), send()])
    assert.equal(competing.reduce((count, tick) => count + tick.claimed, 0), 1)
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.equal(googleProvider.calls.sent.length, 1)
    assert.equal((await scheduleState()).state, 'unknown')
    await restartNext()
    setClock(due + 30_000)
    assert.equal((await send()).claimed, 1)
    await page.goto(app + '/outbox')
    await scheduled().getByText('Đã gửi', { exact: true }).waitFor()
    const confirmed = await scheduleState()
    const mirror = await request('/api/emails/' + confirmed.sentId)
    const [sent] = googleProvider.calls.sent
    assert.equal(mirror.email.message_id, sent.messageId)
    assert.equal(sent.from, a.address)
    assert.deepEqual(sent.to, [scheduleRecipient])
    assert.equal(sent.body, 'Tôi xác nhận đã tiếp nhận đơn hàng 4382.')
    assert.equal(confirmed.id, approved.id)
    assert.equal((await send()).claimed, 0)
    assert.equal(operationCount(), 1)
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.deepEqual(pageErrors, [])
    await capture('05-xac-minh-gui-mot-lan')
    record('Resumed approved send survives competing workers, lost Gmail acknowledgement and restart with exactly one provider send and one receipt', true)

    await writeFile(output + '/workflow.json', JSON.stringify({ status: 'PASS', chromeVersion, accounts: 2, nextRestarts: 2,
      providerSendAttempts: googleProvider.calls.sendAttempts, duplicateSends: 0, fullSyncsOnReconnect: 0,
      scheduleId: approved.id, messageId: sent.messageId, citedEmailId: replyId, axeViolations: 0,
    }, null, 2) + '\n')
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser?.close()
  }
}
