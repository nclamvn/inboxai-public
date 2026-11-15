'use client';

/**
 * AI Bottom Bar
 * Compact AI features bar at bottom of email detail
 */

import { memo, useState, useCallback } from 'react';
import {
  FileText,
  MessageSquare,
  CheckSquare,
  ChevronUp,
  ChevronDown,
  Loader2,
  Copy,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIFeatures } from '@/hooks/use-ai-features';

interface AIBottomBarProps {
  emailId: string;
  category?: string | null;
  onReplySelect?: (reply: string) => void;
  className?: string;
}

type ExpandedSection = 'summary' | 'replies' | 'actions' | null;

export const AIBottomBar = memo(function AIBottomBar({
  emailId,
  category,
  onReplySelect,
  className,
}: AIBottomBarProps) {
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [copiedReply, setCopiedReply] = useState<number | null>(null);

  const {
    results,
    isLoading,
    triggerFeature,
  } = useAIFeatures(emailId);

  // ALL useCallback hooks MUST be called before any early returns (React rules of hooks)
  const toggleSection = useCallback((section: ExpandedSection) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  const handleCopyReply = useCallback((reply: string, index: number) => {
    navigator.clipboard.writeText(reply);
    setCopiedReply(index);
    setTimeout(() => setCopiedReply(null), 2000);
  }, []);

  const handleSelectReply = useCallback((reply: string) => {
    onReplySelect?.(reply);
  }, [onReplySelect]);

  // Retry handlers for each feature
  const handleRetrySummary = useCallback(() => {
    triggerFeature('summary');
  }, [triggerFeature]);

  const handleRetryReplies = useCallback(() => {
    triggerFeature('smart_reply');
  }, [triggerFeature]);

  const handleRetryActions = useCallback(() => {
    triggerFeature('action_items');
  }, [triggerFeature]);

  // Don't show for spam (after all hooks)
  if (category === 'spam') {
    return null;
  }

  // Extract results - handle different data structures
  const summaryData = results.summary?.status === 'success' ? results.summary.data : null;

  // Extract summary as array of bullet points for better display
  const getSummaryBullets = (data: unknown): string[] | null => {
    if (!data) return null;

    // If it's a JSON string, parse it first
    let parsed = data;
    if (typeof data === 'string') {
      if (data.startsWith('{') || data.startsWith('[')) {
        try {
          parsed = JSON.parse(data);
        } catch {
          // Not JSON, return as single item
          return [data];
        }
      } else {
        return [data];
      }
    }

    // If it's an array of strings, return directly
    if (Array.isArray(parsed)) {
      return parsed.filter(item => typeof item === 'string');
    }

    // If it's an object with summary array
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.summary)) {
      return obj.summary.filter(item => typeof item === 'string');
    }
    if (typeof obj.summary === 'string') {
      return [obj.summary];
    }
    if (typeof obj.text === 'string') {
      return [obj.text];
    }

    return null;
  };

  const summaryBullets = getSummaryBullets(summaryData);
  const summary = summaryBullets ? summaryBullets.join(' ') : null; // For hasData check

  const smartRepliesData = results.smart_reply?.status === 'success' ? results.smart_reply.data : null;
  // Smart replies can be: { replies: string[] } OR string[] OR { suggestions: string[] }
  const getSmartReplies = (data: unknown): string[] | null => {
    if (!data) return null;
    if (Array.isArray(data)) return data.filter(r => typeof r === 'string');
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.replies)) return obj.replies.filter(r => typeof r === 'string');
    if (Array.isArray(obj.suggestions)) return obj.suggestions.filter(r => typeof r === 'string');
    return null;
  };
  const smartReplies = getSmartReplies(smartRepliesData);

  const actionItemsData = results.action_items?.status === 'success' ? results.action_items.data : null;
  // Action items can be: { items: [] } OR [] OR { actions: [] }
  const getActionItems = (data: unknown): unknown[] | null => {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.actions)) return obj.actions;
    if (Array.isArray(obj.tasks)) return obj.tasks;
    return null;
  };
  const actionItems = getActionItems(actionItemsData);

  // Loading states - use isLoading when we don't have data yet (batch API in progress)
  const summaryLoading = results.summary?.status === 'loading' || (isLoading && !results.summary);
  const repliesLoading = results.smart_reply?.status === 'loading' || (isLoading && !results.smart_reply);
  const actionsLoading = results.action_items?.status === 'loading' || (isLoading && !results.action_items);

  return (
    <div className={cn(
      'flex-shrink-0 border-t border-[var(--border)] bg-[var(--surface)]',
      className
    )}>
      {/* Collapsed Bar */}
      <div className="flex items-center gap-1 px-4 py-2">
        {/* Summary Button */}
        <FeatureButton
          icon={FileText}
          label="Tóm tắt"
          isLoading={summaryLoading}
          hasData={!!summary}
          hasError={results.summary?.status === 'error'}
          isExpanded={expandedSection === 'summary'}
          onClick={() => toggleSection('summary')}
          onRetry={handleRetrySummary}
        />

        {/* Smart Replies Button */}
        <FeatureButton
          icon={MessageSquare}
          label="Gợi ý"
          isLoading={repliesLoading}
          hasData={!!smartReplies && Array.isArray(smartReplies) && smartReplies.length > 0}
          hasError={results.smart_reply?.status === 'error'}
          isExpanded={expandedSection === 'replies'}
          onClick={() => toggleSection('replies')}
          onRetry={handleRetryReplies}
          count={Array.isArray(smartReplies) ? smartReplies.length : undefined}
        />

        {/* Action Items Button */}
        <FeatureButton
          icon={CheckSquare}
          label="Việc cần làm"
          isLoading={actionsLoading}
          hasData={!!actionItems && Array.isArray(actionItems) && actionItems.length > 0}
          hasError={results.action_items?.status === 'error'}
          isExpanded={expandedSection === 'actions'}
          onClick={() => toggleSection('actions')}
          onRetry={handleRetryActions}
          count={Array.isArray(actionItems) ? actionItems.length : undefined}
        />
      </div>

      {/* Expanded Content */}
      {expandedSection && (
        <div className="border-t border-[var(--border)]">
          {/* Summary Section */}
          {expandedSection === 'summary' && (
            <ExpandedPanel
              title="Tóm tắt AI"
              onClose={() => setExpandedSection(null)}
            >
              {summaryLoading ? (
                <LoadingState />
              ) : summaryBullets && summaryBullets.length > 0 ? (
                <ul className="space-y-1.5">
                  {summaryBullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                      <span className="text-[var(--accent-foreground)]">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : results.summary?.status === 'success' && !results.summary?.data ? (
                <EmptyState message="Email quá ngắn để tóm tắt" />
              ) : (
                <EmptyState message="Không có tóm tắt" />
              )}
            </ExpandedPanel>
          )}

          {/* Smart Replies Section */}
          {expandedSection === 'replies' && (
            <ExpandedPanel
              title="Gợi ý trả lời"
              onClose={() => setExpandedSection(null)}
            >
              {repliesLoading ? (
                <LoadingState />
              ) : smartReplies && Array.isArray(smartReplies) && smartReplies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {smartReplies.map((reply: string, index: number) => (
                    <SmartReplyChip
                      key={index}
                      reply={reply}
                      index={index}
                      isCopied={copiedReply === index}
                      onCopy={() => handleCopyReply(reply, index)}
                      onSelect={() => handleSelectReply(reply)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="Không có gợi ý" />
              )}
            </ExpandedPanel>
          )}

          {/* Action Items Section */}
          {expandedSection === 'actions' && (
            <ExpandedPanel
              title="Công việc cần làm"
              onClose={() => setExpandedSection(null)}
            >
              {actionsLoading ? (
                <LoadingState />
              ) : actionItems && Array.isArray(actionItems) && actionItems.length > 0 ? (
                <ul className="space-y-2">
                  {actionItems.map((item: unknown, index: number) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckSquare className="w-4 h-4 text-[var(--success)] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-[var(--foreground)]">
                        {typeof item === 'string' ? item : (item as { task?: string; description?: string })?.task || (item as { task?: string; description?: string })?.description || ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="Không có công việc" />
              )}
            </ExpandedPanel>
          )}
        </div>
      )}
    </div>
  );
});

// ===== SUB-COMPONENTS =====

interface FeatureButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isLoading?: boolean;
  hasData?: boolean;
  hasError?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
  onRetry?: () => void;
  count?: number;
}

const FeatureButton = memo(function FeatureButton({
  icon: Icon,
  label,
  isLoading,
  hasData,
  hasError,
  isExpanded,
  onClick,
  onRetry,
  count,
}: FeatureButtonProps) {
  const handleClick = () => {
    if (hasError && onRetry) {
      onRetry();
    } else {
      onClick?.();
    }
  };

  return (
    <button
      type="button" onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading || undefined}
      aria-expanded={hasError ? undefined : isExpanded}
      aria-label={hasError ? `Thử lại: ${label}` : undefined}
      className={cn(
        'neo-nav-item neo-nav-inline neo-target min-h-8 gap-2 px-3 py-1 text-xs',
        isExpanded && 'bg-[var(--accent)] text-[var(--accent-foreground)]',
        hasError && 'text-[var(--error)]',
        isLoading && 'cursor-wait'
      )}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : hasError ? (
        <RefreshCw className="w-3.5 h-3.5" />
      ) : (
        <Icon className="w-3.5 h-3.5" />
      )}
      <span>{hasError ? 'Thử lại' : label}</span>
      {count !== undefined && count > 0 && !hasError && (
        <span className="ml-0.5 px-1.5 py-0.5 bg-[var(--secondary)] rounded-full text-[10px]">
          {count}
        </span>
      )}
      {hasData && !isExpanded && !hasError && (
        <ChevronUp className="w-3 h-3 ml-0.5" />
      )}
      {isExpanded && !hasError && (
        <ChevronDown className="w-3 h-3 ml-0.5" />
      )}
    </button>
  );
});

interface ExpandedPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const ExpandedPanel = memo(function ExpandedPanel({
  title,
  onClose,
  children,
}: ExpandedPanelProps) {
  return (
    <div className="px-4 py-3 bg-[var(--card)] max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-[var(--foreground)]">
          {title}
        </h4>
        <button
          type="button" onClick={onClose}
          aria-label="Đóng phần hỗ trợ"
          className="neo-icon-button h-8 w-8"
        >
          <X className="w-4 h-4 text-[var(--muted-foreground)]" />
        </button>
      </div>
      {children}
    </div>
  );
});

interface SmartReplyChipProps {
  reply: string;
  index: number;
  isCopied: boolean;
  onCopy: () => void;
  onSelect: () => void;
}

const SmartReplyChip = memo(function SmartReplyChip({
  reply,
  isCopied,
  onCopy,
  onSelect,
}: SmartReplyChipProps) {
  // Truncate long replies
  const displayText = reply.length > 50 ? reply.slice(0, 50) + '...' : reply;

  return (
    <div className="group flex items-center gap-1 px-3 py-2 bg-[var(--secondary)] rounded-lg hover:bg-[var(--hover)] transition-colors">
      <button
        onClick={onSelect}
        className="text-sm text-[var(--foreground)] text-left"
      >
        {displayText}
      </button>
      <button
        onClick={onCopy}
        className="p-1 hover:bg-[var(--hover)] rounded"
        aria-label="Sao chép gợi ý"
      >
        {isCopied ? (
          <Check className="w-3 h-3 text-[var(--success)]" />
        ) : (
          <Copy className="w-3 h-3 text-[var(--muted-foreground)]" />
        )}
      </button>
    </div>
  );
});

const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Đang xử lý...</span>
    </div>
  );
});

const EmptyState = memo(function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-[var(--muted-foreground)] italic">
      {message}
    </p>
  );
});

export default AIBottomBar;
