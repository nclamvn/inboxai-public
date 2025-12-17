/**
 * Avatar Component
 * User avatar with fallback, sizes, status indicator
 */

'use client';

import React, { forwardRef, useState, type HTMLAttributes } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';
import { cn, getInitials, stringToColor } from '@/lib/utils';

// Avatar sizes
const avatarSizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
};

// Icon sizes
const iconSizes = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
  '2xl': 'h-12 w-12',
};

// Status indicator sizes
const statusSizes = {
  xs: 'h-1.5 w-1.5 border',
  sm: 'h-2 w-2 border',
  md: 'h-2.5 w-2.5 border-2',
  lg: 'h-3 w-3 border-2',
  xl: 'h-4 w-4 border-2',
  '2xl': 'h-5 w-5 border-2',
};

// Status colors
const statusColors = {
  online: 'bg-[var(--success)]',
  offline: 'bg-[var(--foreground-muted)]',
  busy: 'bg-[var(--error)]',
  away: 'bg-[var(--warning)]',
};

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Image source */
  src?: string | null;
  /** Alt text / Name for fallback */
  name?: string;
  /** Size */
  size?: keyof typeof avatarSizes;
  /** Status indicator */
  status?: keyof typeof statusColors;
  /** Show fallback icon instead of initials */
  showIcon?: boolean;
  /** Square shape instead of circle */
  square?: boolean;
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      name = '',
      size = 'md',
      status,
      showIcon = false,
      square = false,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = useState(false);
    const initials = getInitials(name);
    const bgColor = stringToColor(name || 'default');
    const showImage = src && !imageError;

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center',
          'shrink-0 overflow-hidden',
          square ? 'rounded-lg' : 'rounded-full',
          avatarSizes[size],
          className
        )}
        {...props}
      >
        {/* Image */}
        {showImage ? (
          <Image
            src={src}
            alt={name || 'Avatar'}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            sizes={
              size === '2xl' ? '96px' :
              size === 'xl' ? '64px' :
              size === 'lg' ? '48px' :
              size === 'md' ? '40px' :
              size === 'sm' ? '32px' : '24px'
            }
          />
        ) : (
          /* Fallback */
          <div
            className={cn(
              'flex items-center justify-center w-full h-full',
              'font-medium text-white'
            )}
            style={{ backgroundColor: bgColor }}
          >
            {showIcon || !initials ? (
              <User className={iconSizes[size]} strokeWidth={1.5} />
            ) : (
              initials
            )}
          </div>
        )}

        {/* Status indicator */}
        {status && (
          <span
            className={cn(
              'absolute bottom-0 right-0',
              'rounded-full border-[var(--background)]',
              statusSizes[size],
              statusColors[status]
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

/**
 * AvatarGroup Component
 */
export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Maximum avatars to show */
  max?: number;
  /** Size for all avatars */
  size?: keyof typeof avatarSizes;
  /** Avatars */
  children: React.ReactNode;
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, max = 5, size = 'md', children, ...props }, ref) => {
    const avatars = React.Children.toArray(children);
    const visibleAvatars = avatars.slice(0, max);
    const remainingCount = avatars.length - max;

    return (
      <div
        ref={ref}
        className={cn('flex -space-x-2', className)}
        {...props}
      >
        {visibleAvatars.map((avatar, index) => (
          <div
            key={index}
            className="ring-2 ring-[var(--background)] rounded-full"
          >
            {React.isValidElement(avatar)
              ? React.cloneElement(avatar as React.ReactElement<AvatarProps>, {
                  size,
                })
              : avatar}
          </div>
        ))}

        {remainingCount > 0 && (
          <div
            className={cn(
              'flex items-center justify-center',
              'rounded-full ring-2 ring-[var(--background)]',
              'bg-[var(--secondary)] text-[var(--foreground-secondary)] font-medium',
              avatarSizes[size]
            )}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = 'AvatarGroup';

export default Avatar;
