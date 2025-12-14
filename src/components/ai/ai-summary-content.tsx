'use client';

/**
 * AI Summary Content
 * Display AI-generated email summary
 * Handles both string and object formats
 */

import { cn } from '@/lib/utils';
import { AlertCircle, Calendar } from 'lucide-react';

interface SummaryObject {
  summary: string[];
  keyDates?: string[];
  actionRequired?: boolean;
  sentiment?: string;
  wordCount?: number;
}

interface AISummaryContentProps {
  summary: string | SummaryObject;
  className?: string;
}

export function AISummaryContent({ summary, className }: AISummaryContentProps) {
  if (!summary) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Không có tóm tắt</p>
    );
  }

  // Handle string format (legacy)
  if (typeof summary === 'string') {
    return (
      <div className={cn('text-sm text-[var(--foreground)]', className)}>
        <p className="whitespace-pre-wrap">{summary}</p>
      </div>
    );
  }

  // Handle object format (new)
  const { summary: bulletPoints, keyDates, actionRequired } = summary;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Summary bullet points */}
      {bulletPoints && bulletPoints.length > 0 && (
        <ul className="text-sm text-[var(--foreground)] space-y-1">
          {bulletPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[var(--muted-foreground)] mt-1">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Key dates */}
      {keyDates && keyDates.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <Calendar className="w-3 h-3" />
          <span>{keyDates.join(', ')}</span>
        </div>
      )}

      {/* Action required badge */}
      {actionRequired && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3" />
          <span>Cần hành động</span>
        </div>
      )}
    </div>
  );
}
