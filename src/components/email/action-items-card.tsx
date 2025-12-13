'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle2, Circle, Clock, HelpCircle, Calendar,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
  ListTodo, Sparkles, RefreshCw, ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionItem {
  id: string
  type: 'task' | 'deadline' | 'question' | 'meeting' | 'follow_up'
  title: string
  description: string | null
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed'
  context: string
}

interface ActionItemsCardProps {
  emailId: string
  onViewAll?: () => void
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  task: ListTodo,
  deadline: Clock,
  question: HelpCircle,
  meeting: Calendar,
  follow_up: RefreshCw,
}

const typeLabels: Record<string, string> = {
  task: 'Việc cần làm',
  deadline: 'Hạn chót',
  question: 'Câu hỏi',
  meeting: 'Cuộc họp',
  follow_up: 'Theo dõi',
}

const priorityColors: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10',
  medium: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
  low: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10',
}

const priorityLabels: Record<string, string> = {
  high: 'Gấp',
  medium: 'Trung bình',
  low: 'Thấp',
}

export function ActionItemsCard({ emailId, onViewAll }: ActionItemsCardProps) {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Reset when email changes
  useEffect(() => {
    setActions([])
    setHasLoaded(false)
  }, [emailId])

  useEffect(() => {
    if (emailId && !hasLoaded) {
      fetchActions()
    }
  }, [emailId, hasLoaded])

  const fetchActions = async () => {
    setLoading(true)
    setHasLoaded(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/extract-actions`)
      const data = await res.json()
      setActions(data.actions || [])
    } catch (error) {
      console.error('Failed to fetch actions:', error)
    } finally {
      setLoading(false)
    }
  }

  const extractActions = async () => {
    setExtracting(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/extract-actions`, {
        method: 'POST'
      })
      const data = await res.json()
      setActions(data.actions || [])
    } catch (error) {
      console.error('Failed to extract actions:', error)
    } finally {
      setExtracting(false)
    }
  }

  const toggleStatus = async (actionId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'

    // Optimistic update
    setActions(prev => prev.map(a =>
      a.id === actionId ? { ...a, status: newStatus as ActionItem['status'] } : a
    ))

    try {
      await fetch(`/api/action-items/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
    } catch (error) {
      // Revert on error
      setActions(prev => prev.map(a =>
        a.id === actionId ? { ...a, status: currentStatus as ActionItem['status'] } : a
      ))
      console.error('Failed to update status:', error)
    }
  }

  const formatDueDate = (date: string | null) => {
    if (!date) return null
    const d = new Date(date)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (d.toDateString() === today.toDateString()) return 'Hôm nay'
    if (d.toDateString() === tomorrow.toDateString()) return 'Ngày mai'

    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return `Quá hạn ${Math.abs(diffDays)} ngày`
    if (diffDays <= 7) return `${diffDays} ngày nữa`

    return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  if (loading) {
    return (
      <div className="mb-4 p-4 bg-[var(--secondary)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
          <span className="text-sm text-[var(--foreground-secondary)]">Đang tải actions...</span>
        </div>
      </div>
    )
  }

  // Show extract button if no actions
  if (actions.length === 0 && hasLoaded) {
    return (
      <div className="mb-4">
        <button
          onClick={extractActions}
          disabled={extracting}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl',
            'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-500/10 dark:to-indigo-500/10',
            'border border-purple-100 dark:border-purple-500/20',
            'text-purple-800 dark:text-purple-300 font-medium text-sm',
            'hover:from-purple-100 hover:to-indigo-100 dark:hover:from-purple-500/20 dark:hover:to-indigo-500/20',
            'transition-all disabled:opacity-50'
          )}
        >
          {extracting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang trích xuất...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Trích xuất Actions từ email
            </>
          )}
        </button>
      </div>
    )
  }

  if (actions.length === 0) return null

  const pendingActions = actions.filter(a => a.status !== 'completed')
  const hasHighPriority = pendingActions.some(a => a.priority === 'high')

  return (
    <div className={cn(
      'mb-4 rounded-xl border overflow-hidden transition-all duration-200',
      hasHighPriority
        ? 'bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-500/5 dark:to-orange-500/5 border-red-100 dark:border-red-500/20'
        : 'bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-500/5 dark:to-indigo-500/5 border-purple-100 dark:border-purple-500/20'
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            hasHighPriority
              ? 'bg-gradient-to-br from-red-500 to-orange-500'
              : 'bg-gradient-to-br from-purple-500 to-indigo-500'
          )}>
            <ListTodo className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Actions ({pendingActions.length})
              </p>
              {hasHighPriority && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded">
                  <AlertTriangle className="w-3 h-3" />
                  GẤP
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--foreground-muted)]">
              Việc cần làm từ email này
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--foreground-muted)]" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {actions.map((action) => {
            const Icon = typeIcons[action.type] || ListTodo
            const isCompleted = action.status === 'completed'
            const dueDateText = formatDueDate(action.due_date)
            const isOverdue = dueDateText?.includes('Quá hạn')

            return (
              <div
                key={action.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg bg-white/70 dark:bg-white/5',
                  'border border-transparent hover:border-[var(--border)]',
                  'transition-all',
                  isCompleted && 'opacity-60'
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleStatus(action.id, action.status)}
                  className={cn(
                    'flex-shrink-0 mt-0.5 transition-colors',
                    isCompleted
                      ? 'text-green-500'
                      : 'text-[var(--muted-foreground)] hover:text-green-500'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm font-medium text-[var(--foreground)]',
                      isCompleted && 'line-through'
                    )}>
                      {action.title}
                    </p>
                    <span className={cn(
                      'flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded',
                      priorityColors[action.priority]
                    )}>
                      {priorityLabels[action.priority]}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                      <Icon className="w-3 h-3" />
                      {typeLabels[action.type]}
                    </span>
                    {dueDateText && (
                      <span className={cn(
                        'flex items-center gap-1 text-xs',
                        isOverdue
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : 'text-[var(--foreground-muted)]'
                      )}>
                        <Clock className="w-3 h-3" />
                        {dueDateText}
                      </span>
                    )}
                  </div>

                  {/* Context quote */}
                  {action.context && (
                    <p className="mt-2 text-xs text-[var(--foreground-subtle)] italic line-clamp-2 pl-2 border-l-2 border-[var(--border)]">
                      "{action.context}"
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {/* View all link */}
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              Xem tất cả Actions
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
