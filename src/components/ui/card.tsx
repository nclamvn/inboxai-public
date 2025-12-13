import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hover = false, children, ...props }, ref) => {
    const baseStyles = 'bg-[var(--card)] rounded-xl transition-all duration-150'

    const variants = {
      default: 'border border-[var(--border)]',
      elevated: 'shadow-lg dark:shadow-none dark:border dark:border-[var(--border)]',
      outlined: 'border border-[var(--border)]',
    }

    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    }

    const hoverStyles = hover ? 'hover:border-[var(--border-strong)] cursor-pointer' : ''

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], paddings[padding], hoverStyles, className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

// Card Header
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('mb-4', className)} {...props}>
      {children}
    </div>
  )
)
CardHeader.displayName = 'CardHeader'

// Card Title
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-[18px] font-medium text-[var(--foreground)]', className)} {...props}>
      {children}
    </h3>
  )
)
CardTitle.displayName = 'CardTitle'

// Card Description
export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p ref={ref} className={cn('text-[14px] text-[var(--muted-foreground)] mt-1', className)} {...props}>
      {children}
    </p>
  )
)
CardDescription.displayName = 'CardDescription'

// Card Content
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props}>
      {children}
    </div>
  )
)
CardContent.displayName = 'CardContent'

// Card Footer
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('mt-6 flex items-center gap-3', className)} {...props}>
      {children}
    </div>
  )
)
CardFooter.displayName = 'CardFooter'
