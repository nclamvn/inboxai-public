import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const json = { 'Content-Type': 'application/json' }
const catchup = '/api/commitments/catchup'
const syncPath = '/api/source-accounts/sync'
const references = ['PO-4382', 'QA-5087', 'LG-5391', 'PO-6124', 'QA-6932', 'LG-7581']
const quotes = [
  'Tôi dời hạn sang ngày 16/11/2026.',
  'Tôi đã hoàn thành cam kết.',
  'Tôi chưa thể xác nhận lịch giao ngày 17/11/2026.',
  'Tôi dời hạn sang ngày 18/11/2026.',
  'Tôi chuyển trách nhiệm cho dieu-phoi@example.test.',
  'Đã xác nhận với điều phối: bên tôi sẽ giao ngày 19/11/2026, thay lịch 10/11/2026.',
]
const senders = ['linh@linhkien.example.test', 'binh@kiemdinh.example.test', 'vy@vanchuyen.example.test',
  'an@thietbi.example.test', 'ngoc@laprap.example.test', 'tuan@vanchuyen.example.test']
const deliverables = ['bản xác nhận 200 bộ gá', 'phiếu kiểm định kho lạnh', 'bảng lịch giao tuyến Bắc',
  'chứng từ nhập máy đo', 'biên bản bàn giao cụm lắp', 'xác nhận đặt xe']
const origin = index => ({
  id: 'origin-' + index, from: senders[index], subject: `[${references[index]}] ${deliverables[index]}`,
  at: `2026-11-02T01:0${index}:00Z`, body: `Tôi sẽ gửi ${deliverables[index]} trước ngày 12/11/2026.`,
})
const reply = (index, day) => ({
  ...origin(index), id: 'reply-' + index, subject: 'Re: ' + origin(index).subject,
  at: `2026-11-0${day + 2}T02:0${index}:00Z`, body: quotes[index],
})
const noise = (day, account, index) => ({
  id: `bulk-${day}-${account}-${index}`, from: 'notifications@portal.example.test',
  at: `2026-11-0${day + 2}T08:${String(index).padStart(2, '0')}:00Z`,
  subject: ['Báo cáo đã tải lên', 'Biên nhận kho', 'Thông báo cổng nhà cung cấp', 'Lịch bảo trì'][index % 4] + ` ${day}.${index}`,
  body: ['Tệp tổng hợp tự động đã sẵn sàng.', 'Hệ thống đã ghi nhận kiện hàng.', 'Đây là thông báo tự động.', 'Cổng đã cập nhật lịch bảo trì.'][index % 4],
})

export async function rehearseInboxCatchup({ app, base, email, password, userId, admin, login, appFetch, sql, googleProvider,
  previousEmail, previousId, anon, anonymousClient, restartNext, smtpWire, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const accounts = await Promise.all(['mua-hang@example.test', 'van-hanh@example.test'].map(async address => {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address)
    const tokens = fixture.tokens
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: tokens.scope, googleSubject: address, sendDisabled: true,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }))
  const get = async (path, init) => {
    const res = await appFetch(path, init)
    const data = await res.json()
    assert.ok(res.ok, `${path} returned ${res.status}: ${JSON.stringify(data)}`)
    return data
  }
  const write = (path, body, headers = {}) => get(path, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) })
  const readLedger = () => get('/api/commitments?group=waiting')
  const checkpoints = () => sql(`SELECT account_id,revision,cursor FROM private.account_sync WHERE user_id='${userId}' ORDER BY account_id`).trim()
  const syncCounts = () => sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND source_account_id IS NOT NULL
    GROUP BY source_account_id ORDER BY count(*)`).trim().split('\n').map(Number)
  const stage = name => { phase = name; console.log('CATCHUP:', name) }
  const started = performance.now()
  let phase = 'tạo sáu cam kết gốc'
  for (let index = 0; index < references.length; index++) accounts[index % 2].deliver([origin(index)])
  const firstSync = await write(syncPath, { refresh: true })
  assert.equal(firstSync.synced, 6)
  const baseline = new Map()
  const first = await get(catchup)
  assert.equal(first.proposals.length, 6)
  for (const proposal of first.proposals) {
    const result = await write('/api/commitments/detections', proposal.review.command, { 'Idempotency-Key': randomUUID() })
    baseline.set(proposal.reference, result.id)
  }
  assert.equal((await get(catchup)).proposals.length, 0)
  record('two provider checkpoints and six approved commitments exist before absence', (await readLedger()).items.length === 6 && syncCounts().join() === '3,3')

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let page
  const captures = []
  const pageErrors = []
  async function capture(name) {
    const violations = await audit(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.deepEqual({ violations, overflow }, { violations: [], overflow: false })
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled', fullPage: true })
    captures.push({ name, viewport: page.viewportSize(), axeViolations: 0, overflow })
  }
  try {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    const newPage = async () => {
      const next = await context.newPage()
      next.setDefaultTimeout(15_000)
      next.on('pageerror', error => pageErrors.push(error.message))
      return next
    }
    page = await newPage()
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
    await page.getByRole('region', { name: 'Cam kết cần chú ý' }).waitFor()
    await page.close()

    stage('ba ngày vắng mặt, 126 thư mới được giữ tại hai máy chủ giả lập')
    for (let day = 1; day <= 3; day++) {
      for (let i = 0; i <= 1; i++) accounts[i].deliver([
        reply((day - 1) * 2 + i, day),
        ...Array.from({ length: 20 }, (_, n) => noise(day, i, n)),
      ])
    }
    record('absence retains 63 new messages per provider with no browser open', accounts.every(account => account.box.messages.size === 66) && syncCounts().join() === '3,3')

    // The corpus advances by three days in seconds. Age the last successful poll
    // by the same interval so the production due-work throttle sees the absence.
    sql(`UPDATE public.source_accounts SET last_sync_at=clock_timestamp()-interval '3 days' WHERE user_id='${userId}'`)

    const attention = () => page.getByRole('region', { name: 'Cam kết cần chú ý' })
    const status = () => attention().locator('details')
    const row = address => status().getByRole('listitem').filter({ hasText: address })
    async function refreshInbox() {
      await page.goto(app + '/inbox')
      await status().getByText(/Trạng thái đồng bộ/).click()
    }
    const clickSync = async () => {
      const received = page.waitForResponse(response => response.url() === app + syncPath && response.request().method() === 'POST' && response.request().postDataJSON()?.refresh === true)
      await status().getByRole('button', { name: 'Đồng bộ ngay' }).click()
      return (await received).json()
    }

    stage('mất kết nối trình duyệt rồi mất kết nối riêng tài khoản Vận hành')
    page = await newPage()
    accounts[1].box.online = false
    await refreshInbox()
    const before = checkpoints()
    await context.setOffline(true)
    await status().getByRole('button', { name: 'Đồng bộ ngay' }).click()
    await status().getByText('Chưa kết nối được. Hãy thử lại.').waitFor()
    assert.equal(checkpoints(), before)
    const automaticRetry = page.waitForResponse(response => response.url() === app + syncPath
      && response.request().method() === 'POST' && response.request().postDataJSON()?.mode === 'incremental')
    await context.setOffline(false)
    assert.ok((await automaticRetry).ok())
    await row(accounts[1].address).getByText(/Gián đoạn/).waitFor()
    await row(accounts[0].address).getByText(/Đang bắt kịp/).waitFor()
    record('actual browser offline leaves cursors intact and provider outage does not stop the healthy account',
      accounts[1].box.drops > 0 && syncCounts()[0] === 3 && syncCounts()[1] >= 33)
    await capture('account-interruption')

    const accountA = catchup + '?account=' + accounts[0].id
    const aBefore = (await get(accountA)).proposals.map(proposal => proposal.proposalId)
    assert.ok(aBefore.length >= 1)
    const beforeRestart = checkpoints()
    stage('khởi động lại Next, giữ DB, lịch sử hộp thư và công việc chờ duyệt')
    await restartNext()
    assert.equal(checkpoints(), beforeRestart)
    assert.deepEqual((await get(accountA)).proposals.map(proposal => proposal.proposalId), aBefore)
    accounts[1].box.online = true
    await delay(5_200)
    await refreshInbox()
    for (let attempt = 0; attempt < 7; attempt++) {
      if (syncCounts().join() === '66,66') break
      await clickSync()
    }
    await row(accounts[0].address).getByText(/Đã đồng bộ/).waitFor()
    await row(accounts[1].address).getByText(/Đã đồng bộ/).waitFor()
    record('process restart resumes independent Gmail history cursors and imports 132 unique mails', syncCounts().join() === '66,66'
      && accounts.every(account => account.box.fullReads === 1 && account.box.historyStarts.at(-1) >= 103)
      && Number(sql(`SELECT count(DISTINCT (source_account_id,original_uid)) FROM public.emails
        WHERE user_id='${userId}' AND source_account_id IS NOT NULL`)) === 132)

    stage('kiểm tra đầy đủ phản hồi cũ và mở chứng cứ')
    const pageData = await get(catchup)
    const byReference = new Map(pageData.proposals.map(proposal => [proposal.reference, proposal]))
    assert.deepEqual([...byReference.keys()].sort(), [...references].sort())
    const critical = byReference.get(references[0])
    const newer = Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND received_at >
      (SELECT received_at FROM public.emails WHERE id='${critical.emailId}')`))
    assert.ok(newer > 24)
    const filtered = await get(accountA)
    assert.deepEqual(filtered.proposals.map(proposal => proposal.reference).sort(), [references[0],references[2],references[4]].sort())
    await attention().getByRole('link', { name: 'Xem toàn bộ việc chờ xử lý' }).click()
    await page.getByRole('heading', { name: 'Việc chờ xử lý' }).waitFor()
    const card = index => page.getByRole('listitem').filter({ hasText: quotes[index] })
    for (const index of references.keys()) await card(index).getByText(quotes[index], { exact: true }).waitFor()
    record('all six reviews are visible across both accounts, including a critical reply older than the latest 24', pageData.proposals.length === 6)
    await capture('review-desktop')
    await card(0).getByRole('link', { name: /Mở email nguồn/ }).click()
    await page.waitForURL('**/inbox?email=' + critical.emailId)
    await page.getByText(quotes[0], { exact: true }).last().waitFor()
    await page.goto(app + '/commitments?view=catchup')
    await card(0).getByRole('button', { name: 'Xem và xác nhận' }).click()
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    await dialog.getByText(quotes[0], { exact: true }).waitFor()
    const approval = page.waitForResponse(response => response.url().endsWith('/api/commitments/detections') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Xác nhận và ghi vào sổ' }).click()
    const approvalResponse = await approval
    assert.ok(approvalResponse.ok())
    const request = approvalResponse.request()
    const receipt = await write('/api/commitments/detections', request.postDataJSON(), {
      'Idempotency-Key': request.headers()['idempotency-key'],
    })
    assert.deepEqual(receipt, { id: baseline.get(references[0]), version: 2, replayed: true })
    await page.getByRole('status').filter({ hasText: 'Đã ghi vào sổ 1 đề xuất' }).waitFor()

    await card(2).getByText(/chưa xác nhận lịch/).waitFor()
    await card(5).getByText(/Hạn cũ trong thư khác/).waitFor()
    await card(2).getByRole('button', { name: 'Đã kiểm tra, giữ nguyên sổ' }).click()
    await page.getByRole('status').filter({ hasText: 'Đã kiểm tra và giữ nguyên sổ' }).waitFor()
    // Replay the same provider evidence, including the acknowledged and approved sources.
    for (let i = 0; i <= 1; i++) accounts[i].deliver([reply(i, 1), reply(i + 2, 2)])
    await write(syncPath, { refresh: true })
    await page.reload()
    await card(5).getByText(quotes[5], { exact: true }).waitFor()
    const after = await get(catchup)
    assert.deepEqual(after.proposals.map(proposal => proposal.reference).sort(), [references[1], references[3], references[4], references[5]].sort())
    const approved = await get('/api/commitments/' + baseline.get(references[0]))
    const held = await get('/api/commitments/' + baseline.get(references[2]))
    record('approval is idempotent, ambiguity preserves confirmed terms, replay and reload preserve the four remaining reviews',
      approved.version === 2 && approved.state.dueOn === '2026-11-16' && held.version === 1 && held.state.dueOn === '2026-11-12'
      && approved.history.length === 2 && syncCounts().join() === '66,66')

    stage('phân quyền, trạng thái sau cùng và khả năng truy cập')
    const uncertain = byReference.get(references[2])
    const ack = { p_email: uncertain.emailId, p_token: uncertain.catchupToken, p_hash: uncertain.proposalId.split(':')[1] }
    const foreign = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.equal((await foreign.auth.signInWithPassword({ email: previousEmail, password })).error, null)
    const params = { p_accounts: [accounts[0].id], p_before_id: null, p_source_id: uncertain.emailId, p_focus: false }
    const foreignRead = await foreign.rpc('read_commitment_catchup', params)
    assert.deepEqual(foreignRead.data, { messages: [], nextBeforeId: null })
    assert.ok((await foreign.rpc('dismiss_commitment_catchup', ack)).error)
    assert.ok((await login.rpc('pending_commitment_catchup', { p_actor: previousId })).error)
    assert.ok((await anonymousClient.rpc('read_commitment_catchup', params)).error)
    record('second tenant, anon and authenticated callers cannot cross the queue boundaries', true)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    assert.equal(smtpWire.state.messages.length, 0)
    assert.equal(Number(sql('SELECT count(*) FROM private.mail_send_operations')), 0)
    record('catch-up, provider retry and browser approvals generate no reminder or outbound send', true)

    await page.setViewportSize({ width: 390, height: 844 })
    await capture('review-mobile')
    await page.setViewportSize({ width: 820, height: 1180 })
    await capture('review-tablet')
    await refreshInbox()
    await capture('accounts-recovered')
    assert.deepEqual(pageErrors, [])
    record('desktop, tablet and mobile captures have no axe violations, page errors or horizontal overflow', true)
    writeFileSync(output + '/workflow.json', JSON.stringify({
      simulatedDays: 3, accounts: 2, arrivedDuringAbsence: 126, uniqueMail: 132, approvedBeforeAbsence: 6,
      pendingAtReturn: pageData.proposals.length, newerThanCritical: newer, pendingAfterApprovalAndAcknowledgement: after.proposals.length,
      providerSocketDrops: accounts[1].box.drops, outboundAttempts: 0, durationMs: Math.round(performance.now() - started), captures,
    }, null, 2) + '\n')
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {})
    throw new Error(phase + ' · ' + error.message, { cause: error })
  } finally {
    await browser.close()
  }
}
