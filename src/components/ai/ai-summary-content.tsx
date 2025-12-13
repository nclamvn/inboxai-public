'use client';

/**
 * AI Summary Content
 * Display AI-generated email summary
 */

import { cn } from '@/lib/utils';

interface AISummaryContentProps {
  summary: string;
  className?: string;
}

export function AISummaryContent({ summary, className }: AISummaryContentProps) {
  if (!summary) {
    return (
      <p className="text-sm text-gray-500">Khong co tom tat</p>
    );
  }

  return (
    <div className={cn('text-sm text-gray-700 dark:text-gray-300', className)}>
      <p className="whitespace-pre-wrap">{summary}</p>
    </div>
  );
}
