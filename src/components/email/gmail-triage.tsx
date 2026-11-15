'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { TriageCommand, TriageFlag, TriageJob } from '@/lib/gmail-triage/contracts'

export const gmailTriageRefresh = 'gmail-triage-refresh'
const Context = createContext<{
  enabled: boolean
  jobs: TriageJob[]
  error: string | null
  busy: boolean
  canRetry: boolean
  run: (command: TriageCommand) => Promise<boolean>
  retry: () => void
}>({ enabled: false, jobs: [], error: null, busy: false, canRetry: false, run: async () => false, retry: () => {} })

export const useGmailTriage = () => useContext(Context)

export function GmailTriageProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [jobs, setJobs] = useState<TriageJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryCommand, setRetryCommand] = useState<TriageCommand | null>(null)
  const [running, setRunning] = useState(0)
  const requestVersion = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current
    const res = await fetch('/api/gmail-triage', { cache: 'no-store', signal })
    if (!res.ok) throw new Error()
    const data = await res.json() as { jobs: TriageJob[] }
    if (!signal?.aborted && requestVersion.current === version) setJobs(data.jobs)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const read = () => { void refresh(controller.signal).catch(() => {}) }
    read()
    window.addEventListener('online', read)
    return () => {
      controller.abort()
      window.removeEventListener('online', read)
    }
  }, [enabled, refresh])

  const run = useCallback(async (command: TriageCommand) => {
    if (!enabled) return false
    setRunning(value => value + 1)
    requestVersion.current++
    setError(null)
    setRetryCommand(null)
    try {
      const res = await fetch('/api/gmail-triage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      })
      const data = await res.json() as { job?: TriageJob; error?: string }
      if (!res.ok || !data.job) {
        if (res.status >= 500) setRetryCommand(command)
        setError(data.error ?? 'Chưa xác nhận được thao tác.')
        return false
      }
      const job = data.job
      requestVersion.current++
      setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)
        .map(item => item.id === job.undoOf ? { ...item, hasUndo: true } : item)].slice(0, 15))
      window.dispatchEvent(new Event(gmailTriageRefresh))
      return true
    } catch {
      setRetryCommand(command)
      setError('Mất kết nối. Kiểm tra lại để nhận kết quả.')
      return false
    } finally {
      setRunning(value => value - 1)
    }
  }, [enabled])

  function retry() {
    if (retryCommand) void run(retryCommand)
  }

  return <Context.Provider value={{ enabled, jobs, error, busy: running > 0, canRetry: !!retryCommand, run, retry }}>{children}</Context.Provider>
}

export const triageActions: Record<string, { flag: TriageFlag; desired: boolean }> = {
  archive: { flag: 'archived', desired: true },
  unarchive: { flag: 'archived', desired: false },
  'mark-read': { flag: 'read', desired: true },
  'mark-unread': { flag: 'read', desired: false },
  star: { flag: 'starred', desired: true },
  unstar: { flag: 'starred', desired: false },
}

const jobNames = {
  archived: ['Đưa về hộp thư', 'Lưu trữ'],
  read: ['Đánh dấu chưa đọc', 'Đánh dấu đã đọc'],
  starred: ['Bỏ gắn sao', 'Gắn sao'],
}
const itemStates = {
  pending: 'Đang chờ đồng bộ',
  verified: 'Đã xác minh',
  conflict: 'Có thay đổi mới hơn trên Gmail',
  blocked: 'Tài khoản thiếu quyền Gmail',
  gone: 'Thư không còn khả dụng',
}

export function GmailTriageStatus() {
  const { enabled, jobs, error, busy, canRetry, run, retry } = useGmailTriage()
  if (!enabled || (!jobs.length && !error && !busy)) return null

  return <section aria-label="Đồng bộ thao tác Gmail" className="max-h-[36dvh] overflow-y-auto border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
    {busy && <p role="status" className="py-2 text-[var(--foreground-muted)]">Đang xử lý thao tác Gmail…</p>}
    {error && <div className="flex flex-wrap items-center gap-2">
      <span role="alert">{error}</span>
      {canRetry && <Button variant="ghost" size="sm" disabled={busy} onClick={retry}>Kiểm tra yêu cầu</Button>}
    </div>}
    {jobs.length > 0 && <details>
      <summary className="focus-ring cursor-pointer py-2">
        Thao tác Gmail gần đây
        <span role="status" className="ms-2 text-[var(--foreground-muted)]">
          {jobs[0].items.filter(item => item.state === 'verified').length}/{jobs[0].items.length} đã xác minh
          {jobs[0].items.some(item => item.state === 'pending') && ' · Đang chờ đồng bộ'}
          {jobs[0].items.some(item => ['conflict', 'blocked', 'gone'].includes(item.state)) && ' · Cần kiểm tra'}
        </span>
      </summary>
      <ol className="divide-y divide-[var(--border)]">
        {jobs.map(job => <li key={job.id} className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{job.undoOf ? 'Hoàn tác' : jobNames[job.flag][Number(job.desired)]}</strong>
            {job.items.some(item => item.state === 'pending') &&
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run({ action: 'check', id: job.id })}>Kiểm tra lại</Button>}
            {!job.undoOf && !job.hasUndo && !job.items.some(item => item.state === 'pending') && job.items.some(item => item.canUndo) &&
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run({ action: 'undo', id: job.id })}>Hoàn tác</Button>}
          </div>
          <ul className="mt-2 space-y-1">
            {job.items.map(item => <li key={item.emailId} className="break-words [overflow-wrap:anywhere]">
              {item.subject} <span className="text-[var(--foreground-muted)]">· {item.account} · {itemStates[item.state]}
                {item.result === 'reconciled' && !job.undoOf && ' · Đã đối chiếu sau gián đoạn, không thể hoàn tác'}
              </span>
            </li>)}
          </ul>
        </li>)}
      </ol>
    </details>}
  </section>
}
