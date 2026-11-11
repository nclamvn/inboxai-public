'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  PanelLeft, Pencil, Inbox, Send, Star, Archive, Trash2,
  BarChart3, Settings, Newspaper, ListTodo, Bell, Mail, ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/hooks/use-media-query'
import { FollowUpInlineBadge } from '@/components/follow-up/follow-up-badge'

const groups = [
  { label: 'Thư mục', items: [
    { href: '/inbox', icon: Inbox, label: 'Hộp thư đến' },
    { href: '/sent', icon: Send, label: 'Đã gửi' },
    { href: '/starred', icon: Star, label: 'Gắn sao' },
    { href: '/archive', icon: Archive, label: 'Lưu trữ' },
    { href: '/trash', icon: Trash2, label: 'Thùng rác' },
  ] },
  { label: 'Công cụ', items: [
    { href: '/commitments', icon: ClipboardCheck, label: 'Cam kết' },
    { href: '/follow-ups', icon: Bell, label: 'Theo dõi' },
    { href: '/subscriptions', icon: Newspaper, label: 'Bản tin' },
    { href: '/actions', icon: ListTodo, label: 'Việc cần làm' },
    { href: '/insights', icon: BarChart3, label: 'Phân tích' },
    { href: '/settings', icon: Settings, label: 'Cài đặt' },
  ] },
]

export function Sidebar() {
  const [preference, setPreference] = useState<boolean | null>(null)
  const wide = useBreakpoint('xl')
  const expanded = preference ?? wide
  const labelVisibility = preference === null ? 'hidden xl:block' : preference ? 'block' : 'hidden'
  const width = preference === null ? 'w-16 xl:w-52' : preference ? 'w-52' : 'w-16'
  const pathname = usePathname()

  return (
    <aside
      aria-label="Thanh điều hướng"
      className={cn('hidden h-full shrink-0 flex-col border-e border-[var(--border)] bg-[var(--canvas)] md:flex', width)}
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
        <Link href="/inbox" aria-label="InboxAI" className={cn('min-w-0', labelVisibility)}>
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Mail size={18} strokeWidth={1.5} className="shrink-0 text-[var(--accent-foreground)]" aria-hidden="true" />
            InboxAI
          </span>
        </Link>
        <button
          type="button"
          aria-label={expanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
          aria-expanded={expanded}
          aria-controls="desktop-navigation"
          onClick={() => setPreference(!expanded)}
          className="neo-icon-button"
        >
          <PanelLeft size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <div className="px-3 py-4">
        <Link
          href="/compose"
          aria-current={pathname === '/compose' ? 'page' : undefined}
          aria-label="Soạn thư"
          title="Soạn thư"
          className="neo-target flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
        >
          <Pencil size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
          <span className={cn('truncate', labelVisibility)}>Soạn thư</span>
        </Link>
      </div>

      <nav id="desktop-navigation" aria-label="Hộp thư và công cụ" className="min-h-0 flex-1 overflow-y-auto">
        {groups.map(group => (
          <div key={group.label} className="border-b border-[var(--border)] py-3 last:border-b-0">
            <p className={cn('px-4 pb-2 text-xs font-medium text-[var(--foreground-muted)]', labelVisibility)}>{group.label}</p>
            <ul>
              {group.items.map(({ href, icon: Icon, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={pathname === href ? 'page' : undefined}
                    aria-label={label}
                    title={label}
                    className="neo-nav-item neo-target px-5 text-sm"
                  >
                    <Icon size={20} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                    <span className={cn('flex-1 truncate', labelVisibility)}>{label}</span>
                    {href === '/follow-ups' && <span className={labelVisibility}><FollowUpInlineBadge /></span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
