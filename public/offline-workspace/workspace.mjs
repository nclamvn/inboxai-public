import { offlineScope, openOfflineVault, watchOfflineScope } from './storage.mjs'

const byId = id => document.getElementById(id)
const work = byId('work')
const unlock = byId('unlock')
const form = byId('unlock-form')
const password = byId('password')
const notice = byId('notice')
const lockButton = byId('lock')
let query = new URLSearchParams(location.search)
let source = query.get('reply') || query.get('email')
let vault = null
let epoch = 0
let unsaved = false

function node(tag, text, props = {}) {
  const element = document.createElement(tag)
  if (text) element.textContent = text
  Object.assign(element, props)
  return element
}

function action(text, handler) {
  const button = node('button', text, { type: 'button' })
  button.addEventListener('click', async () => {
    button.disabled = true
    try { await handler() }
    catch (error) { notice.textContent = error.message || 'Chưa hoàn tất thao tác.' }
    finally { button.disabled = false }
  })
  return button
}

const home = '/offline-workspace/index.html'
const href = (key, id) => home + '?' + new URLSearchParams({ [key]: id })
const reconcile = id => '/compose?' + new URLSearchParams({ reply: id, offline: '1' })

async function lock() {
  const attempt = ++epoch
  vault = null
  unsaved = false
  password.value = ''
  work.replaceChildren()
  work.hidden = true
  lockButton.hidden = true
  unlock.hidden = true
  notice.textContent = ''
  const scope = await offlineScope()
  if (attempt !== epoch) return
  unlock.hidden = !scope?.enrolled
  if (!scope?.enrolled) notice.textContent = 'Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.'
}

function renderConnection() {
  byId('connection').textContent = navigator.onLine ? 'Có kết nối' : 'Đang ngoại tuyến'
  for (const link of work.querySelectorAll('[data-reconcile]')) {
    link.hidden = !navigator.onLine
  }
}

async function render() {
  const active = vault
  if (!active) return
  const entries = await active.list()
  if (vault !== active) return
  work.replaceChildren()
  const records = new Map()
  for (const entry of entries) {
    const record = records.get(entry.source) ?? {}
    record[entry.kind] = entry.value
    records.set(entry.source, record)
  }
  const current = records.get(source)
  if (source) work.append(node('a', 'Về thư và bản nháp trên thiết bị', { href: home }))
  if (source && !current) {
    work.append(node('p', 'Chưa có bản lưu của thư này trên thiết bị.'))
  } else if (current) {
    if (current.mail) {
      const article = node('article')
      const mail = current.mail
      const date = mail.at ? new Date(mail.at) : null
      const dateLabel = date && Number.isFinite(date.valueOf()) ? ' · ' + date.toLocaleString('vi-VN') : ''
      article.append(node('h2', mail.subject), node('p', mail.sender + dateLabel, { className: 'meta' }),
        node('p', mail.text || 'Thư chưa có nội dung văn bản để đọc ngoại tuyến.', { className: 'copy' }))
      const actions = node('div', '', { className: 'actions' })
      actions.append(action('Bỏ lưu thư', async () => {
        await active.remove('mail', source)
        await render()
      }))
      const reply = current.draft || mail.reply
      if (reply && !query.has('reply')) actions.append(node('a', 'Tiếp tục trả lời', { href: href('reply', source) }))
      article.append(actions)
      work.append(article)
    }
    const editable = current.draft || current.mail?.reply
    if (query.has('reply') && editable) renderEditor(active, editable)
    if (query.has('reply') && !editable) work.append(node('p', 'Có thể mở lại phần trả lời khi có kết nối.'))
  } else {
    const list = node('ul', '', { className: 'list' })
    for (const [id, record] of records) {
      const item = node('li')
      const subject = record.mail?.subject || record.draft?.subject
      item.append(node('a', subject, { href: href(record.mail ? 'email' : 'reply', id) }))
      if (record.draft) item.append(node('p', 'Có bản nháp trên thiết bị', { className: 'meta' }))
      list.append(item)
    }
    work.append(records.size ? list : node('p', 'Chưa lưu thư hoặc bản nháp nào.'))
  }
  renderConnection()
}

function renderEditor(active, draft) {
  const article = node('article')
  const status = node('p', 'Thay đổi được lưu trên thiết bị.', { className: 'meta' })
  status.setAttribute('role', 'status')
  const input = (key, labelText, multiline = false) => {
    const label = node('label', labelText)
    const field = node(multiline ? 'textarea' : 'input', '', {
      value: draft.fields[key], maxLength: multiline ? 100_000 : 4_000,
    })
    label.append(field)
    article.append(label)
    return field
  }
  article.append(node('h2', 'Bản nháp trả lời'), node('p', 'Gửi từ ' + draft.account, { className: 'meta' }))
  const to = input('to', 'Người nhận')
  const cc = input('cc', 'Cc')
  const body = input('body', 'Nội dung thư', true)
  let revision = 0
  const save = async () => {
    const change = ++revision
    unsaved = true
    status.textContent = 'Đang lưu trên thiết bị…'
    try {
      await active.put('draft', source, { ...draft, fields: { to: to.value, cc: cc.value, body: body.value } })
      if (vault === active && revision === change) {
        unsaved = false
        status.textContent = 'Đã lưu trên thiết bị'
      }
    } catch (error) {
      if (vault === active && revision === change) status.textContent = error.message || 'Chưa lưu được bản nháp.'
    }
  }
  for (const field of [to, cc, body]) field.addEventListener('input', () => void save())
  const link = node('a', 'Đối chiếu bản nháp trên máy chủ', { href: reconcile(source) })
  link.dataset.reconcile = ''
  const actions = node('div', '', { className: 'actions' })
  actions.append(link, action('Bỏ bản nháp trên thiết bị', async () => {
    if (!window.confirm('Bỏ các thay đổi đã lưu trên thiết bị?')) return
    await active.remove('draft', source)
    unsaved = false
    await render()
  }))
  article.append(status, actions)
  work.append(article)
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  const submit = form.querySelector('button')
  const attempt = ++epoch
  submit.disabled = true
  notice.textContent = ''
  try {
    const scope = await offlineScope()
    if (!scope?.enrolled) throw new Error('Kho ngoại tuyến chưa được bật.')
    const active = await openOfflineVault(scope.owner, password.value)
    if (attempt !== epoch) return
    vault = active
    password.value = ''
    unlock.hidden = true
    lockButton.hidden = false
    work.hidden = false
    await render()
  } catch (error) {
    if (attempt === epoch) notice.textContent = error.message || 'Chưa mở được bản lưu ngoại tuyến.'
  } finally {
    submit.disabled = false
  }
})
function navigate() {
  query = new URLSearchParams(location.search)
  source = query.get('reply') || query.get('email')
  notice.textContent = ''
  void render().catch(error => { notice.textContent = error.message })
}

work.addEventListener('click', event => {
  const anchor = event.target.closest('a')
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (new URL(anchor.href).pathname !== home) return
  event.preventDefault()
  if (unsaved) {
    notice.textContent = 'Hãy đợi bản nháp lưu xong trước khi rời trang.'
    return
  }
  history.pushState(null, '', anchor.href)
  navigate()
})
window.addEventListener('popstate', navigate)
lockButton.addEventListener('click', () => {
  if (unsaved && !window.confirm('Khóa khi vẫn còn thay đổi chưa lưu?')) return
  void lock()
})
watchOfflineScope(() => void lock())
window.addEventListener('online', renderConnection)
window.addEventListener('offline', renderConnection)
window.addEventListener('beforeunload', event => {
  if (!unsaved) return
  event.preventDefault()
  event.returnValue = ''
})
renderConnection()
void lock().catch(() => { notice.textContent = 'Thiết bị không mở được kho ngoại tuyến.' })
