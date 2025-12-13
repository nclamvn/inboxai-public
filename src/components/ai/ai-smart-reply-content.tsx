'use client';

/**
 * AI Smart Reply Content
 * Display suggested replies
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AISmartReplyContentProps {
  replies: string[];
  onSelect?: (reply: string) => void;
  className?: string;
}

export function AISmartReplyContent({
  replies,
  onSelect,
  className
}: AISmartReplyContentProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!replies || replies.length === 0) {
    return (
      <p className="text-sm text-gray-500">Khong co goi y tra loi</p>
    );
  }

  const handleCopy = async (reply: string, index: number) => {
    await navigator.clipboard.writeText(reply);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {replies.map((reply, index) => (
        <div
          key={index}
          className={cn(
            'group relative p-3 rounded-lg border cursor-pointer transition-all',
            'hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-900/20',
            'border-gray-200 dark:border-gray-700',
            'bg-gray-50 dark:bg-gray-800/50'
          )}
          onClick={() => onSelect?.(reply)}
        >
          <p className="text-sm text-gray-700 dark:text-gray-300 pr-8">
            {reply}
          </p>
          <button
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
              'hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(reply, index);
            }}
          >
            {copiedIndex === index ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
