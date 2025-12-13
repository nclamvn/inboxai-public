'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ListTodo, CheckCircle2, Circle, Clock, HelpCircle,
  Calendar, RefreshCw, AlertTriangle, Loader2, Filter,
  ChevronDown, Mail, Sparkles
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
  email?: {
    id: string
    subject: string
    from_name: string | null
    from_address: string
    received_at: string
  }
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
  high: 'text-gray-900 dark:text-white bg-red-50 dark:bg-red-500/10',
  medium: 'text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-500/10',
  low: 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-500/10',
}

const priorityLabels: Record<string, string> = {
  high: 'Gấp',
  medium: 'Trung bình',
  low: 'Thấp',
}

const statusFilters = [
  { value: '', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa làm' },
  { value: 'completed', label: 'Đã hoàn thành' },
]

const typeFilters = [
  { value: '', label: 'Tất cả loại' },
  { value: 'task', label: 'Việc cần làm' },
  { value: 'deadline', label: 'Hạn chót' },
  { value: 'question', label: 'Câu hỏi' },
  { value: 'meeting', label: 'Cuộc họp' },
  { value: 'follow_up', label: 'Theo dõi' },
]

export default function ActionsPage() {
  const router = useRouter()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchActions()
  }, [statusFilter, typeFilter])

  const fetchActions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)

      const res = await fetch(`/api/action-items?${params.toString()}`)
      const data = await res.json()
      setActions(data.actions || [])
    } catch (error) {
      console.error('Failed to fetch actions:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async (actionId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'

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

  const goToEmail = (emailId: string) => {
    router.push(`/inbox?email=${emailId}`)
  }

  // Group actions by priority
  const highPriority = actions.filter(a => a.priority === 'high' && a.status !== 'completed')
  const mediumPriority = actions.filter(a => a.priority === 'medium' && a.status !== 'completed')
  const lowPriority = actions.filter(a => a.priority === 'low' && a.status !== 'completed')
  const completed = actions.filter(a => a.status === 'completed')

  const pendingCount = actions.filter(a => a.status !== 'completed').length

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--background)]">
      <div className="max-w-4xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <ListTodo className="w-5 h-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-[20px] font-semibold text-[var(--foreground)]">
                Actions
              </h1>
              <p className="text-[14px] text-[var(--muted)]">
                {pendingCount} việc cần làm từ email
              </p>
            </div>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              showFilters
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)]'
            )}
          >
            <Filter className="w-4 h-4" />
            Lọc
            <ChevronDown className={cn('w-4 h-4 transition-transform', showFilters && 'rotate-180')} />
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 mb-6 p-4 bg-[var(--card)] rounded-xl border border-[var(--border)]">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Trạng thái</label>
              <div className="flex gap-1">
                {statusFilters.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-lg transition-colors',
                      statusFilter === f.value
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)]'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Loại</label>
              <div className="flex flex-wrap gap-1">
                {typeFilters.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(f.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-lg transition-colors',
                      typeFilter === f.value
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)]'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && actions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--secondary)] flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-[var(--muted)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Chưa có action nào
            </h3>
            <p className="text-sm text-[var(--muted)] max-w-sm">
              Mở một email và nhấn "Trích xuất Actions" để AI phân tích và tìm các việc cần làm
            </p>
          </div>
        )}

        {/* Action sections */}
        {!loading && actions.length > 0 && (
          <div className="space-y-6">
            {/* High priority */}
            {highPriority.length > 0 && (
              <ActionSection
                title="Gấp"
                icon={AlertTriangle}
                iconBg="bg-red-100 dark:bg-red-500/20"
                iconColor="text-gray-900 dark:text-white"
                actions={highPriority}
                onToggle={toggleStatus}
                onGoToEmail={goToEmail}
                formatDueDate={formatDueDate}
              />
            )}

            {/* Medium priority */}
            {mediumPriority.length > 0 && (
              <ActionSection
                title="Trung bình"
                icon={Clock}
                iconBg="bg-amber-100 dark:bg-amber-500/20"
                iconColor="text-gray-900 dark:text-white"
                actions={mediumPriority}
                onToggle={toggleStatus}
                onGoToEmail={goToEmail}
                formatDueDate={formatDueDate}
              />
            )}

            {/* Low priority */}
            {lowPriority.length > 0 && (
              <ActionSection
                title="Thấp"
                icon={ListTodo}
                iconBg="bg-gray-100 dark:bg-gray-500/20"
                iconColor="text-gray-900 dark:text-white"
                actions={lowPriority}
                onToggle={toggleStatus}
                onGoToEmail={goToEmail}
                formatDueDate={formatDueDate}
              />
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <ActionSection
                title="Đã hoàn thành"
                icon={CheckCircle2}
                iconBg="bg-green-100 dark:bg-green-500/20"
                iconColor="text-gray-900 dark:text-white"
                actions={completed}
                onToggle={toggleStatus}
                onGoToEmail={goToEmail}
                formatDueDate={formatDueDate}
                collapsed
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface ActionSectionProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  actions: ActionItem[]
  onToggle: (id: string, status: string) => void
  onGoToEmail: (emailId: string) => void
  formatDueDate: (date: string | null) => string | null
  collapsed?: boolean
}

function ActionSection({
  title,
  icon: Icon,
  iconBg,
  iconColor,
  actions,
  onToggle,
  onGoToEmail,
  formatDueDate,
  collapsed = false
}: ActionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed)

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg)}>
            <Icon className={cn('w-4 h-4', iconColor)} />
          </div>
          <span className="font-semibold text-[var(--foreground)]">
            {title} ({actions.length})
          </span>
        </div>
        <ChevronDown className={cn(
          'w-5 h-5 text-[var(--muted)] transition-transform',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* Actions */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
          {actions.map(action => {
            const TypeIcon = typeIcons[action.type] || ListTodo
            const isCompleted = action.status === 'completed'
            const dueDateText = formatDueDate(action.due_date)
            const isOverdue = dueDateText?.includes('Quá hạn')

            return (
              <div
                key={action.id}
                className={cn(
                  'flex items-start gap-3 p-4 hover:bg-[var(--hover)] transition-colors',
                  isCompleted && 'opacity-60'
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => onToggle(action.id, action.status)}
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
                      'flex-shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded',
                      priorityColors[action.priority]
                    )}>
                      {priorityLabels[action.priority]}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <TypeIcon className="w-3 h-3" />
                      {typeLabels[action.type]}
                    </span>
                    {dueDateText && (
                      <span className={cn(
                        'flex items-center gap-1 text-xs',
                        isOverdue
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : 'text-[var(--muted)]'
                      )}>
                        <Clock className="w-3 h-3" />
                        {dueDateText}
                      </span>
                    )}
                    {action.email && (
                      <button
                        onClick={() => onGoToEmail(action.email!.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Mail className="w-3 h-3" />
                        {action.email.subject || '(Không tiêu đề)'}
                      </button>
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
        </div>
      )}
    </div>
  )
}
