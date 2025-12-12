'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  variant?: 'icon' | 'dropdown'
  className?: string
}

export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          'p-2 rounded-lg transition-colors',
          'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]',
          className
        )}
        title={resolvedTheme === 'dark' ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-5 h-5" strokeWidth={1.5} />
        ) : (
          <Moon className="w-5 h-5" strokeWidth={1.5} />
        )}
      </button>
    )
  }

  // Dropdown variant for settings
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
          'hover:bg-[var(--hover)] dark:hover:bg-[var(--hover)]',
          theme === 'light'
            ? 'bg-[var(--secondary)] font-medium text-[var(--foreground)]'
            : 'text-[var(--muted)]'
        )}
      >
        <Sun className="w-4 h-4" strokeWidth={1.5} />
        Sáng
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
          'hover:bg-[var(--hover)] dark:hover:bg-[var(--hover)]',
          theme === 'dark'
            ? 'bg-[var(--secondary)] font-medium text-[var(--foreground)]'
            : 'text-[var(--muted)]'
        )}
      >
        <Moon className="w-4 h-4" strokeWidth={1.5} />
        Tối
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
          'hover:bg-[var(--hover)] dark:hover:bg-[var(--hover)]',
          theme === 'system'
            ? 'bg-[var(--secondary)] font-medium text-[var(--foreground)]'
            : 'text-[var(--muted)]'
        )}
      >
        <Monitor className="w-4 h-4" strokeWidth={1.5} />
        Hệ thống
      </button>
    </div>
  )
}
