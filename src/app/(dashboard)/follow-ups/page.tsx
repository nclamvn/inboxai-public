'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, CheckCircle, XCircle, RefreshCw,
  Loader2, AlertCircle, MessageSquare, Mail,
  Calendar, ChevronRight, Sparkles, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface FollowUp {
  id: string
  type: 'awaiting_reply' | 'needs_reply' | 'commitment_due' | 'question_asked' | 'action_required'
  priority: 'high' | 'medium' | 'low'
  reason: string
  suggested_action: string
  due_date: string | null
  person_email: string
  person_name: string | null
  confidence: number
  status: 'pending' | 'done' | 'dismissed'
  created_at: string
  emails?: {
    id: string
    subject: string
    from_address: string
    from_name: string
    received_at: string
    snippet: string
    category: string
  }
}

const typeLabels: Record<string, string> = {
  awaiting_reply: 'Đang chờ phản hồi',
  needs_reply: 'Cần trả lời',
  commitment_due: 'Deadline',
  question_asked: 'Câu hỏi',
  action_required: 'Cần hành động'
}

const typeIcons: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  awaiting_reply: Clock,
  needs_reply: MessageSquare,
  commitment_due: Calendar,
  question_asked: AlertCircle,
  action_required: Bell
}

const priorityColors: Record<string, { bg: string; text: string; badge: 'urgent' | 'warning' | 'info' }> = {
  high: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', badge: 'urgent' },
  medium: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', badge: 'warning' },
  low: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', badge: 'info' }
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [counts, setCounts] = useState({ total: 0, high: 0, medium: 0, low: 0 })
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const router = useRouter()

  const fetchFollowUps = useCallback(async () => {
    setLoading(true)
    try {
      const priorityParam = filter !== 'all' ? `&priority=${filter}` : ''
      const res = await fetch(`/api/follow-ups?status=pending${priorityParam}`)
      const data = await res.json()
      setFollowUps(data.followUps || [])
      setCounts(data.counts || { total: 0, high: 0, medium: 0, low: 0 })
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchFollowUps()
  }, [fetchFollowUps])

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  const handleScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan: true })
      })
      const data = await res.json()
      setToastMessage(`Tìm thấy ${data.found} follow-up cần xử lý`)
      await fetchFollowUps()
    } catch (error) {
      console.error('Failed to scan:', error)
      setToastMessage('Không thể quét email')
    } finally {
      setScanning(false)
    }
  }

  const handleMarkDone = async (id: string) => {
    try {
      await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' })
      })
      setFollowUps(prev => prev.filter(f => f.id !== id))
      setCounts(prev => ({ ...prev, total: prev.total - 1 }))
      setToastMessage('Đã đánh dấu xong')
    } catch {
      setToastMessage('Không thể cập nhật')
    }
  }

  const handleDismiss = async (id: string) => {
    try {
      await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'dismissed' })
      })
      setFollowUps(prev => prev.filter(f => f.id !== id))
      setCounts(prev => ({ ...prev, total: prev.total - 1 }))
      setToastMessage('Đã bỏ qua')
    } catch {
      setToastMessage('Không thể cập nhật')
    }
  }

  const handleOpenEmail = (emailId: string) => {
    router.push(`/inbox?emailId=${emailId}`)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Hôm nay'
    if (diffDays === 1) return 'Hôm qua'
    if (diffDays < 7) return `${diffDays} ngày trước`
    return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-3 rounded-xl shadow-lg text-[14px] animate-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-[20px] font-semibold text-[var(--foreground)]">
                Follow-ups
              </h1>
              <p className="text-[14px] text-[var(--muted-foreground)]">
                Email cần theo dõi và phản hồi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={fetchFollowUps}
              disabled={loading}
              variant="ghost"
              size="sm"
              icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} strokeWidth={1.5} />}
            />
            <Button
              onClick={handleScan}
              disabled={scanning}
              loading={scanning}
              size="sm"
              icon={<Sparkles className="w-4 h-4" strokeWidth={1.5} />}
            >
              Quét email
            </Button>
          </div>
        </div>

        {/* Priority filters */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              filter === 'all'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--hover)]'
            )}
          >
            Tất cả ({counts.total})
          </button>
          <button
            onClick={() => setFilter('high')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              filter === 'high'
                ? 'bg-red-500 text-white'
                : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20'
            )}
          >
            Quan trọng ({counts.high})
          </button>
          <button
            onClick={() => setFilter('medium')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              filter === 'medium'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20'
            )}
          >
            Trung bình ({counts.medium})
          </button>
          <button
            onClick={() => setFilter('low')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              filter === 'low'
                ? 'bg-blue-500 text-white'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20'
            )}
          >
            Thấp ({counts.low})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
          </div>
        ) : followUps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[var(--secondary)] rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" strokeWidth={1.5} />
            </div>
            <p className="text-[16px] font-medium text-[var(--foreground)] mb-1">
              Không có follow-up nào
            </p>
            <p className="text-[14px] text-[var(--muted-foreground)] mb-4">
              {filter !== 'all' ? 'Không có follow-up với mức ưu tiên này' : 'Bạn đã xử lý hết các email cần theo dõi!'}
            </p>
            <Button
              onClick={handleScan}
              disabled={scanning}
              loading={scanning}
              icon={<Sparkles className="w-4 h-4" strokeWidth={1.5} />}
            >
              Quét email mới
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {followUps.map((followUp) => {
              const TypeIcon = typeIcons[followUp.type] || Mail
              const colors = priorityColors[followUp.priority] || priorityColors.medium

              return (
                <div
                  key={followUp.id}
                  className={cn(
                    'border rounded-xl p-4 transition-colors cursor-pointer hover:shadow-sm',
                    'border-[var(--border)] bg-[var(--card)]'
                  )}
                  onClick={() => followUp.emails?.id && handleOpenEmail(followUp.emails.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Type Icon */}
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      colors.bg
                    )}>
                      <TypeIcon className={cn('w-5 h-5', colors.text)} strokeWidth={1.5} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={colors.badge} size="sm">
                          {typeLabels[followUp.type] || followUp.type}
                        </Badge>
                        {followUp.due_date && (
                          <span className="text-[12px] text-[var(--muted-foreground)] flex items-center gap-1">
                            <Calendar className="w-3 h-3" strokeWidth={1.5} />
                            {formatDate(followUp.due_date)}
                          </span>
                        )}
                      </div>

                      {followUp.emails && (
                        <p className="text-[14px] font-medium text-[var(--foreground)] truncate">
                          {followUp.emails.subject || '(Không có tiêu đề)'}
                        </p>
                      )}

                      <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                        {followUp.person_name || followUp.person_email}
                        {followUp.emails && (
                          <span className="ml-2">• {formatDate(followUp.emails.received_at)}</span>
                        )}
                      </p>

                      <p className="text-[13px] text-[var(--muted)] mt-1">
                        {followUp.reason}
                      </p>

                      {followUp.suggested_action && (
                        <p className="text-[12px] text-purple-600 dark:text-purple-400 mt-2 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                          {followUp.suggested_action}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleMarkDone(followUp.id)}
                        className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10 text-green-600 dark:text-green-400 transition-colors"
                        title="Đánh dấu xong"
                      >
                        <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => handleDismiss(followUp.id)}
                        className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--muted-foreground)] transition-colors"
                        title="Bỏ qua"
                      >
                        <XCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <ChevronRight className="w-5 h-5 text-[var(--muted)]" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
