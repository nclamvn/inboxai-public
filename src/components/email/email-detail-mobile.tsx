'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft, Star, MoreVertical, Reply, Forward,
  Archive, Trash2, Mail, AlertCircle, Loader2,
  Tag, Flag, MailOpen, Ban, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeEmailHtml } from '@/lib/email/html-sanitizer'
import { AttachmentList } from './attachment-list'
import { AISummary } from './ai-summary'
import type { Email } from '@/types'

interface Attachment {
  id: string
  filename: string
  content_type: string
  size: number
  is_inline: boolean
}

interface EmailDetailMobileProps {
  email: Email
  onBack: () => void
  onRefresh?: () => void
  onStar?: (id: string) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
}

export function EmailDetailMobile({
  email,
  onBack,
  onRefresh,
  onStar,
  onArchive,
  onDelete
}: EmailDetailMobileProps) {
  const [showActions, setShowActions] = useState(false)
  const [isStarred, setIsStarred] = useState(email.is_starred)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const previousId = useRef<string | null>(null)

  // Reset on email change
  useEffect(() => {
    if (email.id !== previousId.current) {
      setShowActions(false)
      setIsStarred(email.is_starred)
      setActionLoading(null)
      setAttachments([])
      previousId.current = email.id

      // Fetch attachments if email has them
      if (email.attachment_count && email.attachment_count > 0) {
        fetchAttachments(email.id)
      }
    }
  }, [email.id, email.is_starred, email.attachment_count])

  // Fetch attachments
  const fetchAttachments = async (emailId: string) => {
    try {
      const res = await fetch(`/api/emails/${emailId}/attachments`)
      const data = await res.json()
      setAttachments(data.attachments || [])
    } catch (error) {
      console.error('Failed to fetch attachments:', error)
    }
  }

  const toggleStar = async () => {
    const newValue = !isStarred
    setIsStarred(newValue)
    if (onStar) {
      onStar(email.id)
    }
  }

  const handleArchive = () => {
    setShowActions(false)
    setActionLoading('archive')
    if (onArchive) {
      onArchive(email.id)
    }
  }

  const handleDelete = () => {
    setShowActions(false)
    setActionLoading('delete')
    if (onDelete) {
      onDelete(email.id)
    }
  }

  // Format date compact
  const formatDate = (date: string | null) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()

    if (isToday) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  // Check for actual body content
  const hasBody = (email.body_text && email.body_text.trim().length > 10) ||
                  (email.body_html && email.body_html.trim().length > 10)

  return (
    <div className="fixed inset-0 z-50 bg-[var(--card)] flex flex-col">
      {/* COMPACT HEADER - single row */}
      <header className="flex items-center h-12 px-2 border-b border-[var(--border)] bg-[var(--card)] safe-area-top flex-shrink-0">
        {/* Back */}
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-full active:bg-[var(--hover)]"
        >
          <ChevronLeft className="w-6 h-6 text-[var(--foreground)]" />
        </button>

        {/* Subject - truncate */}
        <h1 className="flex-1 text-[15px] font-medium text-[var(--foreground)] truncate mx-2">
          {email.subject || '(Không có tiêu đề)'}
        </h1>

        {/* Star */}
        <button
          onClick={toggleStar}
          className="p-2 rounded-full active:bg-[var(--hover)]"
        >
          <Star
            className={cn(
              'w-5 h-5',
              isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--muted-foreground)]'
            )}
          />
        </button>

        {/* More actions */}
        <button
          onClick={() => setShowActions(true)}
          className="p-2 rounded-full active:bg-[var(--hover)]"
        >
          <MoreVertical className="w-5 h-5 text-[var(--muted)]" />
        </button>
      </header>

      {/* CONTENT - maximum space */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Sender info - compact 2 lines max */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)]">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[15px] font-medium text-blue-600 dark:text-blue-400 flex-shrink-0">
            {(email.from_name || email.from_address || 'U')[0].toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-[var(--foreground)] truncate">
                {email.from_name || email.from_address?.split('@')[0] || 'Unknown'}
              </span>
              <span className="text-[12px] text-[var(--muted-foreground)] ml-2 flex-shrink-0">
                {formatDate(email.received_at)}
              </span>
            </div>
            <div className="text-[13px] text-[var(--muted)] truncate">
              {email.from_address}
            </div>
          </div>
        </div>

        {/* AI Summary */}
        <div className="px-4 pt-3">
          <AISummary
            emailId={email.id}
            bodyLength={(email.body_text || email.body_html || '').length}
          />
        </div>

        {/* Email body */}
        <div className="px-4 py-3">
          {!hasBody ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Mail className="w-10 h-10 text-[var(--muted-foreground)] mb-2" />
              <span className="text-[13px] text-[var(--muted-foreground)]">Không có nội dung</span>
            </div>
          ) : email.body_html ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body_html) }}
              className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed email-content animate-fadeIn"
            />
          ) : email.body_text ? (
            <pre className="whitespace-pre-wrap font-sans text-[14px] text-[var(--foreground)] leading-relaxed animate-fadeIn">
              {email.body_text}
            </pre>
          ) : null}

          {/* Attachments */}
          {attachments.length > 0 && (
            <AttachmentList attachments={attachments} />
          )}
        </div>
      </div>

      {/* Footer wrapper với spacing từ đáy màn hình */}
      <div className="pb-6 bg-[var(--card)] flex-shrink-0">
        {/* FLOATING ACTION BUTTONS - pill design */}
        <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-[var(--border)]">
          <button
            onClick={() => window.location.href = `/compose?replyTo=${email.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full active:opacity-80 max-w-[160px]"
          >
            <Reply className="w-4 h-4" />
            <span className="text-[14px] font-medium">Trả lời</span>
          </button>
          <button
            onClick={() => window.location.href = `/compose?forward=${email.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[var(--secondary)] text-[var(--foreground)] rounded-full active:bg-[var(--hover)] max-w-[160px]"
          >
            <Forward className="w-4 h-4" />
            <span className="text-[14px] font-medium">Chuyển tiếp</span>
          </button>
        </div>
      </div>

      {/* Actions Sheet */}
      {showActions && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-50 animate-fadeIn"
            onClick={() => setShowActions(false)}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--card)] rounded-t-2xl animate-slideUp safe-area-bottom">
            <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-3 mb-2" />

            <div className="px-2 pb-4">
              <ActionItem
                icon={Archive}
                label="Lưu trữ"
                onClick={handleArchive}
                loading={actionLoading === 'archive'}
              />
              <ActionItem
                icon={Trash2}
                label="Xóa"
                onClick={handleDelete}
                danger
                loading={actionLoading === 'delete'}
              />
              <ActionItem
                icon={Tag}
                label="Đổi nhãn"
                onClick={() => setShowActions(false)}
              />
              <ActionItem
                icon={Flag}
                label="Đánh dấu quan trọng"
                onClick={() => { toggleStar(); setShowActions(false); }}
              />
              <ActionItem
                icon={MailOpen}
                label="Đánh dấu chưa đọc"
                onClick={() => setShowActions(false)}
              />
              <ActionItem
                icon={Ban}
                label="Chặn người gửi"
                onClick={() => setShowActions(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
  danger,
  loading
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-4 w-full px-4 py-3.5 rounded-xl active:bg-[var(--hover)] disabled:opacity-50 text-[var(--foreground)]',
        danger && 'text-red-600 dark:text-red-400'
      )}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
      <span className="text-[15px]">{label}</span>
    </button>
  )
}
