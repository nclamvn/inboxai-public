'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Bell, Sparkles, ChevronDown, LogOut,
  Settings, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { SearchBox } from '@/components/search/search-box'

interface BriefingData {
  unread: number
  needsAttention: number
  items: Array<{
    type: string
    title: string
    count: number
  }>
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
  const searchParams = useSearchParams()
  const supabase = createClient()
  const aiPopoverRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

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

  const handleNavigateToInbox = () => {
    setShowAIPopover(false)
    router.push('/inbox')
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

  return (
    <header className="h-14 border-b border-[#EBEBEB] bg-white flex items-center justify-between px-4">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <SearchBox />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1 ml-4">
        {/* AI Assistant Badge */}
        <div className="relative" ref={aiPopoverRef}>
          <button
            type="button"
            onClick={() => setShowAIPopover(!showAIPopover)}
            className={cn(
              'flex items-center gap-2 h-9 px-3 rounded-lg transition-colors',
              briefing && briefing.needsAttention > 0
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
            )}
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            {briefing && briefing.needsAttention > 0 && (
              <span className="text-[13px] font-medium">
                {briefing.needsAttention}
              </span>
            )}
          </button>

          {/* AI Popover */}
          {showAIPopover && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#EBEBEB] shadow-lg z-50 overflow-hidden">
              <div className="p-4 border-b border-[#EBEBEB] bg-[#FAFAFA]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#1A1A1A]" strokeWidth={1.5} />
                    <span className="text-[14px] font-medium text-[#1A1A1A]">
                      AI Thư Ký
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAIPopover(false)}
                    className="p-1 rounded text-[#9B9B9B] hover:text-[#6B6B6B]"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
                {briefing && (
                  <p className="text-[13px] text-[#6B6B6B] mt-1">
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
                        onClick={handleNavigateToInbox}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F5F5] transition-colors text-left"
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-medium',
                          item.type === 'urgent' && 'bg-[#FEF2F2] text-[#DC2626]',
                          item.type === 'deadline' && 'bg-[#FFFBEB] text-[#D97706]',
                          item.type === 'waiting' && 'bg-[#EFF6FF] text-[#2563EB]',
                          item.type === 'vip' && 'bg-[#F5F3FF] text-[#7C3AED]',
                          !['urgent', 'deadline', 'waiting', 'vip'].includes(item.type) && 'bg-[#F5F5F5] text-[#6B6B6B]'
                        )}>
                          {item.count}
                        </div>
                        <span className="text-[14px] text-[#1A1A1A]">
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-[#6B6B6B]">
                    <p className="text-[14px]">Không có gì cần chú ý</p>
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-[#EBEBEB]">
                <button
                  type="button"
                  onClick={handleNavigateToInsights}
                  className="block w-full text-center py-2 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
                >
                  Xem Insights →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <button
          type="button"
          className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
        >
          <Bell className="w-5 h-5" strokeWidth={1.5} />
        </button>

        {/* User Menu */}
        <div className="relative ml-2" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[#F5F5F5] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#1A1A1A] flex items-center justify-center">
              <span className="text-[11px] font-medium text-white">{initials}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-[#9B9B9B]" strokeWidth={1.5} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-[#EBEBEB] shadow-lg z-50 overflow-hidden">
              <div className="p-3 border-b border-[#EBEBEB]">
                <p className="text-[14px] font-medium text-[#1A1A1A]">
                  {user?.profile?.full_name || 'User'}
                </p>
                <p className="text-[12px] text-[#6B6B6B] truncate">
                  {user?.email}
                </p>
              </div>
              <div className="p-1">
                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
                >
                  <Settings className="w-4 h-4" strokeWidth={1.5} />
                  Cài đặt
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors"
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
