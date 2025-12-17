/**
 * Card Component
 * Versatile card with variants, hover states, clickable
 */

'use client';

import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Card variants
const cardVariants = {
  variant: {
    default: 'bg-[var(--card)] border border-[var(--border)] shadow-sm',
    elevated: 'bg-[var(--card)] shadow-lg border-0 dark:border dark:border-[var(--border)] dark:shadow-none',
    outlined: 'bg-transparent border border-[var(--border)]',
    filled: 'bg-[var(--secondary)] border-0',
    ghost: 'bg-transparent border-0',
  },
  padding: {
    none: 'p-0',
    xs: 'p-2',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8',
  },
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card variant */
  variant?: keyof typeof cardVariants.variant;
  /** Padding size */
  padding?: keyof typeof cardVariants.padding;
  /** Interactive (hover effects) - legacy support */
  hover?: boolean;
  /** Interactive (hover effects) */
  interactive?: boolean;
  /** Clickable (as button) */
  asButton?: boolean;
  /** Selected state */
  selected?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = 'default',
      padding = 'md',
      hover = false,
      interactive = false,
      asButton = false,
      selected = false,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const isClickable = asButton || !!onClick;
    const isInteractive = interactive || hover || isClickable;

    return (
      <div
        ref={ref}
        className={cn(
          // Base
          'rounded-xl',
          'transition-all duration-150',
          // Variant
          cardVariants.variant[variant],
          // Padding
          cardVariants.padding[padding],
          // Interactive
          isInteractive && [
            'hover:shadow-md',
            'hover:border-[var(--border-strong)]',
            'cursor-pointer',
          ],
          // Selected
          selected && [
            'ring-2 ring-[var(--primary)]',
            'border-[var(--primary)]',
          ],
          // Focus for keyboard navigation
          isClickable && [
            'focus:outline-none',
            'focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
          ],
          className
        )}
        onClick={onClick}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
                }
              }
            : undefined
        }
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * CardHeader Component
 */
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Title */
  title?: React.ReactNode;
  /** Subtitle */
  subtitle?: React.ReactNode;
  /** Action element */
  action?: React.ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, title, subtitle, action, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-start justify-between gap-4 mb-4', className)}
      {...props}
    >
      <div className="flex-1 min-w-0">
        {title && (
          <h3 className="text-[18px] font-semibold text-[var(--foreground)] truncate">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="text-[14px] text-[var(--foreground-secondary)] mt-0.5">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

/**
 * CardTitle Component
 */
export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-[18px] font-semibold text-[var(--foreground)]', className)}
    {...props}
  >
    {children}
  </h3>
));

CardTitle.displayName = 'CardTitle';

/**
 * CardDescription Component
 */
export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-[14px] text-[var(--foreground-secondary)] mt-1', className)}
    {...props}
  >
    {children}
  </p>
));

CardDescription.displayName = 'CardDescription';

/**
 * CardContent Component
 */
export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-[var(--foreground)]', className)}
    {...props}
  />
));

CardContent.displayName = 'CardContent';

/**
 * CardFooter Component
 */
export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center gap-3 pt-4 mt-4 border-t border-[var(--border)]',
      className
    )}
    {...props}
  />
));

CardFooter.displayName = 'CardFooter';

export default Card;
