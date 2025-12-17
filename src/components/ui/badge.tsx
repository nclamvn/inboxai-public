/**
 * Badge Component
 * Labels, tags, status indicators
 */

'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Badge variants
const badgeVariants = {
  variant: {
    default: 'bg-[var(--secondary)] text-[var(--foreground-secondary)] border-[var(--border)]',
    primary: 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20',
    secondary: 'bg-[var(--secondary)] text-[var(--foreground-secondary)] border-[var(--border)]',
    success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20',
    error: 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]/20',
    info: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info)]/20',
    outline: 'bg-transparent text-[var(--foreground)] border-[var(--border)]',
    // Legacy support
    urgent: 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]/20',
  },
  size: {
    xs: 'text-[10px] px-1.5 py-0.5 rounded',
    sm: 'text-xs px-2 py-0.5 rounded-md',
    md: 'text-xs px-2.5 py-1 rounded-md',
    lg: 'text-sm px-3 py-1 rounded-lg',
  },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Badge variant */
  variant?: keyof typeof badgeVariants.variant;
  /** Badge size */
  size?: keyof typeof badgeVariants.size;
  /** Dot indicator (no text) */
  dot?: boolean;
  /** Dot color */
  dotColor?: string;
  /** Pill shape */
  pill?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'default',
      size = 'sm',
      dot = false,
      dotColor,
      pill = false,
      children,
      ...props
    },
    ref
  ) => {
    // Dot-only badge
    if (dot && !children) {
      return (
        <span
          ref={ref}
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            !dotColor && badgeVariants.variant[variant].split(' ')[0],
            className
          )}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
          {...props}
        />
      );
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium border',
          badgeVariants.variant[variant],
          badgeVariants.size[size],
          pill && 'rounded-full',
          className
        )}
        {...props}
      >
        {/* Dot indicator */}
        {dot && (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              !dotColor && 'bg-current opacity-70'
            )}
            style={dotColor ? { backgroundColor: dotColor } : undefined}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

/**
 * Badge Group
 */
export interface BadgeGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum badges to show */
  max?: number;
}

export const BadgeGroup = forwardRef<HTMLDivElement, BadgeGroupProps>(
  ({ className, max, children, ...props }, ref) => {
    const badges = React.Children.toArray(children);
    const visibleBadges = max ? badges.slice(0, max) : badges;
    const remainingCount = max ? badges.length - max : 0;

    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-center gap-1.5', className)}
        {...props}
      >
        {visibleBadges}
        {remainingCount > 0 && (
          <Badge variant="default" size="sm">
            +{remainingCount}
          </Badge>
        )}
      </div>
    );
  }
);

BadgeGroup.displayName = 'BadgeGroup';

export default Badge;
