'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Inbox, Send, Star, Settings, Pencil } from 'lucide-react'

const navItems = [
  { href: '/inbox', icon: Inbox, label: 'Hộp thư' },
  { href: '/sent', icon: Send, label: 'Đã gửi' },
  { href: '/compose', icon: Pencil, label: 'Soạn thư' },
  { href: '/starred', icon: Star, label: 'Gắn sao' },
  { href: '/settings', icon: Settings, label: 'Cài đặt' },
]

export function MobileNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (pathname === '/inbox' && searchParams.has('email')) return null

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {navItems.map(({ href, icon: Icon, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          className="neo-nav-item neo-nav-inline h-[var(--mobile-nav-height)] min-w-0 flex-col justify-center gap-1 text-center text-[11px] leading-4"
        >
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
