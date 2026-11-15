'use client';

/**
 * AI Summary Component
 * Fixed: Parse JSON summary data và hiển thị bullet points
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AISummaryProps {
  emailId: string;
  category?: string;
  priority?: number;
  bodyLength?: number;
  existingSummary?: string | null;
  className?: string;
}

// Parse summary data - có thể là string, JSON string, hoặc object
function parseSummaryData(data: unknown): string[] | null {
  if (!data) return null;

  // Nếu đã là array of strings
  if (Array.isArray(data)) {
    return data.filter(item => typeof item === 'string');
  }

  // Nếu là string, thử parse JSON
  if (typeof data === 'string') {
    // Nếu bắt đầu bằng { hoặc [, thử parse JSON
    if (data.startsWith('{') || data.startsWith('[')) {
      try {
        const parsed = JSON.parse(data);
        // Recursive call để xử lý parsed data
        return parseSummaryData(parsed);
      } catch {
        // Không phải JSON, trả về như single item
        return [data];
      }
    }
    // Plain string - split by newlines hoặc trả về single item
    if (data.includes('\n')) {
      return data.split('\n').filter(line => line.trim());
    }
    return [data];
  }

  // Nếu là object
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Check các field phổ biến
    if (Array.isArray(obj.summary)) {
      return obj.summary.filter(item => typeof item === 'string');
    }
    if (typeof obj.summary === 'string') {
      return [obj.summary];
    }
    if (Array.isArray(obj.bullets)) {
      return obj.bullets.filter(item => typeof item === 'string');
    }
    if (Array.isArray(obj.points)) {
      return obj.points.filter(item => typeof item === 'string');
    }
    if (typeof obj.text === 'string') {
      return [obj.text];
    }
  }

  return null;
}

// Categories that should AUTO-enable summary
const AUTO_SUMMARY_CATEGORIES = ['work', 'transaction', 'newsletter'];

// Categories that should show button only (not auto)
const BUTTON_SUMMARY_CATEGORIES = ['personal', 'promotion', 'social'];

// Categories that should NOT show summary at all
const NO_SUMMARY_CATEGORIES = ['spam'];

// Minimum body length to show summary option
const MIN_BODY_LENGTH = 400;

// Long email threshold (always show summary for very long emails)
const LONG_EMAIL_THRESHOLD = 800;

export function AISummary({
  emailId,
  category = 'personal',
  priority = 3,
  bodyLength = 0,
  existingSummary,
  className,
}: AISummaryProps) {
  const [summary, setSummary] = useState<string | null>(existingSummary || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if summary should be available
  const isSpam = NO_SUMMARY_CATEGORIES.includes(category);
  const isLongEmail = bodyLength >= LONG_EMAIL_THRESHOLD;
  const meetsMinLength = bodyLength >= MIN_BODY_LENGTH;

  // Should auto-fetch summary?
  const shouldAutoFetch = useCallback(() => {
    // Never auto for spam
    if (isSpam) return false;

    // Don't auto-fetch if already have summary
    if (existingSummary || summary) return false;

    // Don't auto-fetch if body too short
    if (!meetsMinLength) return false;

    // High priority (4-5) → always auto
    if (priority >= 4) return true;

    // Very long email → always auto
    if (isLongEmail) return true;

    // Check category
    if (AUTO_SUMMARY_CATEGORIES.includes(category)) return true;

    // Personal/Promotion/Social: only auto if very long
    if (BUTTON_SUMMARY_CATEGORIES.includes(category)) {
      return isLongEmail;
    }

    return false;
  }, [category, priority, isSpam, isLongEmail, meetsMinLength, existingSummary, summary]);

  // Should show the component at all?
  const shouldShowComponent = useCallback(() => {
    // Never show for spam
    if (isSpam) return false;

    // Show if already have summary
    if (existingSummary || summary) return true;

    // Show if meets minimum length
    if (meetsMinLength) return true;

    return false;
  }, [isSpam, existingSummary, summary, meetsMinLength]);

  // Should show manual button (when not auto)?
  const shouldShowButton = useCallback(() => {
    // Don't show button if already have summary
    if (existingSummary || summary) return false;

    // Don't show if loading
    if (isLoading) return false;

    // Show button for categories that don't auto-fetch
    if (BUTTON_SUMMARY_CATEGORIES.includes(category) && !isLongEmail) {
      return meetsMinLength;
    }

    return false;
  }, [category, existingSummary, summary, isLoading, isLongEmail, meetsMinLength]);

  const fetchSummary = useCallback(async () => {
    if (!emailId || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/features/${emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey: 'summary' }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();

      if (data.result?.success && data.result?.data) {
        setSummary(data.result.data);
      } else if (data.result?.error) {
        setError(data.result.error);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
      setError('Không thể tạo tóm tắt');
    } finally {
      setIsLoading(false);
      setHasChecked(true);
    }
  }, [emailId, isLoading]);

  // Auto-fetch effect with Smart Allocation check
  useEffect(() => {
    if (hasChecked) return;
    if (existingSummary) {
      setSummary(existingSummary);
      setHasChecked(true);
      return;
    }

    // Only auto-fetch if Smart Allocation allows
    if (shouldAutoFetch()) {
      fetchSummary();
    } else {
      setHasChecked(true);
    }
  }, [emailId, existingSummary, hasChecked, shouldAutoFetch, fetchSummary]);

  // Reset when email changes
  useEffect(() => {
    setSummary(existingSummary || null);
    setHasChecked(false);
    setError(null);
  }, [emailId, existingSummary]);

  const summaryBullets = useMemo(() => parseSummaryData(summary), [summary]);

  // Don't render if shouldn't show
  if (!shouldShowComponent()) {
    return null;
  }

  // Show manual trigger button
  if (shouldShowButton()) {
    return (
      <div className={cn('py-2', className)}>
        <button
          onClick={fetchSummary}
          disabled={isLoading}
          className={cn(
            'neo-target flex items-center gap-2 px-3 py-2 rounded-[var(--radius-control)] text-sm font-medium',
            'bg-[var(--surface)] text-[var(--accent-foreground)] hover:bg-[var(--hover)]',
            'border border-[var(--border-strong)]',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span>Tóm tắt AI</span>
        </button>
      </div>
    );
  }

  // Show loading state
  if (isLoading && !summary) {
    return (
      <div className={cn(
        'rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-3',
        className
      )}>
        <div className="flex items-center gap-2 text-[var(--accent-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Đang tóm tắt...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !summary) {
    return (
      <div className={cn(
        'rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-3',
        className
      )}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--error)]">{error}</span>
          <button
            onClick={fetchSummary}
            aria-label="Thử tóm tắt lại"
            className="neo-icon-button"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Parse summary into bullet points

  // Show summary
  if (!summary || !summaryBullets || summaryBullets.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      'rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)]',
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="neo-target flex w-full items-center justify-between p-3 text-start hover:bg-[var(--hover)]"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} strokeWidth={1.5} aria-hidden="true" className="text-[var(--accent-foreground)]" />
          <span className="text-sm font-medium text-[var(--foreground)]">
            Tóm tắt AI
          </span>
          {category && (
            <span className="text-xs px-2 py-1 rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground-muted)]">
              {category}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content - Bullet Points - Use CSS variables for theme-aware colors */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          {summaryBullets.length === 1 ? (
            <p className="text-sm leading-relaxed font-semibold text-[var(--foreground)]">
              {summaryBullets[0]}
            </p>
          ) : (
            <ul className="space-y-2">
              {summaryBullets.map((bullet, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex-shrink-0 text-[var(--accent-foreground)] font-bold text-base">•</span>
                  <span className="leading-relaxed font-semibold text-[var(--foreground)]">
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AISummary;
