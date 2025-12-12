'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Mail, RefreshCw, Sparkles, AlertCircle,
  CheckCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  message?: string
  link?: string
  is_read: boolean
  created_at: string
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  new_email: Mail,
  sync_complete: RefreshCw,
  ai_classified: Sparkles,
  important: AlertCircle,
}

const typeColors: Record<string, string> = {
  new_email: 'bg-blue-100 text-blue-600',
  sync_complete: 'bg-green-100 text-green-600',
  ai_classified: 'bg-purple-100 text-purple-600',
  important: 'bg-orange-100 text-orange-600',
}

export function NotificationDropdown() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=10')
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark as read
  const markAsRead = async (ids?: string[]) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { notificationIds: ids } : { markAllRead: true })
      })
      fetchNotifications()
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  // Handle notification click
  const handleClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead([notification.id])
    }
    if (notification.link) {
      router.push(notification.link)
    }
    setIsOpen(false)
  }

  // Format time
  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    if (diff < 60000) return 'Vua xong'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phut truoc`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} gio truoc`
    return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-[#F5F5F5] text-[#6B6B6B] transition-colors"
      >
        <Bell className="w-5 h-5" strokeWidth={1.5} />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[11px] font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-[#EBEBEB] overflow-hidden z-50 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EBEBEB]">
            <h3 className="text-[15px] font-semibold text-[#1A1A1A]">Thong bao</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAsRead()}
                className="text-[13px] text-blue-600 hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" />
                Doc tat ca
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 animate-spin text-[#9B9B9B]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[#9B9B9B]">
                <Bell className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-[14px]">Khong co thong bao</span>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = typeIcons[notification.type] || Bell
                const colorClass = typeColors[notification.type] || 'bg-gray-100 text-gray-600'

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F5F5F5] transition-colors',
                      !notification.is_read && 'bg-blue-50/50'
                    )}
                  >
                    {/* Icon */}
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', colorClass)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn(
                          'text-[14px] line-clamp-1',
                          !notification.is_read ? 'font-medium text-[#1A1A1A]' : 'text-[#6B6B6B]'
                        )}>
                          {notification.title}
                        </span>
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>

                      {notification.message && (
                        <p className="text-[13px] text-[#9B9B9B] line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                      )}

                      <span className="text-[12px] text-[#BBBBBB] mt-1 block">
                        {formatTime(notification.created_at)}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer - only show if there are notifications */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-[#EBEBEB] bg-[#FAFAFA]">
              <button
                onClick={() => {
                  setIsOpen(false)
                }}
                className="text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] w-full text-center"
              >
                Xem tat ca thong bao
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
