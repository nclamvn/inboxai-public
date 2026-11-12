import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const filename = 'Biên bản nghiệm thu.csv'
const filenameQuery = 'bien ban nghiem thu.csv'
const oldTitle = 'Hồ sơ hiệu chuẩn kho M-041'
const branchTitle = 'Hồ sơ kiểm định chi nhánh M-041'
const sender = 'dieu-phoi@example.test'
const api = '/api/mail-lookup'
const post = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function rehearseMailLookup({
  app, base, email, password, userId, admin, appFetch, sql, googleProvider, previousId, record, output,
}) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: true,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const first = await mailbox('kho-trung-tam@example.test')
  const second = await mailbox('chi-nhanh@example.test')
  const firstBytes = Buffer.from('Kho trung tâm,M-041,48\n')
  const secondBytes = Buffer.from('Chi nhánh,M-041,72\n')
  const now = Date.now()
  const at = minutes => new Date(now - minutes * 60_000).toISOString()
  const oldMessage = (subject, bytes) => ({
    id: 'old-file', subject, from: sender, at: at(90_000), body: 'Vui lòng lưu bản ghi bàn giao để đối chiếu cuối kỳ.',
    attachments: [{ filename, contentType: 'text/csv', data: bytes.toString('base64') }],
  })
  for (const [index, account, subject, bytes] of [[0, first, oldTitle, firstBytes], [1, second, branchTitle, secondBytes]]) {
    account.deliver([
      oldMessage(subject, bytes),
      ...Array.from({ length: 12 }, (_, number) => ({
        id: 'check-' + number, subject: 'Phiếu kiểm đếm ' + index + '-' + number,
        from: 'kiem-dem@example.test', at: at(1_500), body: 'Bản ghi đếm số kiện hàng của ca trực.',
      })),
      ...Array.from({ length: 97 }, (_, number) => ({
        id: 'filler-' + number, subject: 'Lịch nhập hàng ' + index + '-' + number,
        from: 'kho@example.test', at: at(80 + number), body: 'Tổng hợp lịch xe và khu vực tiếp nhận.',
      })),
    ])
  }
  const count = () => Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}' AND sync_namespace='gmail'`))
  for (let run = 0; run < 8 && count() < 220; run++) {
    const response = await appFetch('/api/source-accounts/sync', post({ refresh: true }))
    assert.ok(response.ok, await response.text())
  }
  assert.equal(count(), 220)
  const id = account => sql(`SELECT id FROM public.emails WHERE user_id='${userId}'
    AND source_account_id='${account.id}' AND original_uid='old-file'`).trim()
  const firstId = id(first), secondId = id(second)
  assert.match(firstId, /^[0-9a-f-]{36}$/)
  assert.match(secondId, /^[0-9a-f-]{36}$/)
  assert.notEqual(firstId, secondId)
  assert.equal(Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}'
    AND received_at>(SELECT received_at FROM public.emails WHERE id='${firstId}')`)), 218)
  record('220 messages synced through two loopback Gmail accounts; both target files are outside the newest 50', true)

  const foreignAccount = randomUUID(), foreignEmail = randomUUID(), hiddenEmail = randomUUID(), foreignFile = randomUUID()
  assert.equal((await admin.from('source_accounts').insert({
    id: foreignAccount, user_id: previousId, email_address: 'ngoai-pham-vi@example.test', provider: 'custom',
  })).error, null)
  assert.equal((await admin.from('emails').insert([
    { id: foreignEmail, user_id: previousId, source_account_id: foreignAccount, from_address: sender, subject: 'Thư ngoài phạm vi', is_deleted: false },
    { id: hiddenEmail, user_id: userId, source_account_id: first.id, from_address: sender, subject: 'Thư đã xóa', is_deleted: true },
  ])).error, null)
  assert.equal((await admin.from('attachments').insert([
    { id: foreignFile, email_id: foreignEmail, filename, size: 1 },
    { id: randomUUID(), email_id: hiddenEmail, filename, size: 1 },
  ])).error, null)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let page, context
  const captures = [], downloads = [], pageErrors = []
  async function open(viewport, storageState) {
    context = await browser.newContext({
      locale: 'vi-VN', viewport, storageState, acceptDownloads: true, serviceWorkers: 'block', reducedMotion: 'reduce',
    })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }

  const button = name => page.getByRole('button', { name, exact: true })
  const searchBox = () => page.getByRole('searchbox', { name: 'Tìm thư hoặc tên tệp' })
  const results = () => page.getByRole('region', { name: 'Kết quả tìm kiếm' })
  const links = () => results().getByRole('heading', { level: 3 }).getByRole('link')
  const hit = subject => results().locator('ol > li').filter({ has: page.getByRole('heading', { name: subject, exact: true }) })
  async function mainSearch(query, mobile = false) {
    if (mobile) await button('Tìm email').click()
    const field = page.getByRole('searchbox', { name: 'Tìm kiếm email' })
    await field.fill(query)
    await (mobile ? button('Tìm trong hộp thư').click() : field.press('Enter'))
    await page.getByRole('heading', { name: 'Tìm thư và tệp', exact: true }).waitFor()
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
    captures.push(name)
  }
  async function download(trigger, bytes) {
    const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()])
    assert.equal(file.suggestedFilename(), filename)
    const path = await file.path()
    const actual = await readFile(path)
    assert.deepEqual(actual, bytes)
    downloads.push({ name: file.suggestedFilename(), bytes: actual.length, sha256: digest(actual) })
    await file.delete()
  }
  async function submit(query) {
    await searchBox().fill(query)
    await button('Tìm').click()
    await page.waitForURL(url => url.pathname === '/search/mail' && url.searchParams.get('q') === query)
  }
  async function assertQuery(query, account, category) {
    const url = new URL(page.url())
    assert.equal(url.pathname, '/search/mail')
    assert.equal(url.searchParams.get('q'), query)
    assert.equal(await searchBox().inputValue(), query)
    if (account) {
      assert.deepEqual(url.searchParams.getAll('account'), [account.id])
      assert.equal(await page.getByRole('checkbox', { name: account.address, exact: true }).isChecked(), true)
    }
    if (category) {
      assert.equal(url.searchParams.get('category'), category)
      assert.equal(await page.getByLabel('Nhãn', { exact: true }).inputValue(), category)
    }
  }

  try {
    await open({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
    await page.getByRole('heading', { name: 'Hộp thư', exact: true }).waitFor()
    const oldQuery = 'hieu chuan kho m-041'
    await mainSearch(oldQuery)
    const oldLink = results().getByRole('link', { name: oldTitle, exact: true })
    await oldLink.waitFor()
    assert.equal(await links().count(), 1)
    await oldLink.click()
    await page.waitForURL(url => url.pathname === '/inbox' && url.searchParams.get('email') === firstId)
    await page.getByRole('heading', { name: oldTitle, exact: true, level: 1 }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('email'), firstId)
    await button('Đổi nhãn').click()
    await page.getByLabel('Nhãn mới', { exact: true }).selectOption('transaction')
    await button('Chỉ đổi thư này').click()
    await page.getByRole('status').getByText('Đã đổi nhãn cho thư này.').waitFor()
    await button('Về kết quả tìm kiếm').click()
    await oldLink.waitFor()
    await assertQuery(oldQuery)
    record('desktop primary search finds an old Vietnamese subject without accents; exact source and query survive returning from the reader', true)

    await submit(filenameQuery)
    await hit(oldTitle).getByText(first.address, { exact: true }).waitFor()
    await hit(branchTitle).getByText(second.address, { exact: true }).waitFor()
    assert.equal(await links().count(), 2)
    await capture('01-duplicate-filenames')
    await download(hit(oldTitle).getByRole('link', { name: 'Tải ' + filename }), firstBytes)
    await download(hit(branchTitle).getByRole('link', { name: 'Tải ' + filename }), secondBytes)
    assert.notEqual(downloads[0].sha256, downloads[1].sha256)
    record('filename query identifies both owning accounts, downloads both same-name files with the exact different bytes and hides foreign and deleted mail', true)

    await page.getByText('Bộ lọc', { exact: true }).click()
    await page.getByRole('checkbox', { name: first.address, exact: true }).check()
    await page.getByRole('checkbox', { name: 'Có tệp đính kèm' }).check()
    await page.getByLabel('Nhãn', { exact: true }).selectOption('transaction')
    await button('Tìm').click()
    await page.waitForURL(url => url.pathname === '/search/mail' && url.searchParams.get('category') === 'transaction')
    await results().getByRole('heading', { name: '1 thư', exact: true }).waitFor()
    await hit(oldTitle).getByText('Giao dịch', { exact: true }).waitFor()
    assert.equal(await links().count(), 1)
    await assertQuery(filenameQuery, first, 'transaction')
    await hit(oldTitle).getByRole('link', { name: oldTitle, exact: true }).click()
    await page.waitForURL(url => url.pathname === '/inbox' && url.searchParams.get('email') === firstId)
    await page.getByRole('heading', { name: oldTitle, exact: true, level: 1 }).waitFor()
    await download(button('Tải xuống'), firstBytes)
    await button('Về kết quả tìm kiếm').click()
    await hit(oldTitle).getByText(first.address, { exact: true }).waitFor()
    await assertQuery(filenameQuery, first, 'transaction')
    assert.equal(await page.getByRole('checkbox', { name: 'Có tệp đính kèm' }).isChecked(), true)
    record('manual category combines with mailbox and attachment filters; opening, downloading and returning preserves every filter', true)

    await context.setOffline(true)
    const offlineQuery = 'dieu-phoi@example.test'
    await submit(offlineQuery)
    await page.getByRole('alert').getByText(/Mất kết nối/).waitFor()
    await assertQuery(offlineQuery, first, 'transaction')
    await capture('02-query-kept-offline')
    await context.setOffline(false)
    await button('Thử tìm lại').click()
    await hit(oldTitle).getByText(first.address, { exact: true }).waitFor()
    await assertQuery(offlineQuery, first, 'transaction')
    assert.equal(await links().count(), 1)
    record('actual Chrome offline keeps submitted query and filters in the URL; retry after reconnect finds the exact source', true)

    await page.getByRole('checkbox', { name: first.address, exact: true }).uncheck()
    await page.getByRole('checkbox', { name: 'Có tệp đính kèm' }).uncheck()
    await page.getByLabel('Nhãn', { exact: true }).selectOption('')
    await submit('phieu kiem dem')
    await results().getByRole('heading', { name: '20+ thư', exact: true }).waitFor()
    const page1 = await links().evaluateAll(items => items.map(link => link.getAttribute('href')))
    await button('Tải thêm kết quả').click()
    await results().getByRole('heading', { name: '24 thư', exact: true }).waitFor()
    const all = await links().evaluateAll(items => items.map(link => link.getAttribute('href')))
    assert.deepEqual(all.slice(0, 20), page1)
    assert.equal(new Set(all).size, 24)
    record('server-side pagination across 24 identical timestamps preserves the first page and returns every result exactly once', true)

    const foreign = await appFetch(api, post({
      query: filenameQuery, accounts: [foreignAccount], category: null, hasFile: false, before: null,
    }))
    assert.equal(foreign.status, 404)
    assert.equal((await appFetch('/api/attachments/' + foreignFile)).status, 404)
    assert.deepEqual(pageErrors, [])
    record('foreign account filter and direct download of a foreign attachment are denied', true)

    const state = await context.storageState()
    await context.close()
    await open({ width: 390, height: 844 }, state)
    await page.goto(app + '/inbox')
    await mainSearch(filenameQuery, true)
    await hit(branchTitle).getByText(second.address, { exact: true }).waitFor()
    await capture('03-mobile-results')
    await hit(branchTitle).getByRole('link', { name: branchTitle, exact: true }).click()
    await page.waitForURL(url => url.pathname === '/inbox' && url.searchParams.get('email') === secondId)
    await page.getByRole('heading', { name: branchTitle, exact: true, level: 1 }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('email'), secondId)
    await button('Về kết quả tìm kiếm').click()
    await hit(branchTitle).getByText(second.address, { exact: true }).waitFor()
    await assertQuery(filenameQuery)
    assert.deepEqual(pageErrors, [])
    assert.equal(googleProvider.calls.modifications.length, 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    record('mobile primary search opens the exact second mailbox source and restores the filename query; sampled views have no axe or overflow violations', true)
    await writeFile(output + '/workflow.json', JSON.stringify({
      chrome: browser.version(), accounts: 2, messages: count(), pagination: all.length,
      downloads, captures, pageErrors, providerWrites: 0,
    }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
