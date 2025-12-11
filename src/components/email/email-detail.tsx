'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Archive, Trash2, Reply, Forward, MoreHorizontal, X, AlertCircle, Clock, Sparkles, Loader2, MessageSquarePlus } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { useBehaviorTracker } from '@/hooks/use-behavior-tracker'
import { ReplyAssistant } from '@/components/ai/reply-assistant'
import type { Email } from '@/types'

interface EmailDetailProps {
  email: Email
  onClose: () => void
  onStar: () => void
  onArchive: () => void
  onDelete: () => void
  onReply?: () => void
  onRefresh?: () => void
}

const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: 'Rất thấp', color: 'bg-[#F5F5F5] text-[#9B9B9B]' },
  2: { label: 'Thấp', color: 'bg-[#F5F5F5] text-[#6B6B6B]' },
  3: { label: 'Bình thường', color: 'bg-[#F5F5F5] text-[#1A1A1A]' },
  4: { label: 'Cao', color: 'bg-[#FFFBEB] text-[#D97706]' },
  5: { label: 'Khẩn cấp', color: 'bg-[#FEF2F2] text-[#DC2626]' },
}

const categoryLabels: Record<string, string> = {
  work: 'Công việc',
  personal: 'Cá nhân',
  newsletter: 'Bản tin',
  promotion: 'Khuyến mãi',
  transaction: 'Giao dịch',
  social: 'Mạng xã hội',
}

export function EmailDetail({ email, onClose, onStar, onArchive, onDelete, onReply, onRefresh }: EmailDetailProps) {
  const router = useRouter()
  const [classifying, setClassifying] = useState(false)
  const [showReplyAssistant, setShowReplyAssistant] = useState(false)
  const priorityInfo = priorityLabels[email.priority || 3]

  // Behavior tracking
  const { trackOpen, trackRead, trackArchive, trackDelete, trackStar, trackUnstar, trackReply } = useBehaviorTracker()
  const openTimeRef = useRef<number>(0)
  const trackedEmailRef = useRef<string | null>(null)

  // Track email open when email changes
  useEffect(() => {
    if (email && email.id !== trackedEmailRef.current) {
      // Track read duration for previous email
      if (trackedEmailRef.current && openTimeRef.current > 0) {
        const duration = Math.floor((Date.now() - openTimeRef.current) / 1000)
        trackRead(trackedEmailRef.current, duration)
      }

      // Track open for new email
      trackOpen(email.id)
      trackedEmailRef.current = email.id
      openTimeRef.current = Date.now()
    }
  }, [email?.id, trackOpen, trackRead])

  // Track read duration when component unmounts or closes
  useEffect(() => {
    return () => {
      if (trackedEmailRef.current && openTimeRef.current > 0) {
        const duration = Math.floor((Date.now() - openTimeRef.current) / 1000)
        trackRead(trackedEmailRef.current, duration)
      }
    }
  }, [trackRead])

  const handleClassify = async () => {
    setClassifying(true)
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id })
      })
      if (res.ok) {
        onRefresh?.()
      }
    } catch (err) {
      console.error('Classification failed:', err)
    } finally {
      setClassifying(false)
    }
  }

  const handleStar = () => {
    if (email.is_starred) {
      trackUnstar(email.id)
    } else {
      trackStar(email.id)
    }
    onStar()
  }

  const handleArchive = () => {
    trackArchive(email.id)
    onArchive()
  }

  const handleDelete = () => {
    trackDelete(email.id)
    onDelete()
  }

  const handleReply = () => {
    trackReply(email.id)
    onReply?.()
  }

  const handleUseDraft = (subject: string, body: string) => {
    // Navigate to compose with pre-filled draft
    const params = new URLSearchParams({
      replyTo: email.from_address || '',
      subject,
      body,
    })
    router.push(`/compose?${params.toString()}`)
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors lg:hidden"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <h2 className="font-semibold text-[#1A1A1A] truncate">{email.subject || '(Không có tiêu đề)'}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleStar}
            className="p-2 text-[#6B6B6B] hover:text-[#D97706] hover:bg-[#F5F5F5] rounded-lg transition-colors"
            title={email.is_starred ? 'Bỏ gắn sao' : 'Gắn sao'}
          >
            <Star className={cn('w-5 h-5', email.is_starred && 'fill-[#D97706] text-[#D97706]')} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleArchive}
            className="p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors"
            title="Lưu trữ"
          >
            <Archive className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-[#6B6B6B] hover:text-[#DC2626] hover:bg-[#F5F5F5] rounded-lg transition-colors"
            title="Xóa"
          >
            <Trash2 className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button
            onClick={handleClassify}
            disabled={classifying}
            className="p-2 text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors disabled:opacity-50"
            title="Phân tích AI"
          >
            {classifying ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => setShowReplyAssistant(!showReplyAssistant)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showReplyAssistant
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5]'
            )}
            title="Trợ lý phản hồi AI"
          >
            <MessageSquarePlus className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button className="p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors">
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto">
        {/* Sender Info */}
        <div className="p-4 border-b border-[#EBEBEB]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] rounded-full flex items-center justify-center text-white font-medium flex-shrink-0">
              {(email.from_name || email.from_address || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-[#1A1A1A]">{email.from_name || email.from_address}</span>
                <span className="text-[13px] text-[#6B6B6B]">&lt;{email.from_address}&gt;</span>
              </div>
              <p className="text-[13px] text-[#6B6B6B]">
                Đến: tôi • {email.received_at ? formatDate(email.received_at) : ''}
              </p>
            </div>
          </div>
        </div>

        {/* AI Summary & Meta */}
        {(email.summary || email.needs_reply || email.detected_deadline) && (
          <div className="p-4 bg-[#FAFAFA] border-b border-[#EBEBEB]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-wide">AI Phân tích</span>
            </div>
            {email.summary && (
              <p className="text-[14px] text-[#1A1A1A] mb-3">{email.summary}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <span className={cn('px-2 py-1 text-[12px] rounded-full', priorityInfo.color)}>
                {priorityInfo.label}
              </span>
              {email.category && (
                <span className="px-2 py-1 text-[12px] rounded-full bg-[#F5F5F5] text-[#6B6B6B]">
                  {categoryLabels[email.category] || email.category}
                </span>
              )}
              {email.needs_reply && (
                <span className="px-2 py-1 text-[12px] rounded-full bg-[#FFFBEB] text-[#D97706] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
                  Cần trả lời
                </span>
              )}
              {email.detected_deadline && (
                <span className="px-2 py-1 text-[12px] rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center gap-1">
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  Deadline: {new Date(email.detected_deadline).toLocaleDateString('vi-VN')}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Email Body */}
        <div className="p-4">
          <div className="prose max-w-none text-[#1A1A1A]">
            {email.body_html ? (
              <div dangerouslySetInnerHTML={{ __html: email.body_html }} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-[#1A1A1A]">
                {email.body_text || email.snippet || '(Không có nội dung)'}
              </pre>
            )}
          </div>
        </div>

        {/* Reply Assistant */}
        {showReplyAssistant && (
          <div className="p-4 border-t border-[#EBEBEB]">
            <ReplyAssistant
              email={email}
              onUseDraft={handleUseDraft}
              onClose={() => setShowReplyAssistant(false)}
            />
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="p-4 border-t border-[#EBEBEB] bg-[#FAFAFA]">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReply}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2D2D2D] transition-colors"
          >
            <Reply className="w-4 h-4" strokeWidth={1.5} />
            Trả lời
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-[#EBEBEB] rounded-lg text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors">
            <Forward className="w-4 h-4" strokeWidth={1.5} />
            Chuyển tiếp
          </button>
        </div>
      </div>
    </div>
  )
}
