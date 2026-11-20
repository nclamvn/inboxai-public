'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeft, Pencil, Mail, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/hooks/use-media-query'
import { FollowUpInlineBadge } from '@/components/follow-up/follow-up-badge'
import { primaryDestinations, mailDestinations, toolDestinations, isDestinationActive } from './navigation'
import { WorkspaceMenu } from './workspace-menu'

export function Sidebar() {
  const [preference, setPreference] = useState<boolean | null>(null)
  const wide = useBreakpoint('xl')
  const expanded = preference ?? wide
  const labelVisibility = preference === null ? 'hidden xl:block' : preference ? 'block' : 'hidden'
  const width = preference === null ? 'w-16 xl:w-60' : preference ? 'w-60' : 'w-16'
  const pathname = usePathname()
  return (
    <aside aria-label="Thanh điều hướng" className={cn('neo-sidebar hidden h-full shrink-0 flex-col md:flex', width)}>
      <div className="neo-brand-row">
        <Link href="/inbox" aria-label="InboxAI" className={cn('neo-brand', labelVisibility)}>
          <span className="neo-brand-mark"><Mail size={20} strokeWidth={1.6} aria-hidden="true" /></span>
          <span>Inbox<span className="font-normal">AI</span><span className="neo-brand-point" aria-hidden="true" /></span>
        </Link>
        <button type="button" aria-label={expanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
          aria-expanded={expanded} aria-controls="desktop-navigation" onClick={() => setPreference(!expanded)} className="neo-icon-button">
          <PanelLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <div className="px-3 pb-4 pt-2">
        <Link href="/compose" aria-current={pathname === '/compose' ? 'page' : undefined} aria-label="Soạn thư" title="Soạn thư" className="neo-compose-button neo-target">
          <Pencil size={17} strokeWidth={1.8} aria-hidden="true" /><span className={labelVisibility}>Soạn thư</span>
        </Link>
      </div>
      <nav id="desktop-navigation" aria-label="Hộp thư và công cụ" className="min-h-0 flex-1 overflow-y-auto">
        <ul className="neo-primary-nav">
          {primaryDestinations.map(({ href, icon: Icon, label, description, tone }) => <li key={href}>
            <Link href={href} aria-current={isDestinationActive(pathname, href) ? 'page' : undefined} aria-label={label} title={label}
              data-mail-tone={tone} className="neo-nav-item neo-destination neo-primary-destination neo-target">
              <span className="neo-nav-symbol"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
              <span className={cn('min-w-0', labelVisibility)}><span className="block truncate text-sm font-semibold">{label}</span><span className="neo-nav-description">{description}</span></span>
            </Link>
          </li>)}
        </ul>
        {[{ label: 'Hộp thư của bạn', items: mailDestinations }, { label: 'Tiện ích', items: toolDestinations.filter(item => item.href !== '/settings') }].map(group => <div key={group.label} className="neo-nav-group">
          <p className={cn('neo-nav-group-label', labelVisibility)}>{group.label}</p>
          <ul>{group.items.map(({ href, icon: Icon, label }) => <li key={href}>
            <Link href={href} aria-current={isDestinationActive(pathname, href) ? 'page' : undefined} aria-label={label} title={label} className="neo-nav-item neo-destination neo-secondary-destination neo-target">
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" /><span className={cn('flex-1 truncate', labelVisibility)}>{label}</span>
              {href === '/follow-ups' && <span className={labelVisibility}><FollowUpInlineBadge /></span>}
            </Link>
          </li>)}</ul>
        </div>)}
      </nav>
      <div className="neo-sidebar-footer">
        <WorkspaceMenu compact={!expanded} />
        <Link href="/settings" aria-label="Cài đặt" title="Cài đặt" aria-current={pathname.startsWith('/settings') ? 'page' : undefined} className="neo-nav-item neo-destination neo-secondary-destination neo-target">
          <Settings size={17} aria-hidden="true" /><span className={labelVisibility}>Cài đặt</span>
        </Link>
      </div>
    </aside>
  )
}
