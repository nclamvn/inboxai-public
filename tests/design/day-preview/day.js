const get = id => document.getElementById(id)
let token = ''
let busy = false
let current = null

function show(id, visible) {
  get(id).hidden = !visible
}

function link(id, url, visible = Boolean(url)) {
  if (url) get(id).href = url
  else get(id).removeAttribute('href')
  show(id, visible && Boolean(url))
}

function render(state) {
  current = state
  const { stage, reminded, changed, closed, links } = state
  show('send-status', reminded)
  show('wait-reminder', !reminded && stage === 0)
  show('changed-status', changed && !closed)
  show('wait-change', stage === 2 && !changed)
  get('stage-1').disabled = busy || !reminded
  get('stage-2').disabled = busy || stage < 1
  get('stage-3').disabled = busy || !changed
  for (const number of [1, 2, 3]) show('stage-' + number, stage < number)
  link('reply-link', links.reply, stage === 1)
  link('ask-link', links.ask, stage >= 2)
  link('change-link', links.change, stage === 2 && !changed)
  link('complete-link', links.complete, stage === 3 && !closed)
  link('ledger-link', links.ledger, closed)
  link('operator-link', links.operator, closed)
}

async function refresh() {
  if (busy || document.hidden) return
  try {
    const response = await fetch('/state', { cache: 'no-store' })
    if (!response.ok) throw new Error('state')
    const state = await response.json()
    if (!busy && (!current || state.stage >= current.stage)) render(state)
  } catch {
    get('notice').textContent = 'Chưa đọc được trạng thái. Thử tải lại trang.'
  }
}

async function advance(event) {
  if (busy) return
  const button = event.currentTarget
  const number = button.dataset.stage
  busy = true
  if (current) render(current)
  try {
    const response = await fetch('/advance/' + number, { method: 'POST', headers: { 'X-Demo-Token': token } })
    const state = await response.json()
    if (!response.ok) throw new Error(state.error)
    render(state)
    get('notice').textContent = 'Đã nạp thư. Mở liên kết ở mốc vừa cập nhật.'
    get(['', 'reply-link', 'ask-link', 'complete-link'][Number(number)]).focus()
  } catch (error) {
    get('notice').textContent = error.message || 'Chưa nạp được thư. Thử lại.'
  } finally {
    busy = false
    if (current) render(current)
  }
}

async function start() {
  try {
    const response = await fetch('/config')
    if (!response.ok) throw new Error('config')
    const config = await response.json()
    token = config.token
    get('case-ref').textContent = config.reference
    get('fixture-email').textContent = config.email
    get('fixture-password').textContent = config.password
    link('open-inbox', config.app + '/inbox')
    link('open-mailpit', config.mailpit)
    for (const button of document.querySelectorAll('button[data-stage]')) button.addEventListener('click', advance)
    await refresh()
    window.setInterval(refresh, 3000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
  } catch {
    get('notice').textContent = 'Chưa kết nối được bản thử local.'
  }
}

void start()
