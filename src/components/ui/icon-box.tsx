import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface IconBoxProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'primary' | 'red' | 'amber' | 'emerald' | 'blue' | 'violet'
  size?: 'sm' | 'md' | 'lg'
}

export const IconBox = forwardRef<HTMLDivElement, IconBoxProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'flex items-center justify-center rounded-lg'

    const variants = {
      default: 'bg-[var(--secondary)] text-[var(--muted-foreground)]',
      primary: 'bg-[var(--foreground)] text-[var(--background)]',
      red: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
      amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
      emerald: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
      blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
      violet: 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400',
    }

    const sizes = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
    }

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

IconBox.displayName = 'IconBox'
