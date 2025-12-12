'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star, Archive, Trash2, Reply, Forward, MoreHorizontal,
  Sparkles, ChevronDown, ChevronUp, Loader2, X, Mail,
  Check, ShieldAlert, Ban
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReplyAssistant } from '@/components/ai/reply-assistant'
import { sanitizeEmailHtml } from '@/lib/email/html-sanitizer'
import type { Email } from '@/types'

interface Props {
  email: Email
  onBack: () => void
  onRefresh: () => void
  onStar?: (id: string) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
  fullWidth?: boolean
}

export function EmailDetailFull({
  email,
  onBack,
  onRefresh,
  onStar,
  onArchive,
  onDelete,
  fullWidth = false
}: Props) {
  const router = useRouter()
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [showAIAnalysis, setShowAIAnalysis] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null)
  const [currentCategory, setCurrentCategory] = useState(email.category)
  const previousEmailId = useRef<string | null>(null)

  // Reset UI state when switching emails - instant feedback
  useEffect(() => {
    if (email.id !== previousEmailId.current) {
      setShowAIAssistant(false)
      setShowAIAnalysis(false)
      setActionLoading(null)
      setFeedbackLoading(null)
      setCurrentCategory(email.category)
      previousEmailId.current = email.id
    }
  }, [email.id, email.category])

  const handleStar = () => {
    onStar?.(email.id)
  }

  // Handle "Not Spam" feedback
  const handleNotSpam = async () => {
    setFeedbackLoading('not_spam')
    try {
      const res = await fetch(`/api/emails/${email.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'not_spam' })
      })
      const data = await res.json()
      if (data.success) {
        setCurrentCategory(data.newCategory || 'personal')
        onRefresh?.()
      }
    } catch (e) {
      console.error('Not spam error:', e)
    } finally {
      setFeedbackLoading(null)
    }
  }

  // Handle "Is Spam" feedback
  const handleIsSpam = async () => {
    setFeedbackLoading('is_spam')
    try {
      const res = await fetch(`/api/emails/${email.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'is_spam' })
      })
      const data = await res.json()
      if (data.success) {
        setCurrentCategory('spam')
        onRefresh?.()
      }
    } catch (e) {
      console.error('Is spam error:', e)
    } finally {
      setFeedbackLoading(null)
    }
  }

  // Handle block sender
  const handleBlockSender = async () => {
    if (!confirm(`Chặn tất cả email từ ${email.from_address}?`)) return

    setFeedbackLoading('block')
    try {
      const res = await fetch(`/api/emails/${email.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'block_sender' })
      })
      const data = await res.json()
      if (data.success) {
        onDelete?.(email.id)
        onBack()
      }
    } catch (e) {
      console.error('Block sender error:', e)
    } finally {
      setFeedbackLoading(null)
    }
  }

  const handleArchive = () => {
    setActionLoading('archive')
    onArchive?.(email.id)
  }

  const handleDelete = () => {
    setActionLoading('delete')
    onDelete?.(email.id)
  }

  const handleClose = () => {
    onBack()
  }

  const handleUseDraft = (subject: string, body: string) => {
    const params = new URLSearchParams({
      replyTo: email.from_address || '',
      replyToEmailId: email.id,
      subject,
      body,
    })
    router.push(`/compose?${params.toString()}`)
  }

  const formatDate = (date: string | null) => {
    if (!date) return ''
    return new Date(date).toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return ''
    const labels: Record<string, string> = {
      work: 'Công việc',
      personal: 'Cá nhân',
      transaction: 'Giao dịch',
      newsletter: 'Newsletter',
      promotion: 'Khuyến mãi',
      social: 'Mạng XH',
    }
    return labels[category] || category
  }

  const getPriorityLabel = (priority: number | null) => {
    if (!priority) return 'Bình thường'
    if (priority >= 5) return 'Khẩn cấp'
    if (priority >= 4) return 'Cao'
    if (priority >= 3) return 'Bình thường'
    return 'Thấp'
  }

  return (
    <div className={cn('flex flex-col h-full', fullWidth && 'max-w-4xl mx-auto')}>
      {/* Action Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#EBEBEB]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleStar}
            className={cn(
              'p-2 rounded-lg transition-colors',
              email.is_starred
                ? 'text-[#D97706] hover:bg-[#FFFBEB]'
                : 'text-[#9B9B9B] hover:text-[#6B6B6B] hover:bg-[#F5F5F5]'
            )}
          >
            <Star
              className="w-5 h-5"
              strokeWidth={1.5}
              fill={email.is_starred ? 'currentColor' : 'none'}
            />
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={actionLoading === 'archive'}
            className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
          >
            {actionLoading === 'archive' ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Archive className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={actionLoading === 'delete'}
            className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            {actionLoading === 'delete' ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Trash2 className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
          {/* Spam Feedback Buttons */}
          {currentCategory === 'spam' ? (
            <button
              type="button"
              onClick={handleNotSpam}
              disabled={feedbackLoading === 'not_spam'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-green-600 bg-green-50 hover:bg-green-100 transition-colors"
            >
              {feedbackLoading === 'not_spam' ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Check className="w-4 h-4" strokeWidth={1.5} />
              )}
              Không phải spam
            </button>
          ) : (
            <button
              type="button"
              onClick={handleIsSpam}
              disabled={feedbackLoading === 'is_spam'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              {feedbackLoading === 'is_spam' ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <ShieldAlert className="w-4 h-4" strokeWidth={1.5} />
              )}
              Spam
            </button>
          )}

          {/* Block Sender Button */}
          <button
            type="button"
            onClick={handleBlockSender}
            disabled={feedbackLoading === 'block'}
            className="p-2 rounded-lg text-[#9B9B9B] hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Chặn người gửi"
          >
            {feedbackLoading === 'block' ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Ban className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>

          <button
            type="button"
            className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAIAssistant(!showAIAssistant)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              showAIAssistant
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5]'
            )}
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            AI Trả lời
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-[#9B9B9B] hover:text-[#6B6B6B] hover:bg-[#F5F5F5] transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Email Header */}
      <div className="px-6 py-4 border-b border-[#EBEBEB]">
        <h1 className="text-[20px] font-medium text-[#1A1A1A] mb-4">
          {email.subject || '(Không có tiêu đề)'}
        </h1>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center">
              <span className="text-[14px] font-medium text-[#6B6B6B]">
                {(email.from_name || email.from_address)?.[0]?.toUpperCase()}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium text-[#1A1A1A]">
                  {email.from_name || email.from_address?.split('@')[0]}
                </span>
                <span className="text-[13px] text-[#9B9B9B]">
                  {'<'}{email.from_address}{'>'}
                </span>
              </div>
              <p className="text-[13px] text-[#6B6B6B]">
                Đến: tôi
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[13px] text-[#9B9B9B]">
              {formatDate(email.received_at)}
            </p>
          </div>
        </div>

        {/* AI Analysis - Compact inline */}
        {(email.category || email.priority || email.summary) && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAIAnalysis(!showAIAnalysis)}
              className="flex items-center gap-2 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="flex items-center gap-2">
                {email.priority && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[11px] font-medium',
                    (email.priority || 0) >= 4 ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#F5F5F5] text-[#6B6B6B]'
                  )}>
                    {getPriorityLabel(email.priority)}
                  </span>
                )}
                {email.category && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#F5F5F5] text-[#6B6B6B]">
                    {getCategoryLabel(email.category)}
                  </span>
                )}
              </span>
              {showAIAnalysis ? (
                <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>

            {showAIAnalysis && email.summary && (
              <div className="mt-2 p-3 rounded-lg bg-[#FAFAFA] border border-[#EBEBEB]">
                <p className="text-[13px] text-[#6B6B6B]">
                  {email.summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {email.body_html && email.body_html.replace(/<[^>]*>/g, '').trim().length > 10 ? (
          <div
            className="email-content prose prose-sm max-w-none text-[#1A1A1A] animate-fadeIn"
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body_html, { allowImages: true }) }}
          />
        ) : email.body_text && email.body_text.trim().length > 0 ? (
          <pre className="whitespace-pre-wrap font-sans text-[15px] text-[#1A1A1A] leading-relaxed bg-transparent p-0 m-0 animate-fadeIn">
            {email.body_text}
          </pre>
        ) : email.snippet && email.snippet.trim().length > 0 ? (
          <div className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap animate-fadeIn">
            {email.snippet}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-[#9B9B9B]" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] text-[#6B6B6B] mb-1">
              Email này không có nội dung
            </p>
            <p className="text-[13px] text-[#9B9B9B]">
              Có thể chỉ có tiêu đề hoặc là email test
            </p>
          </div>
        )}
      </div>

      {/* Quick Reply Bar */}
      {!showAIAssistant && (
        <div className="px-6 py-4 border-t border-[#EBEBEB] bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleUseDraft(`Re: ${email.subject}`, '')}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-[14px] font-medium hover:bg-[#2D2D2D] transition-colors"
            >
              <Reply className="w-4 h-4" strokeWidth={1.5} />
              Trả lời
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 border border-[#EBEBEB] rounded-lg text-[14px] text-[#6B6B6B] hover:bg-[#F5F5F5] transition-colors"
            >
              <Forward className="w-4 h-4" strokeWidth={1.5} />
              Chuyển tiếp
            </button>
          </div>
        </div>
      )}

      {/* AI Reply Assistant */}
      {showAIAssistant && (
        <div className="border-t border-[#EBEBEB]">
          <ReplyAssistant
            email={email}
            onUseDraft={handleUseDraft}
            onClose={() => setShowAIAssistant(false)}
          />
        </div>
      )}
    </div>
  )
}
