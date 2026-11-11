import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const scenarios = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 834, height: 1112 }, hasTouch: true },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
]
const subjects = [
  ['Phương Linh', 'Xác nhận lịch giao hàng đợt 2', 'Nhà cung cấp xác nhận giao 200 bộ linh kiện vào thứ Sáu. Vui lòng đối chiếu lịch nhận kho trước 16:00.', 'work', 5],
  ['Quang Minh', 'Báo giá cập nhật cho đơn PO-1042', 'Mình gửi bảng giá đã cập nhật. Nhờ bạn xác nhận số lượng và thời hạn thanh toán.', 'work', 4],
  ['Kho Miền Nam', 'Biên bản bàn giao lô linh kiện', 'Lô hàng đã được kiểm đếm. Biên bản có chữ ký xác nhận của hai bên.', 'work', 3],
  ['Ngân hàng nội bộ', 'Xác nhận giao dịch tháng 11', 'Giao dịch thanh toán đã được ghi nhận thành công.', 'transaction', 2],
  ['Hà Nguyễn', 'Tài liệu họp ngày mai', 'Mình đã bổ sung ghi chú vào phần tiến độ và gửi bản mới.', 'personal', 3],
  ['Tổ vận hành', 'Lịch bảo trì hệ thống kho', 'Hệ thống sẽ tạm dừng vào tối thứ Bảy để bảo trì định kỳ.', 'work', 3],
  ['Mai Anh', 'Cập nhật danh sách khách mời', 'Đây là danh sách xác nhận tham dự tính đến sáng nay.', 'personal', 3],
  ['Bản tin Logistics', 'Tin vận tải tuần này', 'Bản tin tổng hợp tuyến và năng lực vận chuyển.', 'newsletter', 1],
]

async function seed(admin, userId) {
  const accounts = ['Điều phối', 'Mua hàng'].map((name, index) => ({
    id: randomUUID(), user_id: userId, email_address: `design-${index}@example.test`, display_name: name, provider: 'custom',
  }))
  assert.equal((await admin.from('source_accounts').insert(accounts)).error, null)
  const emails = subjects.map(([from_name, subject, body_text, category, priority], index) => ({
    id: randomUUID(), user_id: userId, source_account_id: accounts[index % 2].id,
    from_name, from_address: `sender-${index}@example.test`, subject, body_text, category, priority,
    is_read: index > 2, is_starred: index === 1, needs_reply: index === 0, body_fetched: true,
    direction: 'inbound', received_at: new Date(Date.now() - (index + 1) * 65 * 60000).toISOString(),
    summary: index === 0 ? 'Đối chiếu lịch nhận kho trước 16:00.' : null,
  }))
  assert.equal((await admin.from('emails').insert(emails)).error, null)
  return { subject: emails[0].subject, accountId: accounts[0].id, otherAccountId: accounts[1].id }
}

export async function audit(page) {
  if (!await page.evaluate(() => Boolean(window.axe))) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  }
  return page.evaluate(async () => {
    const result = await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(node => node.target) }))
  })
}

export async function rehearseDesign({ app, cookies, admin, userId, record, actionInbox = false }) {
  const output = `docs/phase-2/evidence/${actionInbox ? 'm2b' : 'm2a'}`
  const screenshot = (page, name) => page.screenshot({
    path: `${output}/${name}.png`, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }',
  })
  mkdirSync(output, { recursive: true })
  const { subject, accountId, otherAccountId } = await seed(admin, userId)
  const action = actionInbox ? await seedActionInbox(admin, userId, accountId, otherAccountId) : null
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH }
    : { channel: 'chrome' })
  const results = []
  try {
    for (const { name, ...options } of scenarios) {
      assert.equal((await admin.from('emails').update({ is_read: false }).eq('user_id', userId).eq('subject', subject)).error, null)
      const context = await browser.newContext({ locale: 'vi-VN', reducedMotion: 'reduce', deviceScaleFactor: 1, ...options })
      await context.grantPermissions(['local-network-access'], { origin: app })
      await context.addCookies([...cookies].filter(([, value]) => value).map(([cookie, value]) => ({ name: cookie, value, url: app })))
      await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
      let inboxMode = 'data'
      let sendRequests = 0
      let dropSaveResponse = false
      let failNextPage = false
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.hostname !== '127.0.0.1') return route.abort()
        if (url.pathname === '/rest/v1/rpc/set_inbox_priority' && dropSaveResponse) {
          dropSaveResponse = false
          const reply = await route.fetch()
          assert.ok(reply.ok())
          return route.abort()
        }
        if (url.pathname === '/api/source-accounts/sync') return route.abort()
        if (url.pathname === '/api/emails/send') {
          sendRequests++
          return route.abort()
        }
        if (url.pathname === '/api/ai/compose') return route.fulfill({ json: { success: true, text: 'Bản nháp kiểm thử.' } })
        if (url.pathname === '/api/ai/smart-reply') return route.fulfill({ json: { suggestions: [] } })
        if (/^\/api\/ai\/features\/[^/]+\/auto$/.test(url.pathname)) {
          return route.fulfill({ json: { summary: 'Đối chiếu lịch nhận kho trước 16:00.' } })
        }
        if (url.pathname === '/rest/v1/emails' && url.searchParams.has('or') && failNextPage) {
          failNextPage = false
          return route.fulfill({ status: 503, json: { message: 'Synthetic page failure' } })
        }
        if (url.pathname === '/rest/v1/emails' && route.request().method() === 'GET' && inboxMode !== 'data') {
          return inboxMode === 'empty'
            ? route.fulfill({ json: [] })
            : route.fulfill({ status: 503, json: { message: 'Synthetic fixture failure' } })
        }
        return route.continue()
      })
      const page = await context.newPage()
      const runtimeErrors = []
      page.on('pageerror', error => runtimeErrors.push(error.message))
      page.setDefaultTimeout(15000)
      await page.goto(`${app}/inbox`)
      const opener = page.getByRole('button', { name: new RegExp(`Mở thư: ${subject}`) })
      await opener.waitFor()
      await page.evaluate(() => document.fonts.ready)
      const styles = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const color = name => {
          const value = root.getPropertyValue(name).trim().toUpperCase()
          return value.replace(/^#([0-9A-F])([0-9A-F])([0-9A-F])$/, '#$1$1$2$2$3$3')
        }
        return {
          navy: color('--navy'), canvas: color('--canvas'),
          surface: color('--surface'), border: color('--border'),
          text: color('--ink'), accent: root.getPropertyValue('--accent-width').trim(),
          grid: root.getPropertyValue('--grid').trim(),
          font: getComputedStyle(document.body).fontFamily,
          fontLoaded: [...document.fonts].some(face => face.family.includes('Inter Variable') && face.status === 'loaded'),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          bodyMotion: getComputedStyle(document.body).transitionDuration,
        }
      })
      assert.equal(styles.navy, '#174A72')
      assert.equal(styles.grid, '4px')
      assert.equal(styles.accent, '2px')
      assert.ok(styles.font.includes('Inter Variable') && styles.fontLoaded)
      assert.equal(styles.horizontalOverflow, false)
      if (name !== 'dark') {
        assert.deepEqual([styles.canvas, styles.surface, styles.border, styles.text], ['#F7F9FA', '#FFFFFF', '#E1E7EB', '#192532'])
      } else assert.equal(styles.canvas, '#111C25')
      const visibleNav = page.getByRole('navigation', { name: name === 'mobile' ? 'Điều hướng di động' : 'Hộp thư và công cụ' })
      assert.equal(await visibleNav.locator('[aria-current="page"]').count(), 1)
      const dismissUrgent = page.getByRole('button', { name: `Đóng thông báo: ${subject}` })
      await dismissUrgent.waitFor()
      if (name !== 'mobile') await page.getByRole('button', { name: 'Tất cả tài khoản' }).waitFor()
      const violations = await audit(page)
      await screenshot(page, name)
      results.push({ name, viewport: options.viewport, styles, axe: violations, runtimeErrors })
      record(`${name} Inbox renders tokens, Inter and current navigation without horizontal overflow`, true)

      if (name === 'desktop') {
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Đến nội dung chính')
        await page.keyboard.press('Enter')
        assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content')
        await opener.focus()
        await page.waitForFunction(() => {
          const row = document.activeElement?.closest('.neo-mail-row')
          return row && getComputedStyle(row).outlineWidth === '2px'
        })
        const focus = await opener.evaluate(el => {
          const row = el.closest('.neo-mail-row')
          const style = getComputedStyle(row)
          return { active: document.activeElement === el, within: row.matches(':focus-within'), width: style.outlineWidth, style: style.outlineStyle }
        })
        assert.deepEqual(focus, { active: true, within: true, width: '2px', style: 'solid' })
        await page.keyboard.press('Enter')
        await page.getByRole('heading', { name: subject, exact: true }).waitFor()
        const selected = page.locator('.neo-mail-row[data-active="true"]')
        await selected.waitFor()
        assert.deepEqual(await selected.evaluate(el => {
          const accent = getComputedStyle(el, '::before')
          return { width: accent.width, color: accent.backgroundColor }
        }), { width: '2px', color: 'rgb(23, 74, 114)' })
        const summary = page.getByRole('button', { name: 'Tóm tắt', exact: true })
        await summary.click()
        await page.getByText('Đối chiếu lịch nhận kho trước 16:00.', { exact: true }).waitFor()
        results.at(-1).readingAxe = await audit(page)
        await screenshot(page, 'desktop-reading')
        record('desktop keyboard skip, focus outline and split reading selection', true)
        if (action) {
          await rehearsePriorityUi({
            page, app, admin, action, record, screenshot, result: results.at(-1),
            loseSaveResponse: () => { dropSaveResponse = true },
          })
          await rehearsePagination({
            page, app, admin, userId, accountId, record,
            failPage: () => { failNextPage = true },
          })
        }
      }

      if (name === 'tablet') {
        const toggle = page.getByRole('button', { name: 'Mở rộng thanh điều hướng' })
        await toggle.click()
        await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).waitFor()
        await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click()
        await opener.click()
        await page.getByRole('heading', { name: subject, exact: true }).waitFor()
        assert.equal(await page.locator('.neo-mail-row').first().isVisible(), false)
        record('tablet expands the rail and uses a single reading pane', true)
      }

      if (name === 'mobile') {
        const filter = page.getByRole('button', { name: 'Lọc danh mục' })
        const bounds = await filter.boundingBox()
        assert.ok(bounds.width >= 44 && bounds.height >= 44)
        await filter.click()
        const dialog = page.getByRole('dialog', { name: 'Lọc theo danh mục' })
        await dialog.waitFor()
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('dialog[open]'))), true)
        results.at(-1).dialogAxe = await audit(page)
        await screenshot(page, 'mobile-filter')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(await filter.evaluate(el => document.activeElement === el), true)
        await page.getByRole('button', { name: 'Tìm email' }).click()
        await page.getByRole('searchbox', { name: 'Tìm kiếm email' }).fill('không có kết quả này')
        await page.getByRole('heading', { name: 'Không tìm thấy kết quả' }).waitFor()
        await page.getByRole('button', { name: 'Đóng tìm kiếm' }).click()
        await opener.waitFor()
        await page.getByRole('button', { name: 'Chuyển sang tối' }).click()
        assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), true)
        await page.reload()
        await page.getByRole('button', { name: 'Chuyển sang sáng' }).click()
        await opener.click()
        await page.getByRole('heading', { name: subject, exact: true }).waitFor()
        if (action) {
          const showPriority = page.getByRole('button', { name: 'Ưu tiên và nguồn', exact: true })
          await showPriority.tap()
          const priority = page.getByRole('dialog', { name: 'Ưu tiên và nguồn' })
          await priority.getByRole('link', { name: subject, exact: true }).waitFor()
          results.at(-1).priorityAxe = await audit(page)
          await screenshot(page, 'mobile-priority')
          await page.keyboard.press('Escape')
          await priority.waitFor({ state: 'hidden' })
          assert.equal(await showPriority.evaluate(el => document.activeElement === el), true)
          record('mobile reading opens cited priority and returns focus on Escape', true)
        }
        await page.getByRole('button', { name: 'Về hộp thư' }).click()
        await page.getByRole('heading', { name: 'Hộp thư', exact: true }).waitFor()
        record('mobile touch targets, dialog focus and Escape, search, persisted theme and reading navigation', true)
        await context.setOffline(true)
        await page.getByText(/Bạn đang offline/).waitFor()
        await context.setOffline(false)
        await page.getByText('Đã kết nối lại!').waitFor()
        record('offline and recovered network statuses are announced', true)

        await page.goto(`${app}/compose`)
        await page.getByRole('heading', { name: 'Soạn thư mới' }).waitFor()
        const from = page.getByRole('combobox', { name: 'Từ', exact: true })
        await from.getByRole('option', { name: 'design-1@example.test' }).waitFor({ state: 'attached' })
        const [sender] = await from.selectOption({ label: 'design-1@example.test' })
        await page.getByRole('textbox', { name: 'Đến', exact: true }).fill('recipient@example.test')
        await page.getByRole('textbox', { name: 'Tiêu đề', exact: true }).fill('Xác nhận lịch giao hàng')
        await page.getByRole('button', { name: 'Viết', exact: true }).click()
        const prompt = page.getByRole('textbox', { name: 'Yêu cầu soạn bản nháp' })
        await prompt.fill('Xác nhận lịch giao hàng.')
        await prompt.press('Enter')
        const body = page.getByRole('textbox', { name: 'Nội dung thư' })
        await page.waitForFunction(el => el.value === 'Bản nháp kiểm thử.', await body.elementHandle())
        assert.equal(await from.inputValue(), sender)
        assert.equal(sendRequests, 0)
        assert.equal(await page.getByRole('region', { name: 'Thư quan trọng' }).count(), 0)
        assert.ok(await page.getByRole('button', { name: 'Gửi', exact: true }).isEnabled())
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        results.at(-1).composeAxe = await audit(page)
        await screenshot(page, 'mobile-compose')
        record('mobile compose selects a sender and generates a stub draft without attempting to send', true)
      }

      if (name === 'dark') {
        inboxMode = 'empty'
        await page.reload()
        await page.getByRole('heading', { name: 'Hộp thư trống' }).waitFor()
        await page.getByRole('button', { name: 'Tất cả tài khoản' }).waitFor()
        await screenshot(page, 'dark-empty')
        inboxMode = 'error'
        await page.reload()
        await page.getByRole('heading', { name: 'Chưa tải được hộp thư' }).waitFor()
        inboxMode = 'data'
        await page.getByRole('button', { name: 'Tải lại', exact: true }).click()
        await opener.waitFor()
        record('empty mailbox and recoverable load error remain distinct', true)
      }
      await context.close()
    }
  } finally {
    writeFileSync(`${output}/browser.json`, JSON.stringify({ engine: browser.version(), results }, null, 2) + '\n')
    await browser.close()
  }
  const violations = results.flatMap(result => [...result.axe, ...(result.readingAxe || []), ...(result.dialogAxe || []), ...(result.composeAxe || []), ...(result.priorityAxe || [])])
  assert.deepEqual(violations, [], 'axe found violations in the sampled views')
  record('axe reports no WCAG-tagged violations across sampled Inbox states', true)
  assert.deepEqual(results.flatMap(result => result.runtimeErrors), [], 'browser raised an uncaught exception')
}

async function seedActionInbox(admin, userId, accountId, otherAccountId) {
  const base = {
    user_id: userId, source_account_id: accountId, from_name: 'Tổ vận hành',
    from_address: 'operations@example.test', category: 'work', priority: 3,
    direction: 'inbound', is_read: true, body_fetched: true,
  }
  const seed = (subject, hours, fields = {}) => ({
    ...base, id: randomUUID(), subject,
    received_at: new Date(Date.now() - hours * 3_600_000).toISOString(), ...fields,
  })
  const incident = seed('Cảnh báo dừng dây chuyền số 3', 1, {
    category: 'personal', priority: 1, body_text: 'Cảm biến báo dừng dây chuyền. Đội ca tối đang kiểm tra.',
    from_name: 'Mai Trần', from_address: 'new-sender@example.test',
  })
  const receipt = seed('Thanh toán thành công cho PO-098', 2, {
    source_account_id: otherAccountId, category: 'transaction', priority: 5, is_read: false, needs_reply: true,
  })
  const current = seed('Báo cáo tồn kho quý IV', 3)
  const history = [
    seed('Đối chiếu phiếu nhập kho số 09', 30, { inbox_priority: 'action', inbox_priority_version: 1 }),
    seed('Đối chiếu phiếu nhập kho số 08', 54, { inbox_priority: 'action', inbox_priority_version: 1 }),
  ]
  assert.equal((await admin.from('emails').insert([incident, receipt, current, ...history], { defaultToNull: false })).error, null)
  return { incident, receipt, current, history }
}

async function rehearsePriorityUi({ page, app, admin, action, record, screenshot, result, loseSaveResponse }) {
  const { incident, receipt, current, history } = action
  await page.goto(`${app}/inbox`)
  const openIncident = page.getByRole('button', { name: new RegExp(`^Mở thư: ${incident.subject}`) })
  await openIncident.waitFor()
  assert.ok((await page.locator('.neo-mail-row').first().textContent()).includes(incident.subject))
  assert.equal(await page.getByRole('button', { name: new RegExp(`^Mở thư: ${receipt.subject}`) }).count(), 0)
  record('read low-priority incident rises above manual and classifier hints; high-priority receipt stays in Read later', true)

  await page.getByRole('button', { name: `Ưu tiên và nguồn: ${current.subject}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Ưu tiên và nguồn' })
  await dialog.getByText(/hai thư gần đây/).waitFor()
  for (const email of history) {
    assert.equal(await dialog.getByRole('link', { name: email.subject }).getAttribute('href'), `/inbox?email=${email.id}`)
  }
  await dialog.getByRole('link', { name: history[0].subject }).click()
  await page.getByRole('heading', { name: history[0].subject, exact: true }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('email'), history[0].id)
  record('same-sender learned tie-break cites and opens the actual historical email', true)

  await page.getByRole('button', { name: `Ưu tiên và nguồn: ${incident.subject}`, exact: true }).click()
  await dialog.locator('q').getByText('dừng dây chuyền', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('link', { name: incident.subject }).getAttribute('href'), `/inbox?email=${incident.id}`)
  result.priorityAxe = await audit(page)
  await screenshot(page, 'desktop-priority')
  await dialog.getByRole('radio', { name: 'Đọc sau', exact: true }).check()
  loseSaveResponse()
  await dialog.getByRole('button', { name: 'Lưu ưu tiên' }).click()
  await dialog.getByRole('alert').getByText(/Chưa xác nhận được thay đổi/).waitFor()
  const committed = await admin.from('emails').select('inbox_priority, inbox_priority_version').eq('id', incident.id).single()
  assert.deepEqual(committed.data, { inbox_priority: 'later', inbox_priority_version: 1 })
  await dialog.getByRole('button', { name: 'Lưu ưu tiên' }).click()
  await dialog.getByText('Đã lưu ưu tiên.', { exact: true }).waitFor()
  record('losing a committed save response permits retry of the same correction without a new revision', true)

  await page.goto(`${app}/inbox`)
  await page.getByRole('button', { name: /^Đọc sau/ }).click()
  await openIncident.waitFor()
  await page.getByRole('button', { name: `Ưu tiên và nguồn: ${incident.subject}`, exact: true }).click()
  assert.equal(await dialog.getByRole('radio', { name: 'Đọc sau', exact: true }).isChecked(), true)
  await dialog.getByText(/Bạn đã chọn đọc sau/).waitFor()
  await dialog.getByRole('radio', { name: 'Tự động' }).check()
  await dialog.getByRole('button', { name: 'Lưu ưu tiên' }).click()
  await dialog.getByText('Đã lưu ưu tiên.', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click()
  assert.ok((await page.locator('.neo-mail-row').first().textContent()).includes(incident.subject))
  record('correction survives reload and resetting to automatic restores incident priority', true)

  await page.goto(`${app}/inbox?email=${randomUUID()}`)
  await page.getByRole('heading', { name: 'Chưa mở được email nguồn' }).waitFor()
  record('unavailable evidence shows a recoverable source state', true)
}

async function rehearsePagination({ page, app, admin, userId, accountId, record, failPage }) {
  const tiedAt = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const emails = Array.from({ length: 54 }, (_, index) => ({
    id: randomUUID(), user_id: userId, source_account_id: accountId, from_address: 'batch@example.test',
    subject: `Lô thử nghiệm ${index}`, direction: 'inbound', is_read: true, received_at: index < 52 ? tiedAt : null,
  }))
  assert.equal((await admin.from('emails').insert(emails)).error, null)
  try {
    await page.goto(`${app}/inbox`)
    const search = page.getByRole('searchbox', { name: 'Tìm kiếm email' })
    await search.fill('Lô thử nghiệm 53')
    await search.press('Enter')
    await page.getByRole('heading', { name: 'Không tìm thấy kết quả' }).waitFor()
    failPage()
    const loadMore = page.getByRole('button', { name: 'Tải thêm', exact: true })
    await loadMore.click()
    await page.getByText('Chưa tải được trang tiếp theo.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Thử tải thêm' }).click()
    await page.getByRole('button', { name: /^Mở thư: Lô thử nghiệm 53,/ }).waitFor()
    record('an empty search can retry a failed page and reveal an older source', true)
    await page.getByRole('button', { name: 'Xóa tìm kiếm' }).click()
    await page.getByText('Đã hiển thị tất cả', { exact: true }).waitFor()
    const messages = page.getByRole('button', { name: /^Mở thư: Lô thử nghiệm \d+,/ })
    assert.equal(await messages.count(), emails.length)
    record('Inbox loads all messages across a timestamp tie and legacy null timestamps with no duplicates', true)
  } finally {
    assert.equal((await admin.from('emails').delete().eq('user_id', userId).in('id', emails.map(email => email.id))).error, null)
  }
}
