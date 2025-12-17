/**
 * Skeleton Component
 * Loading placeholders with shimmer effect
 */

'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variant */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  /** Width */
  width?: number | string;
  /** Height */
  height?: number | string;
  /** Animation */
  animation?: 'pulse' | 'shimmer' | 'none';
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'text',
      width,
      height,
      animation = 'shimmer',
      style,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      text: 'h-4 rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-none',
      rounded: 'rounded-lg',
    };

    const animationClasses = {
      pulse: 'animate-pulse',
      shimmer: 'skeleton-shimmer',
      none: '',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'bg-[var(--secondary)]',
          variantClasses[variant],
          animationClasses[animation],
          className
        )}
        style={{
          width: width,
          height: height,
          ...style,
        }}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

/**
 * SkeletonText - Multiple lines of text
 */
export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of lines */
  lines?: number;
  /** Gap between lines */
  gap?: number;
  /** Animation */
  animation?: 'pulse' | 'shimmer' | 'none';
}

export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, gap = 8, animation = 'shimmer', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('space-y-2', className)}
        style={{ gap }}
        {...props}
      >
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            variant="text"
            animation={animation}
            style={{
              width: index === lines - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }
);

SkeletonText.displayName = 'SkeletonText';

/**
 * SkeletonAvatar
 */
export interface SkeletonAvatarProps extends Omit<SkeletonProps, 'variant'> {
  /** Size in pixels */
  size?: number;
}

export const SkeletonAvatar = forwardRef<HTMLDivElement, SkeletonAvatarProps>(
  ({ size = 40, animation = 'shimmer', ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="circular"
      width={size}
      height={size}
      animation={animation}
      {...props}
    />
  )
);

SkeletonAvatar.displayName = 'SkeletonAvatar';

/**
 * SkeletonButton
 */
export interface SkeletonButtonProps extends Omit<SkeletonProps, 'variant'> {
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
}

export const SkeletonButton = forwardRef<HTMLDivElement, SkeletonButtonProps>(
  ({ size = 'md', animation = 'shimmer', ...props }, ref) => {
    const sizes = {
      sm: { width: 60, height: 32 },
      md: { width: 80, height: 40 },
      lg: { width: 100, height: 48 },
    };

    return (
      <Skeleton
        ref={ref}
        variant="rounded"
        width={sizes[size].width}
        height={sizes[size].height}
        animation={animation}
        {...props}
      />
    );
  }
);

SkeletonButton.displayName = 'SkeletonButton';

/**
 * SkeletonCard - Card placeholder
 */
export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show avatar */
  showAvatar?: boolean;
  /** Show image */
  showImage?: boolean;
  /** Number of text lines */
  lines?: number;
}

export const SkeletonCard = forwardRef<HTMLDivElement, SkeletonCardProps>(
  (
    { className, showAvatar = true, showImage = false, lines = 2, ...props },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        'bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-4',
        className
      )}
      {...props}
    >
      {/* Image placeholder */}
      {showImage && (
        <Skeleton variant="rounded" height={160} className="w-full" />
      )}

      {/* Avatar + text */}
      {showAvatar && (
        <div className="flex items-center gap-3">
          <SkeletonAvatar size={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="30%" height={12} />
          </div>
        </div>
      )}

      {/* Text lines */}
      <SkeletonText lines={lines} />
    </div>
  )
);

SkeletonCard.displayName = 'SkeletonCard';

/**
 * EmailRowSkeleton - Legacy support
 */
export function EmailRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
      <Skeleton className="w-4 h-4 rounded" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

/**
 * EmailListSkeleton - Legacy support
 */
export function EmailListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y divide-[var(--border)]">
      {[...Array(count)].map((_, i) => (
        <EmailRowSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * EmailDetailSkeleton - Legacy support
 */
export function EmailDetailSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-7 w-3/4" />
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="space-y-3 pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/**
 * CardSkeleton - Legacy support
 */
export function CardSkeleton() {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/**
 * AvatarSkeleton - Legacy support
 */
export function AvatarSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 32,
    md: 40,
    lg: 48,
  };

  return <SkeletonAvatar size={sizes[size]} />;
}

export default Skeleton;
