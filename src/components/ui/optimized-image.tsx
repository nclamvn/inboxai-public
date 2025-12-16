'use client'

/**
 * Optimized Image Component
 * - Lazy loading
 * - Loading state with skeleton
 * - Error fallback
 * - Blur placeholder support
 */

import Image, { ImageProps } from 'next/image'
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps extends Omit<ImageProps, 'onLoadingComplete' | 'onError'> {
  fallbackSrc?: string
  showSkeleton?: boolean
  aspectRatio?: 'square' | 'video' | 'portrait' | 'auto'
}

const aspectRatioClasses = {
  square: 'aspect-square',
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  auto: '',
}

export function OptimizedImage({
  src,
  alt,
  className,
  fallbackSrc = '/images/placeholder.png',
  showSkeleton = true,
  aspectRatio = 'auto',
  fill,
  width,
  height,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleError = useCallback(() => {
    setHasError(true)
    setIsLoading(false)
  }, [])

  const imageSrc = hasError ? fallbackSrc : src

  // Determine if we should use fill or explicit dimensions
  const useFill = fill || (!width && !height)

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        aspectRatioClasses[aspectRatio],
        className
      )}
    >
      {/* Loading skeleton */}
      {showSkeleton && isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Image */}
      <Image
        src={imageSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300 object-cover',
          isLoading ? 'opacity-0' : 'opacity-100'
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        {...(useFill
          ? { fill: true }
          : { width: width || 100, height: height || 100 })}
        {...props}
      />
    </div>
  )
}

/**
 * Avatar image with circular crop
 */
interface AvatarImageProps {
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  fallback?: string
  className?: string
}

const avatarSizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
}

export function AvatarImage({
  src,
  alt,
  size = 'md',
  fallback,
  className,
}: AvatarImageProps) {
  const [hasError, setHasError] = useState(false)
  const initials = alt
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (!src || hasError) {
    return (
      <div
        className={cn(
          'rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium',
          avatarSizes[size],
          className
        )}
      >
        {fallback || initials}
      </div>
    )
  }

  return (
    <div className={cn('relative rounded-full overflow-hidden', avatarSizes[size], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        onError={() => setHasError(true)}
        loading="lazy"
      />
    </div>
  )
}

export default OptimizedImage
