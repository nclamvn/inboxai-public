import { localFile, validateDraftFiles } from './compose.mjs'

export function renderCompose({ work, active, entry, node, action, changed, isActive, render }) {
  const article = node('article')
  const status = node('p', 'Đã lưu trên thiết bị', { className: 'meta' })
  status.setAttribute('role', 'status')
  const alert = node('p', '', { className: 'error' })
  alert.setAttribute('role', 'alert')
  const id = entry.source
  let draft = entry.value
  let version = entry.version
  let saving = false
  let pending = false
  let timer
  article.append(node('h2', draft.sourceId ? 'Bản nháp chuyển tiếp' : 'Bản nháp thư mới'))
  const account = node('select')
  for (const value of draft.accounts) account.append(node('option', value.address, { value: value.id }))
  account.value = draft.accountId
  function field(label, input) {
    input.id = 'offline-compose-' + (article.children.length + 1)
    const wrapper = node('div', '', { className: 'compose-field' })
    wrapper.append(node('label', label, { htmlFor: input.id }), input)
    article.append(wrapper)
    return input
  }
  field('Tài khoản gửi', account)
  const fields = Object.fromEntries([['to', 'Người nhận', 4000], ['cc', 'Cc', 4000],
    ['subject', 'Tiêu đề', 500], ['body', 'Nội dung thư', 100000]].map(([key, label, maxLength]) =>
    [key, field(label, node(key === 'body' ? 'textarea' : 'input', '', { value: draft.fields[key], maxLength }))]))
  const files = node('ul', '', { className: 'compose-files' })
  files.setAttribute('aria-label', 'Tệp đính kèm')
  const picker = field('Thêm tệp trên thiết bị', node('input', '', { type: 'file', multiple: true }))
  const uploadError = reason => { alert.textContent = reason.message || 'Chưa lưu được bản nháp.' }
  article.append(files, status, alert)

  function capture(nextFiles) {
    return { ...draft, files: nextFiles, accountId: account.value,
      fields: Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])), updatedAt: Date.now() }
  }
  async function save(nextFiles = draft.files, added = []) {
    clearTimeout(timer)
    if (saving) { pending = true; return }
    saving = true
    pending = false
    picker.disabled = true
    alert.textContent = ''
    changed(true)
    status.textContent = 'Đang lưu trên thiết bị…'
    try {
      const snapshot = capture(nextFiles)
      version = await active.saveCompose(id, version, snapshot, added)
      draft = snapshot
      if (isActive()) {
        renderFiles()
        if (!pending) {
          changed(false)
          status.textContent = 'Đã lưu trên thiết bị'
        }
      }
    } catch (reason) {
      if (isActive()) uploadError(reason)
    } finally {
      saving = false
      picker.disabled = false
      if (pending && isActive()) void save()
    }
  }
  function renderFiles() {
    files.replaceChildren(...draft.files.map(file => {
      const item = node('li')
      const tools = node('div', '', { className: 'actions' })
      if (file.local) tools.append(action('Tải tệp', async () => {
        const bytes = await active.getComposeFile(id, file.id)
        if (!isActive()) return
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
        const link = node('a', '', { href: url, download: file.filename, hidden: true })
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }))
      tools.append(action('Gỡ tệp', async () => {
        if (!saving) await save(draft.files.filter(candidate => candidate.id !== file.id))
      }))
      tools.querySelectorAll('button').forEach(button => button.setAttribute('aria-label', button.textContent + ' ' + file.filename))
      item.append(node('span', file.filename + ' · ' + file.size.toLocaleString('vi-VN') + ' B'), tools)
      return item
    }))
  }
  for (const input of [...Object.values(fields), account]) input.addEventListener('input', () => {
    changed(true)
    status.textContent = 'Đang lưu trên thiết bị…'
    if (saving) pending = true
    else {
      clearTimeout(timer)
      timer = setTimeout(() => { if (isActive()) void save() }, 250)
    }
  })
  picker.addEventListener('change', () => {
    try {
      const added = Array.from(picker.files ?? [], bytes => ({ file: localFile(bytes), bytes }))
      picker.value = ''
      if (!added.length) return
      const next = [...draft.files, ...added.map(item => item.file)]
      validateDraftFiles(next)
      void save(next, added)
    } catch (reason) { uploadError(reason) }
  })
  const reconcile = node('a', 'Đối chiếu bản nháp trên máy chủ', { href: '/compose?' + new URLSearchParams({ offlineDraft: id }) })
  reconcile.dataset.reconcile = ''
  const actions = node('div', '', { className: 'actions' })
  actions.append(reconcile, action('Bỏ bản nháp trên thiết bị', async () => {
    if (saving || !window.confirm('Bỏ bản nháp đã lưu trên thiết bị?')) return
    clearTimeout(timer)
    await active.removeCompose(id, version)
    changed(false)
    render()
  }))
  article.append(actions)
  renderFiles()
  work.append(article)
}
