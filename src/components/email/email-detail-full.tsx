'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star, Archive, Trash2, Reply, Forward, MoreHorizontal,
  Sparkles, ChevronDown, ChevronUp, Loader2, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReplyAssistant } from '@/components/ai/reply-assistant'
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

  const handleAction = async (action: 'archive' | 'delete' | 'star') => {
    setActionLoading(action)
    try {
      if (action === 'star') {
        onStar?.(email.id)
      } else if (action === 'archive') {
        onArchive?.(email.id)
        onBack()
      } else if (action === 'delete') {
        onDelete?.(email.id)
        onBack()
      }
      onRefresh()
    } finally {
      setActionLoading(null)
    }
  }

  const handleUseDraft = (subject: string, body: string) => {
    const params = new URLSearchParams({
      replyTo: email.from_address || '',
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
            onClick={() => handleAction('star')}
            disabled={actionLoading === 'star'}
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
            onClick={() => handleAction('archive')}
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
            onClick={() => handleAction('delete')}
            disabled={actionLoading === 'delete'}
            className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            {actionLoading === 'delete' ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Trash2 className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
          <button className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors">
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Close button clicked, calling onBack')
              onBack()
            }}
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
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none text-[#1A1A1A]"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : (
          <div className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
            {email.body_text || email.snippet}
          </div>
        )}
      </div>

      {/* Quick Reply Bar */}
      {!showAIAssistant && (
        <div className="px-6 py-4 border-t border-[#EBEBEB] bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleUseDraft(`Re: ${email.subject}`, '')}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-[14px] font-medium hover:bg-[#2D2D2D] transition-colors"
            >
              <Reply className="w-4 h-4" strokeWidth={1.5} />
              Trả lời
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-[#EBEBEB] rounded-lg text-[14px] text-[#6B6B6B] hover:bg-[#F5F5F5] transition-colors">
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
