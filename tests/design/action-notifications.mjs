import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { gmailReadScope, gmailSendScope, googleEmailScope } from '../../src/lib/gmail/scopes.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const require = createRequire(import.meta.url)
const endpoint = '/api/notifications/action'
const bellName = 'Thông báo cần hành động'
const caseTitle = '[PO-7452] Giao bộ gá kho B'
const replyTitle = 'Re: Xác nhận danh sách đóng kiện'
const followupTitle = 'Re: Đối chiếu phiếu nhận kho'
const replyBody = 'Tôi đã kiểm tra danh sách. Kho B sẽ nhận bộ gá.'
const vendor = 'nha-cung-cap@example.test'
const zone = 'Asia/Ho_Chi_Minh'
const dayMs = 86_400_000
const start = Date.now() - 2 * dayMs
const iso = time => new Date(time).toISOString()
const dueLabel = days => new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date(start + days * dayMs))
const quote = `Tôi dời hạn sang ngày ${dueLabel(11)}.`
const json = { 'Content-Type': 'application/json' }

export async function rehearseActionNotifications({ app, base, email, password, userId, admin, appFetch,
  sql, googleProvider, previousEmail, restartNext, cronSecret, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const scopes = [gmailReadScope, googleEmailScope, gmailSendScope]
  async function mailbox(address) {
    const id = randomUUID()
    const mailbox = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: mailbox.tokens.access_token, refreshToken: mailbox.tokens.refresh_token,
      expiresAt: iso(Date.now() + 3_600_000), scope: mailbox.tokens.scope, googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { ...mailbox, id, address }
  }
  const buying = await mailbox('mua-hang@example.test')
  const finance = await mailbox('ke-toan@example.test')
  const mail = (id, subject, body, extra = {}) => ({
    id, subject, body, from: vendor, at: iso(start), threadId: id + '-thread', messageId: '<' + id + '@example.test>', ...extra,
  })
  const original = mail('po-7452', caseTitle, `Tôi sẽ giao bộ gá kho B trước ngày ${dueLabel(7)}.`)
  buying.deliver([original, mail('packing', 'Xác nhận danh sách đóng kiện', 'Gửi danh sách để duyệt.'),
    mail('warehouse', 'Đối chiếu phiếu nhận kho', 'Gửi phiếu nhận kho để đối chiếu.')])
  finance.deliver([mail('finance-initial', 'Xác nhận sổ đối chiếu', 'Bản đối chiếu tháng này.')])
  sql(`CREATE OR REPLACE FUNCTION private.reply_followup_today() RETURNS date LANGUAGE sql STABLE SET search_path=''
    AS $$ SELECT DATE '2026-11-13' $$;`)

  async function request(path, init) {
    const response = await appFetch(path, init)
    const data = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  const post = (path, data, headers = json) => request(path, { method: 'POST', headers, body: JSON.stringify(data) })
  const sync = () => post('/api/source-accounts/sync', { refresh: true })
  const worker = () => post('/api/cron/sync-emails', {}, { Authorization: 'Bearer ' + cronSecret, ...json })
  const uid = (account, id) => sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${account.id}'
    AND original_uid='${id}' AND NOT provider_deleted`).trim()
  const feed = async () => (await request(endpoint)).items
  await sync()
  const proposal = (await request('/api/commitments/catchup')).proposals.find(item => item.reference === 'PO-7452')
  assert.ok(proposal?.review)
  const ledger = await post('/api/commitments/detections', proposal.review.command, { ...json, 'Idempotency-Key': randomUUID() })
  assert.equal(ledger.version, 1)

  async function tracked(id, on) {
    const source = uid(buying, id)
    assert.match(source, /^[a-f0-9-]{36}$/)
    const workbench = await request('/api/replies?source=' + source)
    const act = data => post('/api/replies', data)
    const draft = await act({ action: 'save', source, id: null, revision: null, fingerprint: workbench.fingerprint,
      to: vendor, cc: '', body: 'Nhờ anh/chị xác nhận thông tin đã trao đổi.' })
    await act({ action: 'prepare', source, id: draft.id, revision: draft.revision })
    const sent = await act({ action: 'send', id: draft.id })
    assert.equal(sent.state, 'accepted')
    await act({ action: 'track', id: draft.id })
    await act({ action: 'schedule-followup', id: draft.id, on, expected: null })
    return { id: draft.id, messageId: sent.messageId, source }
  }
  const trackedReply = await tracked('packing', '2026-11-14')
  const due = await tracked('warehouse', '2026-11-14')
  const dispatches = googleProvider.calls.sendAttempts
  assert.equal(dispatches, 2)

  let browser, context, page, storageState, chrome, lostAck = false, dropped = 0, allowOAuth = false
  const captures = [], errors = []
  async function open(viewport = { width: 1440, height: 900 }) {
    browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
    chrome = browser.version()
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: zone, viewport, storageState, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') })
    await context.route('**/*', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.origin === 'https://accounts.google.com' && allowOAuth) {
        const callback = googleProvider.authorize(url, { email: finance.address, subject: finance.address,
          mailbox: finance.box, scopes, requestedScopes: scopes, expectedEmail: finance.address, withRefresh: true }, app, 'reconnect')
        return route.fulfill({ contentType: 'text/html; charset=utf-8',
          body: '<h1>Gmail giả lập</h1><a href="' + callback.replaceAll('&', '&amp;') + '">Xác nhận tài khoản</a>' })
      }
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === '/api/source-accounts/sync' && req.method() === 'POST') {
        return route.fulfill({ json: { success: true, synced: 0, pending: false } })
      }
      if (url.pathname === endpoint && req.method() === 'PATCH' && lostAck) {
        lostAck = false
        const result = await route.fetch()
        assert.ok(result.ok(), await result.text())
        dropped++
        await context.setOffline(true)
        return route.abort()
      }
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => errors.push({ path: new URL(page.url()).pathname, error: error.message }))
    await page.clock.setFixedTime(new Date('2026-11-14T02:00:00Z'))
  }
  const button = (name, target = page) => target.getByRole('button', { name, exact: true })
  const panel = () => page.getByRole('dialog', { name: bellName, exact: true })
  const rows = () => panel().getByRole('list', { name: 'Việc cần xử lý' }).getByRole('listitem')
  const row = title => rows().filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  const openPanel = () => button(bellName).click()
  const closePanel = () => button('Đóng hộp thoại', panel()).click()
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
    captures.push(name)
  }
  async function login(address) {
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(address)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
  }

  try {
    await open()
    await login(email)
    await openPanel()
    await panel().getByText('Không có việc cần xử lý.', { exact: true }).waitFor()
    storageState = await context.storageState()
    await browser.close()

    sql(`CREATE OR REPLACE FUNCTION private.reply_followup_today() RETURNS date LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT DATE '2026-11-14' $$;`)
    const change = mail('po-7452-change', 'Re: ' + caseTitle, quote, {
      at: iso(start + 3_600_000), threadId: original.threadId, inReplyTo: original.messageId,
    })
    const answer = mail('packing-reply', replyTitle, replyBody, {
      at: iso(start + 7_200_000), inReplyTo: trackedReply.messageId,
    })
    const promos = Array.from({ length: 48 }, (_, index) => mail('promo-' + index,
      'Ưu đãi theo tuần ' + index, 'Giảm giá cho khách đăng ký nhận bản tin.', { from: 'newsletter@offers.example.test' }))
    buying.deliver([change, answer, ...promos])
    finance.deliver([mail(answer.id, answer.subject, 'Thư cùng tiêu đề từ tài khoản khác.', { inReplyTo: trackedReply.messageId })])
    await sync()
    const answerId = uid(buying, answer.id), changeId = uid(buying, change.id)
    const decoyId = uid(finance, answer.id)
    assert.match(answerId, /^[a-f0-9-]{36}$/)
    assert.match(changeId, /^[a-f0-9-]{36}$/)
    assert.match(decoyId, /^[a-f0-9-]{36}$/)
    assert.notEqual(decoyId, answerId)
    finance.revoke()
    sql(`UPDATE public.source_accounts SET sync_status='pending' WHERE user_id='${userId}'`)
    await worker()
    assert.equal(sql(`SELECT private.gmail_needs_reconnect('${userId}','${finance.id}')`).trim(), 't')
    assert.equal(sql(`SELECT private.gmail_needs_reconnect('${userId}','${buying.id}')`).trim(), 'f')
    await restartNext()

    await open()
    await page.goto(app + '/inbox')
    await page.locator('button[aria-description="4 thông báo chưa xem"]').waitFor()
    await openPanel()
    await row(replyTitle).getByText(replyBody, { exact: true }).waitFor()
    assert.equal(await rows().count(), 4)
    assert.equal(await panel().getByText(/Ưu đãi theo tuần|Thư cùng tiêu đề từ tài khoản khác/).count(), 0)
    assert.equal(await row(replyTitle).getByRole('link', { name: 'Mở thư hồi đáp' }).getAttribute('href'), '/inbox?email=' + answerId)
    await row(replyTitle).getByText(buying.address, { exact: true }).waitFor()
    await row('Re: ' + caseTitle).getByText(quote, { exact: true }).waitFor()
    await row('Cần kết nối lại Gmail').getByText(finance.address, { exact: true }).waitFor()
    await row(followupTitle).getByText('Đến hẹn theo dõi', { exact: true }).waitFor()
    await capture('01-reopen')
    const initial = await feed()
    assert.equal(new Set(initial.map(item => item.id)).size, 4)
    assert.deepEqual(initial.map(item => item.kind), ['reconnect', 'commitment-change', 'followup', 'reply'])
    record('after Chrome and Next restart, actionable mail from two Gmail accounts appears once and 48 promotional emails stay out', true)

    const replyEvent = initial.find(item => item.kind === 'reply')
    lostAck = true
    await button('Đánh dấu đã xem', row(replyTitle)).click()
    await panel().getByText('Chưa xác nhận được trạng thái đã xem', { exact: true }).waitFor()
    assert.equal(dropped, 1)
    const saved = (await feed()).find(item => item.id === replyEvent.id)
    assert.ok(saved.seenAt)
    await context.setOffline(false)
    await page.reload()
    await openPanel()
    await row(replyTitle).getByText('Đã xem · Cần xử lý', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await panel().waitFor({ state: 'hidden' })
    assert.equal(await button(bellName).evaluate(element => element === document.activeElement), true)
    await openPanel()
    await sync()
    const afterSync = await feed()
    assert.deepEqual(afterSync.map(item => item.id), initial.map(item => item.id))
    const replay = await request(endpoint, { method: 'PATCH', headers: json, body: JSON.stringify({ id: replyEvent.id }) })
    assert.deepEqual(replay, { seen: true })
    assert.equal((await feed()).find(item => item.id === replyEvent.id).seenAt, saved.seenAt)
    assert.equal(sql(`SELECT count(*) FROM private.action_notification_seen WHERE user_id='${userId}' AND event_key='${replyEvent.id}'`).trim(), '1')
    await capture('02-seen-still-open')
    record('dropped acknowledgement and resync keep one view receipt, the same notification IDs and open work', true)

    await row(replyTitle).getByRole('link', { name: 'Mở thư hồi đáp' }).click()
    await page.waitForURL(url => url.searchParams.get('email') === answerId)
    await page.getByRole('heading', { name: replyTitle, exact: true }).waitFor()
    await page.goto(app + '/inbox')
    await openPanel()
    await row(replyTitle).getByRole('link', { name: 'Mở theo dõi' }).click()
    await page.waitForURL(url => url.searchParams.get('followup') === trackedReply.id)
    await button('Đã xử lý hồi đáp', page.locator('#followup-' + trackedReply.id)).click()
    await page.locator('#followup-' + trackedReply.id).waitFor({ state: 'hidden' })
    await openPanel()
    await row(replyTitle).waitFor({ state: 'hidden' })
    await row(followupTitle).getByRole('link', { name: 'Mở lịch theo dõi' }).click()
    await page.waitForURL(url => url.searchParams.get('followup') === due.id)
    await button('Dời hẹn', page.locator('#followup-' + due.id)).click()
    const date = page.getByRole('dialog', { name: 'Ngày kiểm tra lại' })
    await date.getByLabel('Ngày kiểm tra lại (giờ Việt Nam)', { exact: true }).fill('2026-11-17')
    await button('Lưu ngày kiểm tra', date).click()
    await date.waitFor({ state: 'hidden' })
    await openPanel()
    await row(followupTitle).waitFor({ state: 'hidden' })
    record('reply link opens the exact message; explicitly resolving it and moving another follow-up clear only the corresponding work', true)

    await row('Re: ' + caseTitle).getByRole('link', { name: 'Xem thay đổi cam kết' }).click()
    await page.waitForURL(url => url.pathname === '/commitments' && url.searchParams.get('source') === changeId)
    const sourceLink = page.getByRole('link', { name: 'Mở email nguồn · Re: ' + caseTitle, exact: true })
    await sourceLink.waitFor()
    assert.equal(await sourceLink.getAttribute('href'), '/inbox?email=' + changeId)
    assert.equal(sql(`SELECT version FROM private.commitments WHERE id='${ledger.id}' AND user_id='${userId}'`).trim(), '1')
    await button('Xem và xác nhận').click()
    await button('Xác nhận và ghi vào sổ', page.getByRole('dialog', { name: 'Xác nhận đề xuất' })).click()
    await page.getByText('Đã ghi vào sổ 1 đề xuất.', { exact: true }).waitFor()
    assert.equal(sql(`SELECT version FROM private.commitments WHERE id='${ledger.id}' AND user_id='${userId}'`).trim(), '2')
    await page.goto(app + '/inbox')
    await openPanel()
    await row('Cần kết nối lại Gmail').waitFor()
    assert.equal(await rows().count(), 1)
    record('commitment review links to the exact changed email and clears only after the ledger revision is confirmed', true)

    await button('Đánh dấu đã xem', row('Cần kết nối lại Gmail')).click()
    await row('Cần kết nối lại Gmail').getByText('Đã xem · Cần xử lý', { exact: true }).waitFor()
    allowOAuth = true
    await button('Kết nối lại Gmail cho ' + finance.address, panel()).click()
    await page.getByRole('link', { name: 'Xác nhận tài khoản', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('gmail_reconnect') === 'connected')
    await openPanel()
    await panel().getByText('Không có việc cần xử lý.', { exact: true }).waitFor()
    assert.equal(googleProvider.calls.sendAttempts, dispatches)
    record('viewing a Gmail alert leaves it active and successful OAuth removes it without sending mail', true)

    finance.revoke()
    sql(`UPDATE public.source_accounts SET sync_status='pending' WHERE id='${finance.id}' AND user_id='${userId}'`)
    await worker()
    await closePanel()
    await page.setViewportSize({ width: 390, height: 844 })
    await openPanel()
    await row('Cần kết nối lại Gmail').getByText('Chưa xem · Cần xử lý', { exact: true }).waitFor()
    const [newAlert] = await feed()
    assert.notEqual(newAlert.id, initial.find(item => item.kind === 'reconnect').id)
    await capture('03-mobile')

    const admission = await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })
    assert.equal(admission.error, null)
    const switcher = await context.newPage()
    await switcher.goto(app + '/commitments')
    await button('Tài khoản của bạn', switcher).click()
    await button('Đăng xuất', switcher).click()
    await switcher.waitForURL('**/login')
    await panel().waitFor({ state: 'hidden' })
    assert.equal(await panel().getByText(finance.address, { exact: true }).count(), 0)
    await login(previousEmail)
    await openPanel()
    await panel().getByText('Không có việc cần xử lý.', { exact: true }).waitFor()
    assert.equal(await page.getByText(finance.address, { exact: true }).count(), 0)
    assert.equal((await page.request.patch(app + endpoint, { data: { id: newAlert.id } })).status(), 404)
    assert.equal((await page.request.patch(app + endpoint, { data: { id: replyEvent.id } })).status(), 404)
    assert.equal((await fetch(app + endpoint)).status, 401)
    assert.equal(sql(`SELECT count(*) FROM private.action_notification_seen WHERE user_id<>'${userId}'`).trim(), '0')
    assert.deepEqual(errors, [])
    record('a new revocation gets an unread notification; another tenant and anonymous caller cannot read or mark prior items', true)
    await writeFile(output + '/workflow.json', JSON.stringify({ chrome, accounts: 2, promotionalMessages: promos.length,
      reopenedChrome: true, backgroundSync: true, initiallyActionable: initial.length, lostViewAcknowledgements: dropped,
      mailDispatchesDuringReview: googleProvider.calls.sendAttempts - dispatches, captures }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser?.close()
  }
}
