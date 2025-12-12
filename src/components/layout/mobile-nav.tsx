'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Inbox, Send, Star, Archive, Settings, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/inbox', icon: Inbox, label: 'Inbox' },
  { href: '/sent', icon: Send, label: 'Gửi' },
  { href: '/compose', icon: Pencil, label: 'Soạn', isCompose: true },
  { href: '/starred', icon: Star, label: 'Sao' },
  { href: '/settings', icon: Settings, label: 'Cài đặt' },
]

export function MobileNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Hide bottom nav when viewing email detail on mobile
  const isViewingEmail = searchParams.get('email') !== null

  if (isViewingEmail) {
    return null
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EBEBEB] flex items-center justify-around px-2 z-50 pb-safe" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

        if (item.isCompose) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center w-14 h-14 -mt-4 bg-[#1A1A1A] rounded-full text-white shadow-lg"
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
            </Link>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors',
              isActive
                ? 'text-[#1A1A1A]'
                : 'text-[#9B9B9B]'
            )}
          >
            <item.icon
              className="w-5 h-5"
              strokeWidth={1.5}
              fill={isActive && item.icon === Star ? 'currentColor' : 'none'}
            />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
