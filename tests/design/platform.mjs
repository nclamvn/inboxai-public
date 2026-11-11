import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'

const output = 'docs/phase-2/evidence/m6a'
const scenarios = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 834, height: 1112 }, hasTouch: true },
  { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
]

async function seed(admin, userId) {
  const accounts = [randomUUID(), randomUUID()]
  assert.equal((await admin.from('source_accounts').insert(accounts.map((id, index) => ({
    id, user_id: userId, email_address: `platform-${index}@example.test`, provider: 'custom',
  })))).error, null)
  const rows = Array.from({ length: 600 }, (_, index) => ({
    id: randomUUID(), user_id: userId, source_account_id: accounts[index % 2],
    from_address: 'platform-sender@example.test', from_name: 'Điều phối kho', subject: `Lịch kho M6 ${String(index).padStart(3, '0')}`,
    body_text: (index === 0 ? 'M6REF-826. Bàn giao tại kho số 2. ' : '') + 'Nội dung vận hành giả lập. '.repeat(140),
    received_at: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
    direction: 'inbound', category: 'work', priority: 3, body_fetched: true,
    is_read: index % 4 !== 0, is_archived: false, is_deleted: false, provider_deleted: false,
  }))
  for (let offset = 0; offset < rows.length; offset += 50) {
    assert.equal((await admin.from('emails').insert(rows.slice(offset, offset + 50))).error, null)
  }
  return rows[0]
}

export async function rehearsePlatform({ app, appFetch, cookies, admin, userId, record, briefingReads, baseline, nativeFixture }) {
  const sample = await seed(admin, userId)
  if (nativeFixture) {
    assert.equal((await admin.from('emails').update({ summary: 'Bàn giao tại kho số 2.' }).eq('id', sample.id).eq('user_id', userId)).error, null)
    await nativeFixture.rehearse(record)
    return
  }
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  mkdirSync(output, { recursive: true })
  const measurements = []
  try {
    const briefingResponse = await appFetch('/api/ai/briefing')
    assert.equal(briefingResponse.status, 200)
    const { summary } = await briefingResponse.json()
    assert.deepEqual({ total: summary.total, unread: summary.unread, work: summary.byCategory.work },
      { total: 600, unread: 150, work: 150 })
    const briefingBytes = briefingReads.at(-1)?.bytes
    assert.ok(briefingBytes > 0)
    record('briefing counts remain correct for 600 synthetic emails across two accounts', true)
    for (const { name, ...device } of scenarios) {
      const context = await browser.newContext({ ...device, locale: 'vi-VN', reducedMotion: 'reduce' })
      try {
        await context.grantPermissions(['local-network-access'], { origin: app })
        await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
        await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
        await context.route('**/*', async route => {
          const url = new URL(route.request().url())
          if (!['127.0.0.1:55300', '127.0.0.1:55321'].includes(url.host)
            || url.pathname === '/api/source-accounts/sync' || url.pathname === '/api/emails/send') return route.abort()
          // The pre-change build's production CSP cannot reach the local DB fixture.
          // Apply the same explicit origin used by the repaired build for this comparison.
          if (baseline && url.pathname === '/inbox' && route.request().isNavigationRequest()) {
            const response = await route.fetch({ maxRedirects: 0 })
            const headers = response.headers()
            const csp = headers['content-security-policy']
            assert.ok(csp?.includes('connect-src '))
            headers['content-security-policy'] = csp.replace('connect-src ', 'connect-src http://127.0.0.1:55321 ')
              .replace(/; upgrade-insecure-requests\b/, '')
            return route.fulfill({ response, headers })
          }
          return route.continue()
        })
        const page = await context.newPage()
        const runtimeErrors = []
        const failedRequests = []
        const debug = await context.newCDPSession(page)
        await debug.send('Network.enable')
        debug.on('Network.loadingFailed', ({ errorText, blockedReason, corsErrorStatus }) => {
          if (blockedReason || corsErrorStatus) failedRequests.push({ errorText, blockedReason, corsErrorStatus })
        })
        page.on('pageerror', error => runtimeErrors.push(error.message))
        page.on('console', message => {
          if (message.type() === 'error' && /Content Security Policy|ERR_|hydration|CORS/.test(message.text())) {
            failedRequests.push(message.text())
          }
        })
        page.on('requestfailed', request => failedRequests.push([new URL(request.url()).origin, new URL(request.url()).pathname, request.failure()?.errorText]))
        page.on('response', response => {
          if (response.status() >= 400) failedRequests.push([new URL(response.url()).pathname, response.status()])
        })
        const requests = { briefing: 0, profiles: 0 }
        page.on('request', request => {
          const { pathname } = new URL(request.url())
          if (pathname === '/api/ai/briefing') requests.briefing++
          if (pathname === '/rest/v1/profiles') requests.profiles++
        })
        await page.goto(app + '/inbox')
        const opener = page.getByRole('button', { name: /Mở thư: Lịch kho M6 000/ })
        try {
          await opener.waitFor({ timeout: 8000 })
        } catch (error) {
          console.error({ name, location: new URL(page.url()).pathname, runtimeErrors, failedRequests,
            visible: (await page.locator('body').innerText()).slice(0, 2000) })
          throw error
        }
        const firstRowMs = await page.evaluate(() => Math.round(performance.now()))
        await page.waitForLoadState('networkidle')
        const jsBytes = await page.evaluate(() => performance.getEntriesByType('resource')
          .filter(resource => new URL(resource.name).pathname.endsWith('.js'))
          .reduce((total, resource) => total + resource.encodedBodySize, 0))
        const result = { name, viewport: device.viewport, firstRowMs, jsBytes, requests: { ...requests } }
        measurements.push(result)
        if (baseline) continue
        assert.deepEqual(requests, { briefing: name === 'mobile' ? 0 : 1, profiles: 0 })
        assert.ok(jsBytes > 0 && jsBytes <= 550 * 1024, `${name} JS bytes ${jsBytes}`)
        assert.ok(firstRowMs <= 5000, `${name} local first row at ${firstRowMs} ms`)
        await checkPage(page, result, 'inbox')
        await opener.focus()
        await page.keyboard.press('Enter')
        const heading = page.getByRole('heading', { name: sample.subject, exact: true })
        await heading.waitFor()
        await checkPage(page, result, 'reading')
        assert.equal(await heading.evaluate(element => document.activeElement === element), true)
        const body = page.getByRole('region', { name: 'Nội dung thư' })
        await body.press('PageDown')
        await page.waitForFunction(() => document.activeElement?.scrollTop > 0)
        await page.getByRole('button', { name: name === 'mobile' ? 'Về hộp thư' : 'Đóng', exact: true }).press('Enter')
        await page.waitForURL(app + '/inbox')
        await page.waitForFunction(id => document.activeElement?.getAttribute('data-email-opener') === id, sample.id)
        assert.deepEqual(runtimeErrors, [])
        record(`${name} production Inbox stays within budgets and supports keyboard reading, scrolling and focus return`, true)
      } finally {
        await context.close()
      }
    }
    if (!baseline) {
      record('briefing reads at most 256 KiB of PostgREST JSON for 600 synthetic emails', briefingBytes <= 256 * 1024)
    }
    writeFileSync(`${output}/${baseline ? 'before' : 'after'}.json`, JSON.stringify({
      engine: browser.version(), mode: 'next start', accounts: 2, emails: 600, briefingBytes, measurements,
    }, null, 2) + '\n')
  } finally {
    await browser.close()
  }
}

async function checkPage(page, result, state) {
  const violations = await audit(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  result[state] = { violations, overflow }
  assert.equal(overflow, false, `${result.name} ${state} overflows horizontally`)
  assert.deepEqual(violations, [], `${result.name} ${state} violates sampled WCAG rules`)
}
