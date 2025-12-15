'use client';

/**
 * Loading Skeleton Components
 * Consistent loading states across the app
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';

// Base skeleton
export const Skeleton = memo(function Skeleton({
  className
}: {
  className?: string
}) {
  return (
    <div className={cn(
      'animate-pulse bg-gray-200 dark:bg-gray-700 rounded',
      className
    )} />
  );
});

// Email list item skeleton
export const EmailItemSkeleton = memo(function EmailItemSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
});

// Email list skeleton
export const EmailListSkeleton = memo(function EmailListSkeleton({
  count = 8
}: {
  count?: number
}) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from({ length: count }).map((_, i) => (
        <EmailItemSkeleton key={i} />
      ))}
    </div>
  );
});

// Email detail skeleton
export const EmailDetailSkeleton = memo(function EmailDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 pt-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* AI Bar */}
      <div className="pt-6">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
});

// Stats card skeleton
export const StatsCardSkeleton = memo(function StatsCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="w-12 h-12 rounded-lg" />
      </div>
    </div>
  );
});

// Page loading skeleton
export const PageSkeleton = memo(function PageSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {/* List */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-800">
          <EmailListSkeleton count={10} />
        </div>

        {/* Detail */}
        <div className="flex-1">
          <EmailDetailSkeleton />
        </div>
      </div>
    </div>
  );
});

export default Skeleton;
