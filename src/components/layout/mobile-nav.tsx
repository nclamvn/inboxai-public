'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Inbox, Pencil, ClipboardCheck, MessageSquare, ListChecks, Menu } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { mailDestinations, toolDestinations, isDestinationActive } from './navigation'

const navItems = [
  { href: '/inbox', icon: Inbox, label: 'Hộp thư' },
  { href: '/commitments', icon: ClipboardCheck, label: 'Cam kết' },
  { href: '/compose', icon: Pencil, label: 'Soạn thư' },
  { href: '/search', icon: MessageSquare, label: 'Ask Inbox' },
  { href: '/operator', icon: ListChecks, label: 'AI Operator' },
]
export function MobileNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  if (pathname === '/inbox' && searchParams.has('email')) return null
  const moreActive = !navItems.some(item => isDestinationActive(pathname, item.href))
  return <>
    <nav aria-label="Điều hướng di động" className="neo-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 pb-[env(safe-area-inset-bottom)] md:hidden">
      {navItems.map(({ href, icon: Icon, label }) => <Link key={href} href={href} aria-current={isDestinationActive(pathname, href) ? 'page' : undefined}
        className="neo-nav-item neo-nav-inline neo-destination h-[var(--mobile-nav-height)] min-w-0 flex-col justify-center gap-1 text-center text-[10px] leading-4">
        <Icon size={21} strokeWidth={1.7} aria-hidden="true" />{label}
      </Link>)}
      <button type="button" aria-label="Thêm thư mục và công cụ" aria-expanded={open} onClick={() => setOpen(true)}
        aria-current={moreActive ? 'page' : undefined} className="neo-nav-item neo-nav-inline neo-destination min-w-0 flex-col justify-center gap-1 text-[10px]">
        <Menu size={21} aria-hidden="true" />Thêm
      </button>
    </nav>
    <Modal open={open} onClose={() => setOpen(false)} title="Thư mục và công cụ">
      <ul className="neo-command-results">{[...mailDestinations, ...toolDestinations].map(({ href, icon: Icon, label }) => <li key={href}>
        <Link href={href} onClick={() => setOpen(false)} aria-current={isDestinationActive(pathname, href) ? 'page' : undefined} className="neo-target"><Icon size={18} aria-hidden="true" />{label}</Link>
      </li>)}</ul>
    </Modal>
  </>
}
