'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, AlertCircle, Clock, MessageCircle, Star,
  Archive, Trash2, ChevronRight, X, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconBox } from '@/components/ui/icon-box'

interface BriefingData {
  greeting: string
  summary: {
    total: number
    unread: number
    today: number
    byCategory: Record<string, number>
  }
  briefingItems: Array<{
    type: string
    icon: string
    title: string
    description: string
    count: number
    emailIds: string[]
  }>
  cleanupItems: Array<{
    type: string
    title: string
    description: string
    action: string
    emailIds: string[]
  }>
}

interface Props {
  onSelectEmail?: (id: string) => void
  onRefresh?: () => void
}

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  AlertCircle,
  Clock,
  MessageCircle,
  Star
}

export function AssistantPanel({ onSelectEmail, onRefresh }: Props) {
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [processingAction, setProcessingAction] = useState<string | null>(null)

  useEffect(() => {
    fetchBriefing()
  }, [])

  const fetchBriefing = async () => {
    try {
      const res = await fetch('/api/ai/briefing')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCleanupAction = async (action: string, emailIds: string[]) => {
    setProcessingAction(action)
    try {
      const res = await fetch('/api/emails/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, emailIds })
      })

      if (res.ok) {
        await fetchBriefing()
        onRefresh?.()
      }
    } catch (error) {
      console.error('Cleanup action failed:', error)
    } finally {
      setProcessingAction(null)
    }
  }

  if (dismissed) return null

  if (loading) {
    return (
      <div className="border-b border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <div className="flex items-center gap-3 text-[#6B6B6B]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span className="text-[14px]">AI đang phân tích hộp thư...</span>
        </div>
      </div>
    )
  }

  if (!data || (data.briefingItems.length === 0 && data.cleanupItems.length === 0)) {
    return null
  }

  return (
    <div className="border-b border-[#EBEBEB] bg-gradient-to-r from-[#FAFAFA] to-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#F5F5F5]">
        <div className="flex items-center gap-3">
          <IconBox variant="primary" size="sm">
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
          </IconBox>
          <div>
            <p className="text-[14px] font-semibold text-[#1A1A1A]">
              {data.greeting}, sếp!
            </p>
            <p className="text-[13px] text-[#6B6B6B]">
              {data.summary.unread} email chưa đọc · {data.summary.today} email hôm nay
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors"
        >
          <X className="w-4 h-4 text-[#9B9B9B]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Briefing Items */}
      {data.briefingItems.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-wider mb-3">
            Cần chú ý
          </p>
          <div className="space-y-1.5">
            {data.briefingItems.map((item, index) => {
              const Icon = iconMap[item.icon] || AlertCircle
              const getVariant = () => {
                switch (item.type) {
                  case 'urgent': return 'red'
                  case 'deadline': return 'amber'
                  case 'waiting': return 'blue'
                  case 'vip': return 'violet'
                  default: return 'default'
                }
              }
              return (
                <button
                  key={index}
                  onClick={() => item.emailIds[0] && onSelectEmail?.(item.emailIds[0])}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white border border-transparent hover:border-[#EBEBEB] transition-all text-left group"
                >
                  <IconBox variant={getVariant() as 'red' | 'amber' | 'blue' | 'violet' | 'default'} size="sm">
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1A1A1A]">
                      {item.title}
                    </p>
                    <p className="text-[13px] text-[#6B6B6B]">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D4D4D4] group-hover:text-[#6B6B6B] transition-colors" strokeWidth={1.5} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Cleanup Suggestions */}
      {data.cleanupItems.length > 0 && (
        <div className="px-5 py-4 border-t border-[#F5F5F5]">
          <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-wider mb-3">
            Đề xuất dọn dẹp
          </p>
          <div className="space-y-2">
            {data.cleanupItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#EBEBEB]"
              >
                <div className="flex items-center gap-3">
                  <IconBox variant="default" size="sm">
                    {item.action === 'archive' ? (
                      <Archive className="w-4 h-4" strokeWidth={1.5} />
                    ) : (
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </IconBox>
                  <div>
                    <p className="text-[14px] font-medium text-[#1A1A1A]">
                      {item.title}
                    </p>
                    <p className="text-[13px] text-[#6B6B6B]">
                      {item.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleCleanupAction(item.action, item.emailIds)}
                  disabled={processingAction === item.action}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                    item.action === 'archive'
                      ? 'bg-[#F5F5F5] text-[#1A1A1A] hover:bg-[#EBEBEB]'
                      : 'bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]',
                    processingAction === item.action && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {processingAction === item.action ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    item.action === 'archive' ? 'Archive' : 'Xóa'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
