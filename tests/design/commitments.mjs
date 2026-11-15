import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'

const output = 'docs/phase-2/evidence/m3b'
const collection = '/api/commitments'
const primaryTitle = 'Xác nhận lịch giao 200 bộ linh kiện'
const waitingTitle = 'Nhà cung cấp gửi biên bản nghiệm thu'
const oldSubject = 'Lịch giao ban đầu của PO-1042'
const proposedSubject = 'Đề nghị lịch giao mới của PO-1042'
const completionQuote = 'Kho đã kiểm đếm và nhận đủ 200 bộ linh kiện.'

const moment = (days = 0) => new Date(Date.now() + days * 86_400_000)
const localDate = days => new Date(moment(days).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
const evidence = (email, quote = email.body_text) => ({ emailId: email.id, field: 'body_text', quote })

function mutation(method, body) {
  return { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) }
}

async function read(appFetch, path, init, expected = 200) {
  const response = await appFetch(path, init)
  const result = await response.json()
  assert.equal(response.status, expected, JSON.stringify(result))
  return result
}

async function seed(appFetch, admin, userId) {
  const accountId = randomUUID()
  assert.equal((await admin.from('source_accounts').insert({
    id: accountId, user_id: userId, email_address: 'receiving@example.test', provider: 'custom',
  })).error, null)
  const mail = (subject, body_text) => ({
    id: randomUUID(), user_id: userId, source_account_id: accountId, subject, body_text, body_fetched: true,
    from_name: 'Điều phối kho', from_address: 'supplier@example.test', received_at: moment().toISOString(),
    direction: 'inbound', is_read: true,
  })
  const old = mail(oldSubject, `Lịch đã xác nhận là ${localDate(2)} cho toàn bộ 200 bộ linh kiện.`)
  const proposed = mail(proposedSubject, `Đề nghị chuyển lịch giao toàn bộ sang ${localDate(3)}.`)
  const completedMail = mail('Kho xác nhận nhận đủ hàng', completionQuote)
  const overdueMail = mail('Lịch đối chiếu số lượng giao thiếu', `Kho cần đối chiếu số lượng giao thiếu trước ngày ${localDate(-1)}.`)
  const edited = mail('Nguồn từng xác nhận hồ sơ', 'Tài liệu đã được lưu vào thư mục giao nhận.')
  const removed = mail('Nguồn sẽ được xóa', 'Hãy xác minh người phụ trách việc bàn giao.')
  assert.equal((await admin.from('emails').insert([old, proposed, completedMail, overdueMail, edited, removed])).error, null)

  const state = (title, extra = {}) => ({
    title, ownerName: 'Phụ trách kho', ownerEmail: 'receiving@example.test', dueOn: localDate(2), dueAt: null, status: 'open', ...extra,
  })
  const create = (referenceKey, snapshot, email = old) => read(appFetch, collection, mutation('POST', {
    referenceKey, state: snapshot, evidence: [evidence(email)],
  }), 201)
  await create('receiving:older', state('Kiểm lại phiếu giao cũ'))
  for (let index = 1; index <= 19; index++) {
    await create(`receiving:batch-${index}`, state(`Đối chiếu phiếu nhập kho số ${String(index).padStart(2, '0')}`))
  }
  const primary = await create('po-1042:delivery', state(primaryTitle, { ownerEmail: 'Receiving@Example.Test' }))
  await read(appFetch, `${collection}/${primary.id}`, mutation('PATCH', {
    operation: 'flag_review', expectedVersion: 1, review: { kind: 'conflicting', note: 'Hai thư ghi ngày giao khác nhau.' },
    evidence: [evidence(old), evidence(proposed)],
  }))
  const waiting = await create('po-1042:report', state(waitingTitle, { ownerName: 'Nhà cung cấp', ownerEmail: 'supplier@example.test' }))
  await create('receiving:overdue', state('Đối chiếu số lượng giao thiếu', {
    ownerEmail: 'verified@example.test', dueOn: null, dueAt: moment(-1).toISOString(),
  }), overdueMail)
  await create('receiving:unassigned', state('Bàn giao chưa rõ người phụ trách', { ownerName: null, ownerEmail: null, dueOn: null }), removed)
  await create('receiving:closed', state('Hồ sơ giao nhận đã khép', { status: 'completed', dueOn: localDate(-4) }), edited)
  assert.equal((await admin.from('emails').update({ body_text: 'Nội dung nguồn đã được cập nhật.' }).eq('id', edited.id).eq('user_id', userId)).error, null)
  assert.equal((await admin.from('emails').update({ provider_deleted: true }).eq('id', removed.id).eq('user_id', userId)).error, null)

  return { primary, waiting, old, proposed, completedMail, proposedDue: localDate(3) }
}

function group(page, name) {
  return page.getByRole('navigation', { name: 'Nhóm cam kết' }).getByRole('link', { name: new RegExp(`^${name}`) })
}

const item = (page, title) => page.getByRole('link', { name: new RegExp(`^${title}`) })
const edit = page => page.getByRole('button', { name: 'Xác nhận thay đổi', exact: true })

export async function rehearseCommitmentUi({ app, appFetch, cookies, admin, userId, record }) {
  mkdirSync(output, { recursive: true })
  const fixture = await seed(appFetch, admin, userId)
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const outcomes = []
  const capture = async (page, name) => {
    outcomes.push({ name, viewport: page.viewportSize(), axe: await audit(page) })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })
  }
  const runtimeErrors = []
  try {
    for (const [name, viewport, touch] of [
      ['desktop', { width: 1440, height: 900 }, false],
      ['tablet', { width: 834, height: 1112 }, true],
      ['mobile', { width: 390, height: 844 }, true],
      ['dark', { width: 1440, height: 900 }, false],
    ]) {
      const context = await browser.newContext({
        locale: 'vi-VN', timezoneId: 'America/Los_Angeles', viewport, hasTouch: touch,
        isMobile: name === 'mobile', reducedMotion: 'reduce', deviceScaleFactor: 1, colorScheme: name === 'dark' ? 'dark' : 'light',
      })
      await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
      await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
      let failBoard = name === 'tablet'
      let loseReply = false
      const keys = []
      await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.hostname !== '127.0.0.1') return route.abort()
        if (url.pathname === '/api/source-accounts/sync' || url.pathname === '/api/emails/send') return route.abort()
        if (url.pathname === '/api/ai/smart-reply') return route.fulfill({ json: { suggestions: [] } })
        if (/^\/api\/ai\/features\/[^/]+\/auto$/.test(url.pathname)) return route.fulfill({ json: { summary: 'Tóm tắt giả lập.' } })
        if (url.pathname === collection && url.searchParams.has('group') && failBoard) {
          return route.fulfill({ status: 503, json: { error: 'Synthetic board failure' } })
        }
        if (name === 'tablet' && url.pathname === `${collection}/${fixture.primary.id}` &&
            request.method() === 'GET' && !url.searchParams.has('beforeVersion')) {
          url.searchParams.set('limit', '1')
          return route.continue({ url: url.href })
        }
        if (url.pathname.startsWith(collection + '/') && request.method() === 'PATCH') {
          keys.push(request.headers()['idempotency-key'])
          if (loseReply) {
            loseReply = false
            const response = await route.fetch()
            assert.equal(response.status(), 200)
            return route.abort()
          }
        }
        return route.continue()
      })

      const page = await context.newPage()
      page.on('pageerror', error => runtimeErrors.push(error.message))
      page.setDefaultTimeout(15000)
      if (name === 'desktop') {
        await page.goto(`${app}/inbox`)
        await page.getByRole('navigation', { name: 'Hộp thư và công cụ' }).getByRole('link', { name: 'Cam kết' }).click()
        await item(page, primaryTitle).waitFor()
        assert.match(await group(page, 'Tôi phải làm').innerText(), /Tôi phải làm\s*21/)
        assert.equal(await item(page, 'Kiểm lại phiếu giao cũ').count(), 0)
        await page.getByRole('button', { name: 'Tải thêm cam kết' }).click()
        await item(page, 'Kiểm lại phiếu giao cũ').waitFor()
        record('desktop navigation loads the exact owned count and can page older commitments', true)
        await group(page, 'Đang chờ').click()
        await item(page, waitingTitle).waitFor()
        await group(page, 'Quá hạn').click()
        await item(page, 'Đối chiếu số lượng giao thiếu').getByText('· Tôi phải làm').waitFor()
        await group(page, 'Chưa rõ').click()
        await item(page, 'Bàn giao chưa rõ người phụ trách').click()
        await page.getByText('Email nguồn không còn khả dụng').waitFor()
        await group(page, 'Đã khép').click()
        await item(page, 'Hồ sơ giao nhận đã khép').click()
        await page.getByText('Nội dung email đã thay đổi.').waitFor()
        record('waiting, overdue, unresolved and closed groups display their scoped items and stale source states', true)

        await group(page, 'Tôi phải làm').click()
        await item(page, primaryTitle).click()
        const history = page.getByRole('region', { name: 'Lịch sử' })
        await history.getByRole('link', { name: proposedSubject }).waitFor()
        await history.getByText(fixture.old.body_text, { exact: true }).first().waitFor()
        await history.getByText(fixture.proposed.body_text, { exact: true }).waitFor()
        await capture(page, 'desktop-history')
        const source = history.getByRole('link', { name: oldSubject }).first()
        assert.equal(await source.getAttribute('href'), `/inbox?email=${fixture.old.id}`)
        await source.click()
        await page.getByRole('heading', { name: oldSubject, exact: true }).waitFor()
        await page.goBack()
        await history.getByRole('link', { name: proposedSubject }).click()
        await page.getByRole('heading', { name: proposedSubject, exact: true }).waitFor()
        await page.goBack()
        await page.getByRole('heading', { name: primaryTitle }).waitFor()
        record('one ledger detail exposes both dates and two verified links open the corresponding Inbox messages', true)

        await edit(page).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel('Ngày đến hạn').fill(fixture.proposedDue)
        await dialog.getByRole('button', { name: 'Xem trước thay đổi' }).click()
        await dialog.getByRole('alert').getByText('Chọn từ một đến ba trích đoạn làm bằng chứng.', { exact: true }).waitFor()
        await dialog.getByRole('checkbox', { name: new RegExp(proposedSubject) }).check()
        await dialog.getByRole('button', { name: 'Xem trước thay đổi' }).click()
        await dialog.getByRole('heading', { name: 'Xem trước thay đổi' }).waitFor()
        assert.equal((await read(appFetch, `${collection}/${fixture.primary.id}`)).version, 2)
        await capture(page, 'desktop-preview')
        await dialog.getByRole('button', { name: 'Xác nhận và lưu' }).click()
        await page.getByText('Đã xác nhận phiên bản 3.').waitFor()
        const saved = await read(appFetch, `${collection}/${fixture.primary.id}`)
        assert.equal(saved.state.dueOn, fixture.proposedDue)
        assert.equal(saved.state.review, null)
        record('preview leaves state unchanged until an explicit confirmation records the new due date and clears review', true)

        await edit(page).click()
        await dialog.getByLabel('Trạng thái').selectOption('completed')
        await dialog.getByRole('checkbox', { name: 'Gắn email khác' }).check()
        await dialog.getByLabel('Liên kết Inbox hoặc mã email').fill(`/inbox?email=${fixture.completedMail.id}`)
        await dialog.getByLabel('Trích đoạn nguyên văn').fill('Bằng chứng không tồn tại.')
        await dialog.getByRole('button', { name: 'Xem trước thay đổi' }).click()
        await dialog.getByRole('button', { name: 'Xác nhận và lưu' }).click()
        await dialog.getByRole('alert').getByText(/Bằng chứng không khớp/).waitFor()
        assert.equal((await read(appFetch, `${collection}/${fixture.primary.id}`)).version, 3)
        await dialog.getByRole('button', { name: 'Quay lại chỉnh' }).click()
        await dialog.getByLabel('Trích đoạn nguyên văn').fill(completionQuote)
        await dialog.getByRole('button', { name: 'Xem trước thay đổi' }).click()
        loseReply = true
        await dialog.getByRole('button', { name: 'Xác nhận và lưu' }).click()
        await dialog.getByRole('button', { name: 'Thử lưu lại' }).click()
        await page.getByText('Đã xác nhận phiên bản 4.').waitFor()
        assert.ok(keys.at(-1) && keys.at(-1) === keys.at(-2))
        const completed = await read(appFetch, `${collection}/${fixture.primary.id}`)
        assert.equal(completed.state.status, 'completed')
        assert.equal(completed.version, 4)
        assert.equal(completed.history[0].sources[0].quote, completionQuote)
        await group(page, 'Đã khép').click()
        await item(page, primaryTitle).getByText('Hoàn tất', { exact: true }).waitFor()
        record('completion rejects a fabricated quote, accepts the source, and replays a lost response without duplicating history', true)
      }

      if (name === 'tablet') {
        await page.goto(`${app}/commitments`)
        await page.getByRole('heading', { name: 'Chưa tải được sổ cam kết' }).waitFor()
        failBoard = false
        await page.getByRole('button', { name: 'Thử tải lại danh sách' }).click()
        await group(page, 'Đã khép').click()
        await item(page, primaryTitle).click()
        await page.getByRole('heading', { name: primaryTitle }).waitFor()
        assert.equal(await group(page, 'Đã khép').isVisible(), false)
        await page.getByRole('button', { name: 'Tải thêm lịch sử' }).click()
        await page.getByText('Phiên bản 1', { exact: true }).waitFor()
        await capture(page, 'tablet-history')
        await page.getByRole('link', { name: 'Về danh sách' }).click()
        await group(page, 'Đang chờ').click()
        await item(page, waitingTitle).click()
        await edit(page).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel('Tên người phụ trách').fill('Đầu mối mới')
        await dialog.getByRole('checkbox', { name: new RegExp(oldSubject) }).check()
        await dialog.getByRole('button', { name: 'Xem trước thay đổi' }).click()
        await read(appFetch, `${collection}/${fixture.waiting.id}`, mutation('PATCH', {
          operation: 'flag_review', expectedVersion: 1, review: { kind: 'ambiguous', note: 'Cần kiểm tra đầu mối cập nhật.' },
          evidence: [evidence(fixture.old)],
        }))
        await dialog.getByRole('button', { name: 'Xác nhận và lưu' }).click()
        await dialog.getByRole('alert').getByText(/Cam kết đã thay đổi/).waitFor()
        await dialog.getByRole('button', { name: 'Bỏ bản chỉnh và tải mới' }).click()
        await page.getByText('Cần kiểm tra đầu mối cập nhật.').first().waitFor()
        assert.equal((await read(appFetch, `${collection}/${fixture.waiting.id}`)).version, 2)
        record('tablet uses a single detail pane, retries a failed list, loads older history and rejects stale confirmation', true)
      }

      if (name === 'mobile') {
        await page.goto(`${app}/inbox`)
        await page.getByRole('navigation', { name: 'Điều hướng di động' }).getByRole('link', { name: 'Cam kết' }).tap()
        await group(page, 'Quá hạn').tap()
        await item(page, 'Đối chiếu số lượng giao thiếu').waitFor()
        await capture(page, 'mobile-groups')
        await item(page, 'Đối chiếu số lượng giao thiếu').tap()
        await page.getByRole('heading', { name: 'Đối chiếu số lượng giao thiếu' }).waitFor()
        await capture(page, 'mobile-history')
        const target = await edit(page).boundingBox()
        assert.ok(target && target.width >= 44 && target.height >= 44)
        await edit(page).tap()
        await page.getByRole('dialog').waitFor()
        await capture(page, 'mobile-edit')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        assert.equal(await edit(page).evaluate(node => document.activeElement === node), true)
        await page.getByRole('link', { name: 'Về danh sách' }).tap()
        assert.equal(await group(page, 'Quá hạn').getAttribute('aria-current'), 'page')
        record('mobile navigation restores the selected group and returns keyboard focus after the confirmation dialog closes', true)
      }

      if (name === 'dark') {
        await page.goto(`${app}/commitments?group=closed&id=${fixture.primary.id}`)
        await page.getByRole('heading', { name: primaryTitle }).waitFor()
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
        await capture(page, 'dark-history')
        record('dark deep link displays current commitment and history without first visiting the list', true)
      }
      await context.close()
    }
    assert.deepEqual(outcomes.flatMap(result => result.axe), [])
    assert.deepEqual(runtimeErrors, [])
    record('sampled commitment screens have no WCAG-tagged axe violations or uncaught page exceptions', true)
  } finally {
    writeFileSync(`${output}/browser.json`, JSON.stringify({ engine: browser.version(), outcomes, runtimeErrors }, null, 2) + '\n')
    await browser.close()
  }
}
