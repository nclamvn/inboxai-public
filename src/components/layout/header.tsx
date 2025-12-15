'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Sparkles, ChevronDown, LogOut,
  Settings, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchBox } from '@/components/search/search-box'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { FollowUpBadge } from '@/components/follow-up/follow-up-badge'

interface BriefingItem {
  type: string
  title: string
  count: number
  emailIds?: string[]
}

interface BriefingData {
  unread: number
  needsAttention: number
  items: BriefingItem[]
}

interface UserData {
  email?: string
  profile?: { full_name?: string }
}

export function Header() {
  const [user, setUser] = useState<UserData | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showAIPopover, setShowAIPopover] = useState(false)
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const aiPopoverRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Hide header on /inbox page - UnifiedTopBar handles it
  const isInboxPage = pathname === '/inbox'

  // Hide header on mobile when viewing email detail
  const isViewingEmail = searchParams.get('email') !== null

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        setUser({ email: user.email, profile: profile || undefined })
      }
    }

    const fetchBriefing = async () => {
      try {
        const res = await fetch('/api/ai/briefing')
        if (res.ok) {
          const data = await res.json()
          setBriefing({
            unread: data.summary?.unread || 0,
            needsAttention: data.briefingItems?.length || 0,
            items: data.briefingItems || []
          })
        }
      } catch {
        console.error('Failed to fetch briefing')
      }
    }

    getUser()
    fetchBriefing()
  }, [supabase])

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiPopoverRef.current && !aiPopoverRef.current.contains(event.target as Node)) {
        setShowAIPopover(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNavigateToInbox = (item?: BriefingItem) => {
    setShowAIPopover(false)
    if (item?.emailIds && item.emailIds.length > 0) {
      // Store email IDs in sessionStorage for Inbox to read
      sessionStorage.setItem('briefing_filter', JSON.stringify({
        type: item.type,
        title: item.title,
        emailIds: item.emailIds
      }))
      router.push(`/inbox?briefing=${item.type}`)
    } else {
      router.push('/inbox')
    }
  }

  const handleNavigateToInsights = () => {
    setShowAIPopover(false)
    router.push('/insights')
  }

  const initials = user?.profile?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  // Hide header on mobile when viewing email - let EmailDetailMobile handle header
  if (isMobile && isViewingEmail) {
    return null
  }

  // Hide header on inbox page - UnifiedTopBar handles everything
  if (isInboxPage) {
    return null
  }

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between px-4 shadow-sm">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <SearchBox />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1 ml-4">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Follow-up Badge */}
        <FollowUpBadge />

        {/* AI Assistant Badge */}
        <div className="relative" ref={aiPopoverRef}>
          <button
            type="button"
            onClick={() => setShowAIPopover(!showAIPopover)}
            className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-[var(--foreground)] transition-colors"
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            {briefing && briefing.needsAttention > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                {briefing.needsAttention}
              </span>
            )}
          </button>

          {/* AI Popover */}
          {showAIPopover && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg z-50 overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] bg-[var(--secondary)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--foreground)]" strokeWidth={1.5} />
                    <span className="text-[14px] font-medium text-[var(--foreground)]">
                      AI Thư Ký
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAIPopover(false)}
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--muted)]"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
                {briefing && (
                  <p className="text-[13px] text-[var(--muted)] mt-1">
                    {briefing.unread} chưa đọc · {briefing.needsAttention} cần chú ý
                  </p>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {briefing?.items && briefing.items.length > 0 ? (
                  <div className="p-2">
                    {briefing.items.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleNavigateToInbox(item)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--hover)] transition-colors text-left"
                      >
                        <span className={cn(
                          'text-[14px] font-bold',
                          item.type === 'urgent' && 'text-red-500 dark:text-red-400',
                          item.type === 'deadline' && 'text-amber-500 dark:text-amber-400',
                          item.type === 'waiting' && 'text-blue-500 dark:text-blue-400',
                          item.type === 'vip' && 'text-violet-500 dark:text-violet-400',
                          !['urgent', 'deadline', 'waiting', 'vip'].includes(item.type) && 'text-gray-500 dark:text-gray-400'
                        )}>
                          {item.count}
                        </span>
                        <span className="text-[14px] text-[var(--foreground)]">
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-[var(--muted)]">
                    <p className="text-[14px]">Không có gì cần chú ý</p>
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleNavigateToInsights}
                  className="block w-full text-center py-2 text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Xem Insights →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <NotificationDropdown />

        {/* User Menu */}
        <div className="relative ml-2" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[var(--hover)] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center">
              <span className="text-[11px] font-medium text-[var(--primary-foreground)]">{initials}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg z-50 overflow-hidden">
              <div className="p-3 border-b border-[var(--border)]">
                <p className="text-[14px] font-semibold text-[var(--foreground)]">
                  {user?.profile?.full_name || 'User'}
                </p>
                <p className="text-[12px] text-[var(--foreground-muted)] truncate">
                  {user?.email}
                </p>
              </div>
              <div className="p-1">
                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[var(--foreground-muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-all duration-150"
                >
                  <Settings className="w-4 h-4" strokeWidth={1.5} />
                  Cài đặt
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[var(--foreground-muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-all duration-150"
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.5} />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
