'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { composeRequest } from '@/lib/compose/client'
import type { DeviceFile } from '../../../public/offline-workspace/compose.mjs'
import { composeFileCount, composeFileLimit, type ComposeFile, type SourceFile } from '@/lib/compose/contracts'

const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
const fileSize = (size: number) => size < 1024 ? size + ' B'
  : formatter.format(size / (size < 1024 * 1024 ? 1024 : 1024 * 1024)) + (size < 1024 * 1024 ? ' KB' : ' MB')

export function ComposeFileList({ files, sourceFiles = [], onRemove }: {
  files: DeviceFile[]
  sourceFiles?: SourceFile[]
  onRemove?: (id: string) => void
}) {
  if (!files.length) return null
  return <ul aria-label="Tệp đính kèm" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
    {files.map(file => {
      const sourceIndex = sourceFiles.findIndex(source => source.id === file.sourceAttachmentId)
      return <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-sm">
        <span className="min-w-0 break-all">{file.filename}
          <span className="text-[var(--foreground-muted)]">
            {' · ' + fileSize(file.size)}{sourceIndex >= 0 && ' · Tệp ' + (sourceIndex + 1) + ' từ thư gốc'}
          </span>
        </span>
        {onRemove && <Button type="button" variant="ghost" size="sm" className="min-h-11"
          aria-label={'Gỡ ' + file.filename} onClick={() => onRemove(file.id)}>Gỡ tệp</Button>}
      </li>
    })}
  </ul>
}

export function ComposeFiles({ files, onChange, onBusy, disabled, sourceId, sourceFiles = [] }: {
  files: ComposeFile[]
  onChange: (files: ComposeFile[]) => void
  onBusy: (busy: boolean) => void
  disabled: boolean
  sourceId?: string
  sourceFiles?: SourceFile[]
}) {
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(requests: RequestInit[]) {
    if (pending.current || disabled) return
    pending.current = true
    onBusy(true)
    setBusy(true)
    setError(null)
    const next = [...files]
    let total = next.reduce((sum, file) => sum + file.size, 0)
    try {
      if (next.length + requests.length > composeFileCount) throw new Error('Có thể đính kèm tối đa 5 tệp.')
      for (const request of requests) {
        const file = await composeRequest<ComposeFile>('/api/compose-files', request)
        if (total + file.size > composeFileLimit) throw new Error('Tổng dung lượng tệp tối đa 8 MB.')
        next.push(file)
        total += file.size
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa thể lưu tệp.')
    } finally {
      onChange(next)
      setBusy(false)
      onBusy(false)
      pending.current = false
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (chosen.some(file => !file.size) || files.reduce((sum, file) => sum + file.size, 0) +
      chosen.reduce((sum, file) => sum + file.size, 0) > composeFileLimit) {
      setError('Chọn tệp có nội dung, tổng dung lượng tối đa 8 MB.')
      return
    }
    if (chosen.length) void add(chosen.map(file => ({
      method: 'POST', headers: { 'X-File-Name': encodeURIComponent(file.name),
        'Content-Type': file.type || 'application/octet-stream' }, body: file,
    })))
  }

  return <div className="space-y-2">
    {sourceId && sourceFiles.length > 0 && <fieldset className="space-y-2" disabled={disabled || busy}>
      <legend className="text-sm font-semibold">Tệp từ thư gốc</legend>
      {sourceFiles.map((source, index) => {
        const selected = files.find(file => file.sourceAttachmentId === source.id)
        return <div key={source.id} className="flex flex-wrap items-center gap-x-3">
          <label className="flex min-h-11 items-center gap-2 break-all text-sm">
            <input type="checkbox" checked={!!selected} onChange={() => {
              if (selected) onChange(files.filter(file => file.id !== selected.id))
              else void add([{ method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, attachmentId: source.id }) }])
            }} />
            <span>{source.filename} · Tệp {index + 1}{source.size != null ? ' · ' + fileSize(source.size) : ''}</span>
          </label>
          <a href={'/api/attachments/' + source.id} download={source.filename}
            aria-label={'Tải tệp nguồn ' + (index + 1) + ' ' + source.filename}
            className="neo-target inline-flex items-center text-sm underline">Tải tệp nguồn</a>
        </div>
      })}
    </fieldset>}
    <input ref={input} aria-label="Chọn tệp đính kèm" type="file" multiple hidden onChange={upload} disabled={disabled || busy} />
    <Button type="button" variant="outline" loading={busy} disabled={disabled} className="min-h-11"
      leftIcon={<Paperclip size={16} aria-hidden="true" />} onClick={() => input.current?.click()}>Đính kèm tệp</Button>
    {busy && <p role="status" className="text-sm text-[var(--foreground-muted)]">Đang thêm tệp…</p>}
    {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
    <ComposeFileList files={files} sourceFiles={sourceFiles} onRemove={disabled || busy ? undefined : id => onChange(files.filter(file => file.id !== id))} />
  </div>
}
