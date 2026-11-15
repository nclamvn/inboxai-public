import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { cases, output, writeResult } from './evaluate.mjs'

// Decisions entered by Codex in the buyer role from the messages. Timing is
// replay automation including opening each message and typing into a table.
const decisions = {
  'PO-6831': [['m1','create','2026-11-15',0],['m2','review'],['m3','progress',null,50],['m4','deadline','2026-11-19'],['m5','completed',null,200]],
  'PO-9106': [['m1','create','2026-11-18',0],['m2','progress',null,240],['m4','completed',null,600]],
  'PO-4720': [['m1','create','2026-11-20',0],['m2','review'],['m4','deadline','2026-11-24'],['m5','completed',null,80]],
  'PO-3768': [['m1','create','2026-11-22',0],['m2','progress',null,30],['m4','review'],['m5','completed',null,120]],
  'PO-7542': [['m1','create','2026-11-21',0],['m2','review'],['m3','review'],['m4','deadline','2026-11-25'],['m5','completed',null,40]],
  'PO-8213': [['m1','create','2026-11-23',0],['m2','progress',null,8],['m4','completed',null,24]],
  'PO-6932': [],
}

mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1' } })
try {
  const page = await browser.newPage({ locale: 'vi-VN' })
  const result = []
  for (const row of cases) {
    await page.setContent('<meta charset="utf-8"><h1>Thư và bảng theo dõi giao hàng</h1><ol></ol><textarea aria-label="Bảng quyết định"></textarea>')
    await page.evaluate(({ emails }) => {
      for (const mail of emails) {
        const item = document.createElement('li')
        const details = document.createElement('details')
        const summary = document.createElement('summary')
        summary.textContent = mail.id + ' · ' + mail.account + ' · ' + mail.subject
        const body = document.createElement('pre')
        body.textContent = mail.sender + '\n' + mail.at + '\n' + mail.body
        details.append(summary,body)
        item.append(details)
        document.querySelector('ol').append(item)
      }
    }, row)
    const start = performance.now()
    const read = new Map()
    for (const mail of row.emails) {
      const summary = page.locator('summary').filter({ hasText: new RegExp('^' + mail.id + ' ') })
      await summary.click()
      read.set(mail.id, await summary.locator('..').locator('pre').textContent())
    }
    const events = decisions[row.id].map(([source, kind, due = null, received = null]) => {
      const [owner, , quote] = read.get(source).split('\n')
      return { source, target: 'm1', kind, due, received, owner: kind === 'create' ? owner : null, quote }
    })
    await page.getByRole('textbox', { name: 'Bảng quyết định' }).fill(JSON.stringify(events))
    const exported = JSON.parse(await page.getByRole('textbox', { name: 'Bảng quyết định' }).inputValue())
    result.push({ id: row.id, events: exported, elapsedMs: performance.now() - start,
      emailsRead: read.size, actions: read.size + exported.length })
  }
  writeResult('manual-simulated', { mode: 'Codex role replay in Chrome, mail list plus table, no human reading time', cases: result })
} finally {
  await browser.close()
}
