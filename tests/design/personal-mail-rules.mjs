import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const endpoint = '/api/personal-mail-rules'
const syncEndpoint = '/api/source-accounts/sync'
const sender = 'updates@vendor.example.test'
const titles = {
  original: 'Ưu đãi vật tư tháng này',
  edit: 'Bảng giá gửi chung',
  old: 'Thông báo cũ của nhà cung cấp',
  alert: 'Giao dịch bất thường tại kho',
  crossAccount: 'Bảng giá cho chi nhánh',
  stale: 'Thông báo đến trong lúc xem trước',
  next: 'Ưu đãi sau đồng bộ',
  nextAlert: 'Đăng nhập bất thường sau đồng bộ',
  afterUndo: 'Thông tin mới sau khi hoàn tác',
  futureOnly: 'Thư mới của chi nhánh',
}
const post = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

export async function rehearsePersonalMailRules({
  app, base, email, password, userId, admin, appFetch, sql, googleProvider, previousEmail, anon, restartNext, record, output,
}) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function createMailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: true,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const a = await createMailbox('mua-hang@example.test')
  const b = await createMailbox('chi-nhanh@example.test')
  const now = Date.now()
  const message = (id, subject, minutes = 35, from = sender) => ({
    id, from, subject, body: 'Thông tin nhà cung cấp để kiểm thử quy tắc phân luồng.',
    at: new Date(now - minutes * 60_000).toISOString(), labelIds: ['INBOX', 'UNREAD'],
  })
  a.deliver([
    message('original', titles.original), message('edit', titles.edit, 36),
    message('old', titles.old, 2_000), message('alert', titles.alert, 37, sender.toUpperCase()),
    ...Array.from({ length: 52 }, (_, index) => message('mail-a-' + index, 'Hồ sơ kho ' + index, 80 + index, 'other@example.test')),
  ])
  b.deliver([
    message('original', titles.crossAccount, 38),
    ...Array.from({ length: 55 }, (_, index) => message('mail-b-' + index, 'Hồ sơ chi nhánh ' + index, 80 + index, 'other@example.test')),
  ])
  const total = () => Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND sync_namespace='gmail'`))
  const id = (account, uid) => sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${account.id}'
    AND original_uid='${uid}'`).trim()
  async function sync() {
    const response = await appFetch(syncEndpoint, post({ refresh: true }))
    assert.ok(response.ok, await response.text())
  }
  for (let run = 0; run < 5 && total() < 112; run++) await sync()
  assert.equal(total(), 112)
  assert.notEqual(id(a, 'original'), id(b, 'original'))
  record('112 provider messages imported across two isolated Gmail accounts with a shared sender and provider ID', true)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const captures = []
  const pageErrors = []
  let context, page, abortConfirm = false, abortUndo = false
  const recordedRequests = []
  async function open(viewport, storageState) {
    context = await browser.newContext({ locale: 'vi-VN', viewport, storageState, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === endpoint && req.method() === 'POST') {
        const command = req.postDataJSON()
        recordedRequests.push(command)
        if ((command.action === 'confirm' && abortConfirm) || (command.action === 'undo' && abortUndo)) {
          if (command.action === 'confirm') abortConfirm = false
          else abortUndo = false
          const result = await route.fetch()
          assert.ok(result.ok(), await result.text())
          return route.abort()
        }
      }
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  const button = name => page.getByRole('button', { name, exact: true })
  const dialog = name => page.getByRole('dialog', { name, exact: true })
  const opener = subject => page.getByRole('button', { name: new RegExp('^Mở thư: ' + subject + ',') })
  const category = subject => opener(subject).locator('..').locator('[data-category]:visible')
  async function checkCategory(subject, label) {
    await category(subject).filter({ hasText: new RegExp('^' + label + '$') }).waitFor()
  }
  async function inbox() {
    await page.goto(app + '/inbox')
    await page.getByRole('heading', { name: 'Hộp thư', exact: true }).waitFor()
    await opener(titles.crossAccount).waitFor()
  }
  async function edit(subject, value, mobile = false) {
    await opener(subject).click()
    await page.getByRole('heading', { name: subject, exact: true }).waitFor()
    if (mobile) await button('Thêm thao tác').click()
    await button('Đổi nhãn').click()
    await dialog('Đổi nhãn thư').getByLabel('Nhãn mới').selectOption(value)
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
    captures.push(name)
  }
  async function syncInBrowser() {
    const info = page.getByText('Trạng thái đồng bộ', { exact: false }).first()
    await info.click()
    const response = page.waitForResponse(res => res.url() === app + syncEndpoint
      && res.request().method() === 'POST' && res.request().postDataJSON()?.refresh === true)
    await button('Đồng bộ ngay').click()
    assert.ok((await response).ok())
  }
  function assertBaseline(account, uid) {
    const emailId = id(account, uid)
    assert.match(emailId, /^[a-f0-9-]{36}$/)
    const comparison = sql(`
      SELECT set_config('request.jwt.claims', jsonb_build_object('sub','${userId}')::text, false);
      SELECT e.category IS NOT DISTINCT FROM public.mail_category(e) FROM public.emails e WHERE id='${emailId}';
    `).trim().split('\n').at(-1)
    assert.equal(comparison, 't')
    assert.equal(Number(sql(`SELECT count(*) FROM private.personal_mail_categories WHERE email_id='${emailId}'`)), 0)
  }

  const effective = async (account, uid) => {
    const res = await appFetch('/api/emails/' + id(account, uid))
    assert.ok(res.ok)
    return (await res.json()).email.category
  }

  try {
    await open({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
    await opener(titles.original).waitFor()
    assert.equal(await opener(titles.old).count(), 0)
    await edit(titles.original, 'promotion')
    await button('Xem trước quy tắc').click()
    let preview = dialog('Xem trước quy tắc')
    await preview.getByText(a.address, { exact: true }).waitFor()
    await preview.getByText(sender, { exact: true }).waitFor()
    await preview.getByText('4 thư sẽ được gán nhãn', { exact: true }).waitFor()
    await preview.getByText(titles.old, { exact: true }).waitFor()
    assert.equal(await preview.getByText(titles.crossAccount, { exact: true }).count(), 0)
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_rules')), 0)
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_categories')), 0)
    await capture('01-preview')
    record('read-only preview lists the exact scoped account and all four matches including a mail outside the loaded Inbox page', true)

    a.deliver([message('stale', titles.stale, 34)])
    await sync()
    assert.equal(total(), 113)
    await button('Tạo quy tắc').click()
    await dialog('Đổi nhãn thư').getByRole('alert').getByText(/Phạm vi đã thay đổi/).waitFor()
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_rules')), 0)
    await button('Xem trước quy tắc').click()
    preview = dialog('Xem trước quy tắc')
    await preview.getByText('5 thư sẽ được gán nhãn', { exact: true }).waitFor()
    await preview.getByText(titles.stale, { exact: true }).waitFor()
    abortConfirm = true
    await button('Tạo quy tắc').click()
    await preview.getByRole('alert').getByText(/Mất kết nối/).waitFor()
    await button('Tạo quy tắc').click()
    await page.getByRole('status').filter({ hasText: 'Đã tạo quy tắc và đổi nhãn cho 5 thư.' }).waitFor()
    const confirmations = recordedRequests.filter(command => command.action === 'confirm')
    assert.deepEqual(confirmations.at(-2), confirmations.at(-1))
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_rules')), 1)
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_categories')), 5)
    record('new provider mail invalidates preview; lost confirm response retries the same operation and applies five labels once', true)

    await inbox()
    await opener(titles.alert).locator('[data-priority="urgent"]').waitFor()
    await checkCategory(titles.alert, 'Quảng cáo')
    assertBaseline(b, 'original')
    await capture('02-urgent-still-visible')
    record('an abnormal transaction still displays Khẩn alongside Quảng cáo, with no label change in the second account', true)

    a.deliver([message('next', titles.next, 33), message('next-alert', titles.nextAlert, 32)])
    b.deliver([message('next', 'Ưu đãi chi nhánh sau đồng bộ', 33)])
    await syncInBrowser()
    await opener(titles.nextAlert).locator('[data-priority="urgent"]').waitFor()
    await checkCategory(titles.nextAlert, 'Quảng cáo')
    await opener('Ưu đãi chi nhánh sau đồng bộ').waitFor()
    assertBaseline(b, 'next')
    assert.equal(total(), 116)
    assert.equal(await effective(a, 'next'), 'promotion')
    const beforeRestart = accountsCursor()
    await restartNext()
    a.deliver([message('next', titles.next, 33), message('next-alert', titles.nextAlert, 32)])
    await sync()
    assert.equal(total(), 116)
    assert.notEqual(accountsCursor(), beforeRestart)
    assert.equal(Number(sql('SELECT count(*) FROM private.personal_mail_categories')), 7)
    record('browser resync classifies new arrivals in the chosen mailbox, and Gmail history replay after restart creates no duplicate', true)

    await inbox()
    if (!await opener(titles.edit).count()) await page.getByRole('button', { name: /^Đọc sau/ }).click()
    await edit(titles.edit, 'transaction')
    await button('Chỉ đổi thư này').click()
    await page.getByRole('status').filter({ hasText: 'Đã đổi nhãn cho thư này.' }).waitFor()
    await checkCategory(titles.edit, 'Giao dịch')
    assert.equal(await effective(a, 'edit'), 'transaction')
    const outsider = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.equal((await outsider.auth.signInWithPassword({ email: previousEmail, password })).error, null)
    assert.deepEqual((await outsider.rpc('list_personal_mail_rules')).data, [])
    assert.equal((await outsider.rpc('undo_personal_mail_rule', { p_id: confirmations.at(-1).id })).error?.code, 'PT404')
    record('manual correction replaces the applied category, and another tenant cannot list or undo the rule', true)

    await inbox()
    await button('Quy tắc').click()
    await dialog('Quy tắc phân luồng').getByText(a.address, { exact: true }).waitFor()
    await button('Hoàn tác quy tắc').click()
    abortUndo = true
    await button('Xác nhận hoàn tác').click()
    await dialog('Quy tắc phân luồng').getByRole('alert').getByText(/Mất kết nối/).waitFor()
    await button('Xác nhận hoàn tác').click()
    await dialog('Quy tắc phân luồng').getByRole('status').getByText('Đã hoàn tác 6 thư · Giữ 1 thư đã sửa tay').waitFor()
    await capture('03-undo-receipt')
    assertBaseline(a, 'old')
    assert.equal(await effective(a, 'edit'), 'transaction')
    assertBaseline(a, 'next')
    assertBaseline(b, 'original')
    await button('Đóng hộp thoại').click()
    await opener(titles.nextAlert).locator('[data-priority="urgent"]').waitFor()
    a.deliver([message('after-undo', titles.afterUndo, 31)])
    await syncInBrowser()
    await opener(titles.afterUndo).waitFor()
    assertBaseline(a, 'after-undo')
    record('undo survives response loss, restores six rule labels, keeps the manual label and stops classifying new arrivals', true)

    const storageState = await context.storageState()
    await context.close()
    await open({ width: 390, height: 844 }, storageState)
    await inbox()
    await edit(titles.crossAccount, 'newsletter', true)
    await button('Xem trước quy tắc').click()
    preview = dialog('Xem trước quy tắc')
    await preview.getByText(b.address, { exact: true }).waitFor()
    await preview.getByRole('checkbox', { name: /Áp dụng cả/ }).click()
    await preview.getByText('Quy tắc chỉ áp dụng cho thư mới.').waitFor()
    await capture('04-future-only-mobile')
    await button('Tạo quy tắc').click()
    await page.getByRole('status').filter({ hasText: 'Đã tạo quy tắc cho thư mới.' }).waitFor()
    b.deliver([message('future-only', titles.futureOnly, 30)])
    await sync()
    assertBaseline(b, 'original')
    assert.equal(await effective(b, 'future-only'), 'newsletter')
    assert.equal(googleProvider.calls.modifications.length, 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    assert.deepEqual(pageErrors, [])
    record('mobile future-only creation leaves existing labels intact and Gmail receives no label modifications or sends', true)
    await writeFile(output + '/workflow.json', JSON.stringify({
      chrome: browser.version(), accounts: 2, initialMessages: 112, totalMessages: total(), restored: 6,
      keptManual: 1, providerWrites: 0, captures,
    }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }

  function accountsCursor() {
    return sql(`SELECT account_id,revision,cursor FROM private.account_sync WHERE user_id='${userId}' ORDER BY account_id`).trim()
  }
}
