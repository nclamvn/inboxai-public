'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

interface UrgentEmail {
  id: string
  from_name: string | null
  from_address: string
  subject: string
  priority: number
}

interface Props {
  onSelectEmail: (id: string) => void
  hidden?: boolean
}

export function UrgentAlert({ onSelectEmail, hidden = false }: Props) {
  const [alerts, setAlerts] = useState<UrgentEmail[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let pending: AbortController | undefined
    const checkUrgentEmails = async () => {
      pending?.abort()
      const request = new AbortController()
      pending = request
      try {
        const res = await fetch('/api/ai/urgent-check', { signal: request.signal })
        if (res.ok) {
          const data = await res.json()
          if (!request.signal.aborted) setAlerts(data.urgentEmails || [])
        }
      } catch (error) {
        if (!request.signal.aborted) console.error('Failed to check urgent emails:', error)
      }
    }

    checkUrgentEmails()
    // Refresh every 10 minutes (was 5 minutes - performance optimization)
    const interval = setInterval(checkUrgentEmails, 10 * 60 * 1000)
    window.addEventListener('inbox-priority-changed', checkUrgentEmails)
    return () => {
      clearInterval(interval)
      pending?.abort()
      window.removeEventListener('inbox-priority-changed', checkUrgentEmails)
    }
  }, [])

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id))
  }

  const handleSelect = (id: string) => {
    onSelectEmail(id)
    handleDismiss(id)
  }

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id))

  if (hidden || visibleAlerts.length === 0) return null

  return (
    <section
      aria-label="Thư quan trọng"
      className="fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+12px)] z-40 grid grid-cols-1 gap-2 md:left-auto md:bottom-4 md:w-80"
    >
      {visibleAlerts.slice(0, 3).map(email => (
        <div
          key={email.id}
          className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-[var(--border-strong)] bg-[var(--surface)] py-1 pe-1 ps-3"
        >
          <AlertCircle size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-[var(--warning)]" />
          <button
            type="button" onClick={() => handleSelect(email.id)}
            className="neo-target min-w-0 flex-1 rounded-[var(--radius-control)] px-2 py-1 text-start hover:bg-[var(--hover)]"
          >
            <span className="block truncate text-sm font-medium">{email.subject || '(Không có tiêu đề)'}</span>
            <span className="block truncate text-xs text-[var(--foreground-muted)]">{email.from_name || email.from_address}</span>
          </button>
          <button
            type="button" onClick={() => handleDismiss(email.id)}
            aria-label={`Đóng thông báo: ${email.subject || '(Không có tiêu đề)'}`}
            className="neo-icon-button"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      ))}
    </section>
  )
}
