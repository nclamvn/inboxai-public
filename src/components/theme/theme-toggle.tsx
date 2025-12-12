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
          'text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]',
          'dark:text-[#A1A1A1] dark:hover:bg-[#262626] dark:hover:text-[#FAFAFA]',
          className
        )}
        title={resolvedTheme === 'dark' ? 'Chuyen sang sang' : 'Chuyen sang toi'}
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
          'hover:bg-[#F5F5F5] dark:hover:bg-[#262626]',
          theme === 'light'
            ? 'bg-[#F5F5F5] dark:bg-[#262626] font-medium text-[#1A1A1A] dark:text-[#FAFAFA]'
            : 'text-[#6B6B6B] dark:text-[#A1A1A1]'
        )}
      >
        <Sun className="w-4 h-4" strokeWidth={1.5} />
        Sang
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
          'hover:bg-[#F5F5F5] dark:hover:bg-[#262626]',
          theme === 'dark'
            ? 'bg-[#F5F5F5] dark:bg-[#262626] font-medium text-[#1A1A1A] dark:text-[#FAFAFA]'
            : 'text-[#6B6B6B] dark:text-[#A1A1A1]'
        )}
      >
        <Moon className="w-4 h-4" strokeWidth={1.5} />
        Toi
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
          'hover:bg-[#F5F5F5] dark:hover:bg-[#262626]',
          theme === 'system'
            ? 'bg-[#F5F5F5] dark:bg-[#262626] font-medium text-[#1A1A1A] dark:text-[#FAFAFA]'
            : 'text-[#6B6B6B] dark:text-[#A1A1A1]'
        )}
      >
        <Monitor className="w-4 h-4" strokeWidth={1.5} />
        He thong
      </button>
    </div>
  )
}
