import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-10 px-3 text-[15px] text-[var(--foreground)] placeholder-[var(--muted)]',
            'bg-[var(--background)] border rounded-lg transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-0',
            error
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400'
              : 'border-[var(--border)] hover:border-[var(--border-strong)]',
            icon && 'pl-10',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = 'Input'
