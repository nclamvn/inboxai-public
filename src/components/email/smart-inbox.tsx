'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock, Users, Tag, Flame, Bell, ChevronRight,
  Trash2, Sparkles, Star, Loader2, Archive, Lightbulb
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import type { Email } from '@/types'

interface SmartViewData {
  total: number
  byPriority: {
    urgent: Email[]
    high: Email[]
    normal: Email[]
    low: Email[]
  }
  bySender: Array<{
    email: string
    name: string
    count: number
    emails: Email[]
  }>
  byCategory: Record<string, Email[]>
  byTime: {
    today: Email[]
    thisWeek: Email[]
    thisMonth: Email[]
    older: Email[]
  }
  actionItems: {
    needsReply: Email[]
    hasDeadline: Email[]
    unreadImportant: Email[]
    unreadLongTime: Email[]
  }
  cleanupSuggestions: {
    oldUnreadPromo: Email[]
    oldUnreadNewsletter: Email[]
  }
  stats: {
    unread: number
    needsReply: number
    hasDeadline: number
  }
}

type ViewMode = 'priority' | 'sender' | 'category' | 'time' | 'actions'

interface SmartInboxProps {
  onSelectEmail: (email: Email) => void
}

export function SmartInbox({ onSelectEmail }: SmartInboxProps) {
  const [data, setData] = useState<SmartViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('priority')

  const fetchSmartViews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/emails/smart-views')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to fetch smart views:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSmartViews()
  }, [fetchSmartViews])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#9B9B9B] mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm text-[#6B6B6B]">Đang phân tích hộp thư...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-center text-sm text-[#6B6B6B]">Lỗi tải dữ liệu</div>
  }

  const viewModes = [
    { id: 'priority', label: 'Ưu tiên', icon: Flame },
    { id: 'sender', label: 'Người gửi', icon: Users },
    { id: 'category', label: 'Phân loại', icon: Tag },
    { id: 'time', label: 'Thời gian', icon: Clock },
    { id: 'actions', label: 'Cần xử lý', icon: Bell },
  ]

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Stats Bar */}
      <div className="px-5 py-3 border-b border-[#EBEBEB] bg-[#FAFAFA]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />
            <span className="font-semibold text-sm text-[#1A1A1A]">AI Thủ Kho</span>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="px-2 py-1 bg-white rounded-md border border-[#EBEBEB] text-[#6B6B6B]">
              {data.total} email
            </span>
            {data.stats.needsReply > 0 && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-200">
                {data.stats.needsReply} cần trả lời
              </span>
            )}
            {data.stats.hasDeadline > 0 && (
              <span className="px-2 py-1 bg-red-50 text-red-700 rounded-md border border-red-200">
                {data.stats.hasDeadline} có deadline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-[#EBEBEB] overflow-x-auto bg-white">
        {viewModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id as ViewMode)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap',
              viewMode === mode.id
                ? 'text-[#1A1A1A] border-b-2 border-[#1A1A1A]'
                : 'text-[#6B6B6B] hover:text-[#4B4B4B]'
            )}
          >
            <mode.icon className="w-4 h-4" strokeWidth={1.5} />
            {mode.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'priority' && (
          <PriorityView data={data.byPriority} onSelect={onSelectEmail} />
        )}
        {viewMode === 'sender' && (
          <SenderView data={data.bySender} onSelect={onSelectEmail} />
        )}
        {viewMode === 'category' && (
          <CategoryView data={data.byCategory} onSelect={onSelectEmail} />
        )}
        {viewMode === 'time' && (
          <TimeView data={data.byTime} onSelect={onSelectEmail} />
        )}
        {viewMode === 'actions' && (
          <ActionsView
            actionItems={data.actionItems}
            cleanup={data.cleanupSuggestions}
            onSelect={onSelectEmail}
            onRefresh={fetchSmartViews}
          />
        )}
      </div>
    </div>
  )
}

// === SUB COMPONENTS ===

function PriorityView({ data, onSelect }: { data: SmartViewData['byPriority']; onSelect: (email: Email) => void }) {
  const groups = [
    { key: 'urgent', label: 'Khẩn cấp', icon: <Flame className="w-4 h-4 text-red-600" strokeWidth={1.5} />, color: 'bg-red-50 border-red-200', emails: data.urgent },
    { key: 'high', label: 'Quan trọng', icon: <Bell className="w-4 h-4 text-amber-600" strokeWidth={1.5} />, color: 'bg-amber-50 border-amber-200', emails: data.high },
    { key: 'normal', label: 'Bình thường', icon: null, color: 'bg-[#FAFAFA] border-[#EBEBEB]', emails: data.normal },
    { key: 'low', label: 'Có thể bỏ qua', icon: null, color: 'bg-[#FAFAFA] border-[#F5F5F5]', emails: data.low },
  ]

  return (
    <div className="p-4 space-y-3">
      {groups.map((group) => (
        <EmailGroup
          key={group.key}
          label={group.label}
          icon={group.icon}
          count={group.emails.length}
          color={group.color}
          emails={group.emails}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function SenderView({ data, onSelect }: { data: SmartViewData['bySender']; onSelect: (email: Email) => void }) {
  if (data.length === 0) {
    return <EmptyState message="Chưa có email" />
  }

  return (
    <div className="p-4 space-y-3">
      {data.map((sender) => (
        <EmailGroup
          key={sender.email}
          label={sender.name}
          icon={<Users className="w-4 h-4" strokeWidth={1.5} />}
          count={sender.count}
          color="bg-[#FAFAFA] border-[#EBEBEB]"
          emails={sender.emails}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function CategoryView({ data, onSelect }: { data: SmartViewData['byCategory']; onSelect: (email: Email) => void }) {
  // Import icons at component level - using existing imports
  const groups = [
    { key: 'work', label: 'Công việc', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'personal', label: 'Cá nhân', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'transaction', label: 'Giao dịch', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'newsletter', label: 'Newsletter', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'promotion', label: 'Khuyến mãi', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'social', label: 'Mạng xã hội', color: 'bg-[#FAFAFA] border-[#EBEBEB]' },
    { key: 'uncategorized', label: 'Chưa phân loại', color: 'bg-[#FAFAFA] border-[#F5F5F5]' },
  ]

  return (
    <div className="p-4 space-y-3">
      {groups.map((group) => (
        <EmailGroup
          key={group.key}
          label={group.label}
          icon={<Tag className="w-4 h-4" strokeWidth={1.5} />}
          count={data[group.key]?.length || 0}
          color={group.color}
          emails={data[group.key] || []}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function TimeView({ data, onSelect }: { data: SmartViewData['byTime']; onSelect: (email: Email) => void }) {
  const groups = [
    { key: 'today', label: 'Hôm nay', color: 'bg-[#FAFAFA] border-[#EBEBEB]', emails: data.today },
    { key: 'thisWeek', label: 'Tuần này', color: 'bg-[#FAFAFA] border-[#EBEBEB]', emails: data.thisWeek },
    { key: 'thisMonth', label: 'Tháng này', color: 'bg-[#FAFAFA] border-[#EBEBEB]', emails: data.thisMonth },
    { key: 'older', label: 'Cũ hơn', color: 'bg-[#FAFAFA] border-[#F5F5F5]', emails: data.older },
  ]

  return (
    <div className="p-4 space-y-3">
      {groups.map((group) => (
        <EmailGroup
          key={group.key}
          label={group.label}
          icon={<Clock className="w-4 h-4" strokeWidth={1.5} />}
          count={group.emails.length}
          color={group.color}
          emails={group.emails}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function ActionsView({
  actionItems,
  cleanup,
  onSelect,
  onRefresh
}: {
  actionItems: SmartViewData['actionItems']
  cleanup: SmartViewData['cleanupSuggestions']
  onSelect: (email: Email) => void
  onRefresh: () => void
}) {
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    type: 'deletePromo' | 'archiveNewsletter' | null
    loading: boolean
  }>({ isOpen: false, type: null, loading: false })

  const handleBulkAction = async (action: 'delete' | 'archive', emailIds: string[]) => {
    setConfirmDialog(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/emails/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, emailIds })
      })
      const data = await res.json()
      if (data.success) {
        toast('success', data.message)
        onRefresh()
      } else {
        toast('error', data.error || 'Có lỗi xảy ra')
      }
    } catch {
      toast('error', 'Không thể thực hiện thao tác')
    } finally {
      setConfirmDialog({ isOpen: false, type: null, loading: false })
    }
  }

  const handleConfirm = () => {
    if (confirmDialog.type === 'deletePromo') {
      const ids = cleanup.oldUnreadPromo.map(e => e.id)
      handleBulkAction('delete', ids)
    } else if (confirmDialog.type === 'archiveNewsletter') {
      const ids = cleanup.oldUnreadNewsletter.map(e => e.id)
      handleBulkAction('archive', ids)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Action Items */}
      <EmailGroup
        label="Cần trả lời"
        icon={<Bell className="w-4 h-4" strokeWidth={1.5} />}
        count={actionItems.needsReply.length}
        color="bg-red-50 border-red-200"
        emails={actionItems.needsReply}
        onSelect={onSelect}
      />
      <EmailGroup
        label="Có deadline"
        icon={<Clock className="w-4 h-4" strokeWidth={1.5} />}
        count={actionItems.hasDeadline.length}
        color="bg-amber-50 border-amber-200"
        emails={actionItems.hasDeadline}
        onSelect={onSelect}
      />
      <EmailGroup
        label="Quan trọng chưa đọc"
        icon={<Flame className="w-4 h-4" strokeWidth={1.5} />}
        count={actionItems.unreadImportant.length}
        color="bg-[#F5F5F5] border-[#EBEBEB]"
        emails={actionItems.unreadImportant}
        onSelect={onSelect}
      />
      <EmailGroup
        label="Chưa đọc lâu (>3 ngày)"
        icon={<Clock className="w-4 h-4" strokeWidth={1.5} />}
        count={actionItems.unreadLongTime.length}
        color="bg-[#FAFAFA] border-[#EBEBEB]"
        emails={actionItems.unreadLongTime}
        onSelect={onSelect}
      />

      {/* Cleanup Suggestions */}
      {(cleanup.oldUnreadPromo.length > 0 || cleanup.oldUnreadNewsletter.length > 0) && (
        <div className="mt-6 p-4 bg-[#FAFAFA] rounded-md border border-[#EBEBEB]">
          <h3 className="font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" strokeWidth={1.5} />
            Đề xuất dọn dẹp
          </h3>

          {cleanup.oldUnreadPromo.length > 0 && (
            <div className="flex items-center justify-between py-2 border-b border-[#F5F5F5] last:border-0">
              <div>
                <p className="text-sm font-medium text-[#4B4B4B]">Email khuyến mãi cũ</p>
                <p className="text-xs text-[#6B6B6B]">{cleanup.oldUnreadPromo.length} email chưa đọc (&gt;7 ngày)</p>
              </div>
              <button
                onClick={() => setConfirmDialog({ isOpen: true, type: 'deletePromo', loading: false })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Xóa tất cả
              </button>
            </div>
          )}

          {cleanup.oldUnreadNewsletter.length > 0 && (
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-[#4B4B4B]">Newsletter cũ</p>
                <p className="text-xs text-[#6B6B6B]">{cleanup.oldUnreadNewsletter.length} email chưa đọc (&gt;14 ngày)</p>
              </div>
              <button
                onClick={() => setConfirmDialog({ isOpen: true, type: 'archiveNewsletter', loading: false })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:bg-[#F5F5F5] rounded-md transition-colors"
              >
                <Archive className="w-3.5 h-3.5" strokeWidth={1.5} />
                Archive tất cả
              </button>
            </div>
          )}
        </div>
      )}

      {actionItems.needsReply.length === 0 &&
        actionItems.hasDeadline.length === 0 &&
        actionItems.unreadImportant.length === 0 && (
          <EmptyState message="Tuyệt vời! Không có việc gì cần xử lý" />
        )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.type === 'deletePromo' ? 'Xóa email khuyến mãi?' : 'Archive newsletter?'}
        message={
          confirmDialog.type === 'deletePromo'
            ? `Bạn sẽ xóa ${cleanup.oldUnreadPromo.length} email khuyến mãi cũ chưa đọc. Có thể khôi phục từ Thùng rác.`
            : `Bạn sẽ archive ${cleanup.oldUnreadNewsletter.length} newsletter cũ chưa đọc.`
        }
        confirmText={confirmDialog.type === 'deletePromo' ? 'Xóa tất cả' : 'Archive tất cả'}
        variant={confirmDialog.type === 'deletePromo' ? 'danger' : 'default'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, type: null, loading: false })}
        loading={confirmDialog.loading}
      />
    </div>
  )
}

// Email Group Component
function EmailGroup({
  label,
  icon,
  count,
  color,
  emails,
  onSelect
}: {
  label: string
  icon?: React.ReactNode
  count: number
  color: string
  emails: Email[]
  onSelect: (email: Email) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (count === 0) return null

  return (
    <div className={cn('rounded-md border', color)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/50 transition-colors"
      >
        <span className="font-medium text-[#4B4B4B] flex items-center gap-2">
          {icon}
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B6B6B]">{count} email</span>
          <ChevronRight className={cn('w-4 h-4 transition-transform duration-150', expanded && 'rotate-90')} strokeWidth={1.5} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/50">
          {emails.slice(0, 5).map((email) => (
            <MiniEmailItem key={email.id} email={email} onClick={() => onSelect(email)} />
          ))}
          {emails.length > 5 && (
            <div className="p-3 text-center text-sm text-[#6B6B6B] hover:underline cursor-pointer">
              Xem thêm {emails.length - 5} email
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mini Email Item for groups
function MiniEmailItem({ email, onClick }: { email: Email; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 hover:bg-[#FAFAFA] border-b border-[#F5F5F5] last:border-b-0',
        !email.is_read && 'bg-white'
      )}
    >
      {email.is_starred && <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" strokeWidth={1.5} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm truncate text-[#4B4B4B]', !email.is_read && 'font-medium text-[#1A1A1A]')}>
            {email.from_name || email.from_address}
          </span>
        </div>
        <p className="text-sm text-[#6B6B6B] truncate">{email.subject || '(Không có tiêu đề)'}</p>
      </div>
      <span className="text-xs text-[#9B9B9B] flex-shrink-0">
        {email.received_at ? formatDate(email.received_at) : ''}
      </span>
    </div>
  )
}

// Empty State
function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm text-[#6B6B6B]">
      {message}
    </div>
  )
}
