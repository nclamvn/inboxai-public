import { forwardRef, ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center font-medium transition-all duration-150',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--primary)]',
      'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'
    )

    const variants = {
      primary: cn(
        'bg-[var(--primary)] text-[var(--primary-foreground)]',
        'hover:bg-[var(--primary-hover)]',
        'shadow-sm hover:shadow-md'
      ),
      secondary: cn(
        'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
        'border border-[var(--border)]',
        'hover:bg-[var(--secondary-hover)] hover:border-[var(--border-strong)]'
      ),
      ghost: cn(
        'bg-transparent text-[var(--foreground-muted)]',
        'hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
      ),
      danger: cn(
        'bg-[var(--error-bg)] text-[var(--error)]',
        'border border-red-200 dark:border-red-800',
        'hover:bg-red-100 dark:hover:bg-red-900/30'
      ),
    }

    const sizes = {
      sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
      md: 'h-10 px-4 text-[14px] rounded-lg gap-2',
      lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        ) : icon ? (
          <span className="flex-shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
