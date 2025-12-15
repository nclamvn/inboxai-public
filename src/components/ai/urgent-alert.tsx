'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, X, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconBox } from '@/components/ui/icon-box'
import { Button } from '@/components/ui/button'

interface UrgentEmail {
  id: string
  from_name: string | null
  from_address: string
  subject: string
  priority: number
}

interface Props {
  onSelectEmail: (id: string) => void
}

export function UrgentAlert({ onSelectEmail }: Props) {
  const [alerts, setAlerts] = useState<UrgentEmail[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const checkUrgentEmails = async () => {
      try {
        const res = await fetch('/api/ai/urgent-check')
        if (res.ok) {
          const data = await res.json()
          setAlerts(data.urgentEmails || [])
        }
      } catch (error) {
        console.error('Failed to check urgent emails:', error)
      }
    }

    checkUrgentEmails()
    // Refresh every 10 minutes (was 5 minutes - performance optimization)
    const interval = setInterval(checkUrgentEmails, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id))
  }

  const handleSelect = (id: string) => {
    onSelectEmail(id)
    handleDismiss(id)
  }

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id))

  if (visibleAlerts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-sm">
      {visibleAlerts.slice(0, 3).map((email, index) => (
        <div
          key={email.id}
          className={cn(
            'bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-executive-lg p-4',
            'animate-in slide-in-from-right-5 fade-in duration-300'
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-900 dark:text-white font-medium mb-1">
                Email quan trọng
              </p>
              <p className="text-[14px] font-medium text-[var(--foreground)] truncate">
                {email.from_name || email.from_address}
              </p>
              <p className="text-[13px] text-[var(--muted-foreground)] truncate">
                {email.subject || '(Không có tiêu đề)'}
              </p>
            </div>
            <button
              onClick={() => handleDismiss(email.id)}
              className="p-1 rounded-lg hover:bg-[var(--secondary)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--muted)]" strokeWidth={1.5} />
            </button>
          </div>
          <Button
            onClick={() => handleSelect(email.id)}
            size="sm"
            className="mt-3 w-full"
            icon={<ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />}
          >
            Xem ngay
          </Button>
        </div>
      ))}
    </div>
  )
}
