'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, Pencil, Inbox, Send, Star, Archive, Trash2,
  BarChart3, Settings, ChevronLeft, Newspaper
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/inbox', icon: Inbox, label: 'Hộp thư đến' },
  { href: '/sent', icon: Send, label: 'Đã gửi' },
  { href: '/starred', icon: Star, label: 'Gắn sao' },
  { href: '/archive', icon: Archive, label: 'Lưu trữ' },
  { href: '/trash', icon: Trash2, label: 'Thùng rác' },
]

const bottomItems = [
  { href: '/subscriptions', icon: Newspaper, label: 'Newsletters' },
  { href: '/insights', icon: BarChart3, label: 'Insights' },
  { href: '/settings', icon: Settings, label: 'Cài đặt' },
]

interface SidebarProps {
  defaultCollapsed?: boolean
}

export function Sidebar({ defaultCollapsed = true }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'h-full border-r border-[var(--border)] bg-[var(--card)] flex-col transition-all duration-200',
        'hidden md:flex', // Hidden on mobile, visible on tablet and up
        collapsed ? 'w-[56px]' : 'w-[200px]'
      )}
    >
      {/* Header */}
      <div className={cn(
        'h-14 flex items-center border-b border-[var(--border)]',
        collapsed ? 'justify-center px-0' : 'justify-between px-3'
      )}>
        {!collapsed && (
          <Link href="/" className="text-[16px] font-semibold text-[var(--foreground)]">
            InboxAI
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
        >
          {collapsed ? (
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Compose Button */}
      <div className={cn('p-2', collapsed ? 'px-1.5' : 'px-3')}>
        <Link
          href="/compose"
          className={cn(
            'flex items-center gap-2 rounded-xl font-semibold transition-all duration-150',
            'bg-[var(--primary)] text-[var(--primary-foreground)]',
            'shadow-sm hover:shadow-md hover:bg-[var(--primary-hover)] active:scale-[0.98]',
            collapsed
              ? 'w-10 h-10 justify-center'
              : 'w-full h-10 px-4'
          )}
        >
          <Pencil className="w-4 h-4" strokeWidth={1.5} />
          {!collapsed && <span className="text-[14px]">Soạn thư</span>}
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href} className={collapsed ? 'px-1.5' : 'px-2'}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg transition-all duration-150',
                    collapsed
                      ? 'w-10 h-10 justify-center'
                      : 'h-10 px-3',
                    isActive
                      ? 'bg-[var(--secondary)] text-[var(--foreground)] font-medium'
                      : 'text-[var(--foreground-muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-5 h-5 flex-shrink-0',
                      isActive ? 'text-[var(--foreground)]' : ''
                    )}
                    strokeWidth={1.5}
                  />
                  {!collapsed && (
                    <span className="text-[14px] truncate">{item.label}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Divider */}
      <div className={cn('border-t border-[var(--border)]', collapsed ? 'mx-2' : 'mx-3')} />

      {/* Bottom Items */}
      <div className="py-2">
        <ul className="space-y-0.5">
          {bottomItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href} className={collapsed ? 'px-1.5' : 'px-2'}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg transition-all duration-150',
                    collapsed
                      ? 'w-10 h-10 justify-center'
                      : 'h-10 px-3',
                    isActive
                      ? 'bg-[var(--secondary)] text-[var(--foreground)] font-medium'
                      : 'text-[var(--foreground-muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-5 h-5 flex-shrink-0',
                      isActive ? 'text-[var(--foreground)]' : ''
                    )}
                    strokeWidth={1.5}
                  />
                  {!collapsed && (
                    <span className="text-[14px] truncate">{item.label}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
