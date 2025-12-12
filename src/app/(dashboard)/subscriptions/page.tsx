'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Mail, Ban, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Subscription {
  email: string
  name: string
  count: number
  category: string
}

const categoryLabels: Record<string, string> = {
  newsletter: 'Newsletter',
  promotion: 'Khuyến mãi',
  spam: 'Spam'
}

const categoryColors: Record<string, string> = {
  newsletter: 'bg-gray-100 text-gray-700',
  promotion: 'bg-amber-100 text-amber-700',
  spam: 'bg-red-100 text-red-600'
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions')
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])

  const handleUnsubscribe = async (emailAddress: string) => {
    setProcessing(emailAddress)
    try {
      const res = await fetch('/api/subscriptions/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailAddresses: [emailAddress] })
      })
      const data = await res.json()
      if (data.success) {
        await fetchSubscriptions()
      } else {
        alert(data.error || 'Xóa thất bại')
      }
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
      alert('Xóa thất bại')
    } finally {
      setProcessing(null)
    }
  }

  const handleUnsubscribeAll = async () => {
    if (!confirm(`Xóa tất cả ${subscriptions.length} nguồn đăng ký? Tất cả email từ các nguồn này sẽ được chuyển vào thùng rác.`)) {
      return
    }

    setProcessing('all')
    try {
      const res = await fetch('/api/subscriptions/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      })
      const data = await res.json()
      if (data.success) {
        await fetchSubscriptions()
      } else {
        alert(data.error || 'Xóa thất bại')
      }
    } catch (error) {
      console.error('Failed to unsubscribe all:', error)
      alert('Xóa thất bại')
    } finally {
      setProcessing(null)
    }
  }

  const totalEmails = subscriptions.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="border-b border-[#EBEBEB] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">
              Quản lý Newsletters
            </h1>
            <p className="text-[14px] text-[#6B6B6B] mt-1">
              Các nguồn gửi email định kỳ đến hộp thư của bạn
            </p>
            <p className="text-[13px] text-[#9B9B9B] mt-0.5">
              {subscriptions.length} nguồn • {totalEmails} email
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchSubscriptions}
              disabled={loading}
              className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} strokeWidth={1.5} />
            </button>

            {subscriptions.length > 0 && (
              <button
                onClick={handleUnsubscribeAll}
                disabled={processing === 'all'}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-[14px] font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {processing === 'all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                Chặn tất cả
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-[#9B9B9B]" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[#F5F5F5] rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-[#9B9B9B]" strokeWidth={1.5} />
            </div>
            <p className="text-[16px] font-medium text-[#1A1A1A] mb-1">
              Không có đăng ký
            </p>
            <p className="text-[14px] text-[#6B6B6B]">
              Các email từ newsletter, khuyến mãi và spam sẽ hiện ở đây
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F5F5F5]">
            {subscriptions.map(sub => (
              <div
                key={sub.email}
                className="flex items-center justify-between px-6 py-4 hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[#1A1A1A] truncate">
                      {sub.name}
                    </span>
                    <span className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium',
                      categoryColors[sub.category] || categoryColors.newsletter
                    )}>
                      {categoryLabels[sub.category] || sub.category}
                    </span>
                  </div>
                  <div className="text-[13px] text-[#6B6B6B] truncate">
                    {sub.email} • {sub.count} email
                  </div>
                </div>

                <button
                  onClick={() => handleUnsubscribe(sub.email)}
                  disabled={processing === sub.email}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {processing === sub.email ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  Chặn
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
