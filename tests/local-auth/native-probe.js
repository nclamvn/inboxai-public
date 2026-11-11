void (async () => {
  const report = data => fetch('/__m6_native/result', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
  async function until(read) {
    const end = performance.now() + 12_000
    while (performance.now() < end) {
      const value = read()
      if (value) return value
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Native view did not reach the expected state: ' + location.pathname + location.search)
  }
  try {
    localStorage.setItem('inboxai_onboarding_seen', 'true')
    const bridge = window.Capacitor
    if (!bridge?.isNativePlatform()) throw new Error('Capacitor native bridge missing')
    const platform = bridge.getPlatform()
    const subject = 'Lịch kho M6 000'
    const firstRow = () => document.querySelector(`[data-email-opener][aria-label*="${subject}"]`)
    const opener = await until(firstRow)
    opener.click()
    await until(() => location.search.includes('email='))
    await until(() => [...document.querySelectorAll('h1')].find(heading => heading.textContent === subject))
    const result = await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    const keyboard = platform === 'ios' ? (await bridge.nativePromise('Keyboard', 'getResizeMode', {})).mode : undefined
    await report({ stage: 'reading', platform, keyboard, viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth > innerWidth, axe: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) })
    if (platform === 'ios') {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const back = document.querySelector('button[aria-label="Về hộp thư"], button[title="Đóng"]')
      if (!back) throw new Error('Inbox return control missing')
      back.click()
    }
    await until(() => !location.search && firstRow() && document.activeElement === firstRow())
    await report({ stage: 'returned', restoredFocus: document.activeElement === firstRow() })
  } catch (error) {
    await report({ error: error.message })
  }
})()
