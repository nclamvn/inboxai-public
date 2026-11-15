import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'
import { documents, queries } from './ask-inbox-holdout.mjs'

const endpoint = '/api/ask-inbox'
const output = 'docs/phase-2/evidence/m4a'
const buildRequest = (body, extra = {}) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
})

export async function rehearseAskInbox({ app, appFetch, cookies, admin, userId, foreignId, foreignToken, loopbackFetch, record }) {
  const accounts = { work: randomUUID(), personal: randomUUID(), foreign: randomUUID() }
  assert.equal((await admin.from('source_accounts').insert(Object.entries(accounts).map(([key, id]) => ({
    id, user_id: key === 'foreign' ? foreignId : userId, email_address: key + '@example.test', provider: 'custom',
  })))).error, null)
  const rows = new Map()
  const seed = (key, subject, body_text, index, extra = {}) => ({
    id: randomUUID(), user_id: userId, source_account_id: accounts[key], subject, body_text, body_fetched: true,
    from_address: key === 'personal' ? 'notices@example.test' : 'vendor@example.test',
    received_at: new Date(Date.UTC(2026, 10, 10, 18, 0, index)).toISOString(),
    direction: 'inbound', is_read: true, attachment_count: 0, provider_deleted: false, is_deleted: false, ...extra,
  })
  documents.forEach(([id, account, subject, text], index) => rows.set(id, seed(account, subject, text, index, {
    attachment_count: id === 'transfer' ? 1 : 0,
  })))
  // Verify the lexical citation can point to a matching passage well beyond the semantic window.
  const laterEvidence = 'Hồ sơ PZ-6589 được ký bởi bộ phận lưu trữ.'
  rows.set('late', seed('work', 'Lưu trữ hồ sơ', 'Dòng giới thiệu không có mã. '.repeat(185) + laterEvidence, 31))
  rows.set('foreign', seed('foreign', 'RZ-4927 bí mật tenant khác', 'Mã RZ-4927 riêng của tenant khác.', 33, { user_id: foreignId }))
  rows.set('tombstone', seed('work', 'RZ-4927 bản đã xóa', 'RZ-4927 trong thư bị provider xóa.', 34, { provider_deleted: true }))
  rows.set('trash', seed('personal', 'RZ-4927 bản trong thùng rác', 'RZ-4927 trong thư bị người dùng xóa.', 35, { is_deleted: true }))
  assert.equal((await admin.from('emails').insert([...rows.values()])).error, null)

  async function search(body, status = 200) {
    const start = performance.now()
    const response = await appFetch(endpoint, buildRequest(body))
    const data = await response.json()
    assert.equal(response.status, status, JSON.stringify(data))
    return { ...data, latencyMs: Math.round(performance.now() - start) }
  }
  function sourced(hit) {
    const row = [...rows.values()].find(row => row.id === hit.id)
    return Boolean(row && hit.citation.quote && String(row[hit.citation.field]).includes(hit.citation.quote))
  }
  const cold = await search({ query: 'RZ-4927' })
  record('real local embeddings populate a bounded first batch and the exact code ranks first',
    cold.semantic === 'active' && cold.coverage.indexed === 16 && cold.coverage.eligible === 25 && cold.hits[0].id === rows.get('transfer').id)
  const completed = await search({ query: 'RZ-4927' })
  record('incremental indexing covers the second batch without duplicates or deleted sources',
    completed.coverage.indexed === 25 && new Set(completed.hits.map(hit => hit.id)).size === completed.hits.length &&
    !completed.hits.some(hit => ['foreign', 'tombstone', 'trash'].some(key => hit.id === rows.get(key).id)))

  const sameDay = await search({ query: '', accountIds: [accounts.work], sender: 'vendor@example.test',
    from: '2026-11-11', until: '2026-11-11', attachment: true })
  record('account, sender, UTC+7 date and attachment intersect before retrieval',
    sameDay.hits.length === 1 && sameDay.hits[0].id === rows.get('transfer').id && sameDay.semantic === 'off')
  const crossAccount = await search({ query: '', accountIds: [accounts.work, accounts.personal] })
  record('multiple selected accounts are a union scoped to the signed-in tenant',
    new Set(crossAccount.hits.map(hit => hit.accountId)).size === 2 && crossAccount.hits.length === 25)
  const late = await search({ query: 'PZ-6589', mode: 'keyword' })
  record('lexical lookup cites a verbatim passage deep in the source body',
    late.hits[0].id === rows.get('late').id && late.hits[0].citation.quote.includes(laterEvidence) && sourced(late.hits[0]))

  await search({ query: 'RZ-4927', accountIds: [accounts.foreign] }, 404)
  const anonymous = await loopbackFetch(app + endpoint, buildRequest({ query: 'RZ-4927' }))
  const other = await loopbackFetch(app + endpoint, buildRequest({ query: 'RZ-4927' }, { Authorization: 'Bearer ' + foreignToken }))
  const foreignResults = await other.json()
  record('anonymous callers and foreign account selectors are denied and another tenant sees only its own match',
    anonymous.status === 401 && other.status === 200 && foreignResults.hits[0].id === rows.get('foreign').id &&
    foreignResults.hits.every(hit => hit.accountId === accounts.foreign))
  const invalid = await search({ query: 'RZ-4927', userId: foreignId }, 400)
  const literal = await search({ query: 'from:"%,)secret" RZ-4927', mode: 'keyword' })
  record('strict requests reject injected tenant fields and treat filter punctuation literally', Boolean(invalid.error) && literal.hits.length === 0)

  const comparison = []
  for (const [kind, query, label] of queries) {
    const relevant = label ? rows.get(label).id : null
    const pair = { kind, query, expected: label }
    for (const mode of ['keyword', 'hybrid']) {
      const result = await search({ query, mode })
      if (mode === 'hybrid') assert.equal(result.semantic, 'active', query)
      assert.ok(result.hits.every(sourced), 'Every retrieved excerpt is verifiable: ' + query)
      const index = result.hits.findIndex(hit => hit.id === relevant)
      pair[mode] = {
        rank: index === -1 ? null : index + 1, latencyMs: result.latencyMs,
        hits: result.hits.length, semanticOnly: index >= 0 && result.hits[index].semantic && !result.hits[index].keyword,
      }
    }
    comparison.push(pair)
  }
  const semanticOnly = comparison.some(row => row.kind === 'paraphrase' && row.keyword.rank === null && row.hybrid.semanticOnly && row.hybrid.rank <= 5)
  const exactPreserved = comparison.filter(row => row.kind === 'exact').every(row => row.keyword.rank === 1 && row.hybrid.rank === 1)
  mkdirSync(output, { recursive: true })
  const summarized = Object.fromEntries(['keyword', 'hybrid'].map(mode => {
    const relevant = comparison.filter(row => row.expected)
    const latencies = comparison.map(row => row[mode].latencyMs).sort((a,b) => a-b)
    return [mode, {
      top5: relevant.filter(row => row[mode].rank && row[mode].rank <= 5).length,
      relevantQueries: relevant.length,
      paraphraseTop5: relevant.filter(row => row.kind === 'paraphrase' && row[mode].rank && row[mode].rank <= 5).length,
      mrr: relevant.reduce((sum, row) => sum + (row[mode].rank ? 1 / row[mode].rank : 0), 0) / relevant.length,
      noSourceEmpty: comparison.filter(row => !row.expected && row[mode].hits === 0).length,
      medianMs: latencies[Math.floor(latencies.length / 2)],
      p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
    }]
  }))
  writeFileSync(output + '/retrieval.json', JSON.stringify({
    corpus: '25 authored synthetic visible messages across two owner accounts, and foreign/deleted controls',
    provenance: 'Held-out from direct encoder calibration. Local Next dev HTTP to actual PostgREST/Postgres, real E5 quantized CPU.',
    coldMs: cold.latencyMs, secondBatchMs: completed.latencyMs, summarized, comparison,
  }, null, 2) + '\n')
  record('holdout preserves exact-code ranking and retrieves a semantic-only source missed by keywords', exactPreserved && semanticOnly)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const captures = []
  const runtimeErrors = []
  try {
    for (const [name, viewport] of [
      ['desktop', { width: 1440, height: 900 }], ['tablet', { width: 834, height: 1112 }], ['mobile', { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
        locale: 'vi-VN', viewport, isMobile: name === 'mobile', hasTouch: name !== 'desktop', reducedMotion: 'reduce',
      })
      await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
      await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
      let previewRequests = 0
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.hostname !== '127.0.0.1') return route.abort()
        if (url.pathname === '/api/search' && route.request().method() === 'POST') previewRequests++
        if (url.pathname === '/api/source-accounts/sync' || url.pathname === '/api/emails/send') return route.abort()
        if (url.pathname === '/api/ai/smart-reply') return route.fulfill({ json: { suggestions: [] } })
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => runtimeErrors.push(error.message))
      page.on('console', message => {
        if (message.type() === 'error' && /hydration|hydrated|did not match/i.test(message.text())) runtimeErrors.push(message.text())
      })
      await page.goto(app + '/inbox', { waitUntil: 'domcontentloaded' })
      if (name === 'mobile') {
        await page.getByRole('button', { name: 'Tìm email', exact: true }).click()
        await page.getByRole('link', { name: 'Mở Ask Inbox', exact: true }).click()
      } else {
        await page.getByRole('navigation', { name: 'Hộp thư và công cụ' }).getByRole('link', { name: 'Ask Inbox' }).click()
      }
      await page.getByRole('heading', { name: 'Ask Inbox', exact: true }).waitFor()
      const input = page.getByRole('searchbox', { name: 'Nội dung tìm kiếm' })
      await input.fill(name === 'tablet' ? 'XR-125' : name === 'mobile' ? 'Ai xác nhận đã trả tiền?' : 'RZ-4927')
      if (name === 'desktop') {
        await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
        await page.getByRole('checkbox', { name: 'work@example.test', exact: true }).check()
        await page.getByRole('checkbox', { name: 'Có tệp đính kèm' }).check()
      }
      await page.getByRole('button', { name: 'Tìm thư', exact: true }).click()
      const target = name === 'tablet' ? rows.get('xss') : rows.get('transfer')
      const link = page.getByRole('link', { name: /Mở email nguồn/ }).filter({ hasText: target.subject })
      await link.waitFor()
      assert.equal(await link.getAttribute('href'), '/inbox?email=' + target.id)
      await page.waitForFunction(() => document.activeElement?.id === 'ask-results')
      if (name === 'desktop') {
        assert.equal(await page.getByRole('link', { name: /Mở email nguồn/ }).count(), 1)
        await page.getByRole('button', { name: 'Lưu cụm tìm kiếm' }).click()
        await page.getByText('Đã lưu cụm tìm kiếm.').waitFor()
        const history = await (await appFetch('/api/search/history')).json()
        record('saving the textual search persists it through the existing history endpoint', history.saved.includes('RZ-4927'))
      }
      if (name === 'tablet') {
        assert.equal(await page.locator('img[src="x"]').count(), 0)
        assert.equal(await page.evaluate(() => window.askInjected), undefined)
      }
      assert.equal(previewRequests, 0)
      captures.push({ name, viewport, axe: await audit(page) })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })
      if (name === 'mobile') {
        await link.locator('xpath=ancestor::li').getByText('Ngữ nghĩa', { exact: true }).waitFor()
        await link.click()
        await page.waitForURL('**/inbox?email=' + target.id)
        await page.getByText(target.subject, { exact: true }).first().waitFor()
        await page.goBack()
        await link.waitFor()
      }
      await context.close()
    }
    assert.deepEqual(runtimeErrors, [])
    record('desktop and mobile navigation reach the cited source, and back restores the search', captures.length === 3)
    record('untrusted email text stays literal and sampled desktop, tablet and mobile states have no axe violations',
      captures.every(state => state.axe.length === 0))
    writeFileSync(output + '/browser.json', JSON.stringify({ engine: browser.version(), captures, runtimeErrors }, null, 2) + '\n')
  } finally {
    await browser.close()
  }
}
