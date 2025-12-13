'use client';

/**
 * AI Action Items Content
 * Display extracted tasks and deadlines
 */

import { useState } from 'react';
import { Calendar, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionItem {
  id?: string;
  task: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  completed?: boolean;
}

interface AIActionItemsContentProps {
  items: ActionItem[];
  onToggleComplete?: (index: number, completed: boolean) => void;
  className?: string;
}

export function AIActionItemsContent({
  items,
  onToggleComplete,
  className
}: AIActionItemsContentProps) {
  const [localItems, setLocalItems] = useState(items);

  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-gray-500">Khong tim thay cong viec can lam</p>
    );
  }

  const handleToggle = (index: number) => {
    const newItems = [...localItems];
    newItems[index] = { ...newItems[index], completed: !newItems[index].completed };
    setLocalItems(newItems);
    onToggleComplete?.(index, newItems[index].completed || false);
  };

  const priorityColors = {
    high: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    medium: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    low: 'text-green-500 bg-green-50 dark:bg-green-900/20',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {localItems.map((item, index) => (
        <div
          key={item.id || index}
          className={cn(
            'flex items-start gap-3 p-2 rounded-lg transition-colors',
            'hover:bg-gray-50 dark:hover:bg-gray-800/50',
            item.completed && 'opacity-60'
          )}
        >
          <button
            onClick={() => handleToggle(index)}
            className="mt-0.5 flex-shrink-0"
          >
            {item.completed ? (
              <CheckSquare className="w-5 h-5 text-green-500" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-sm text-gray-700 dark:text-gray-300',
              item.completed && 'line-through'
            )}>
              {item.task}
            </p>

            <div className="flex items-center gap-2 mt-1">
              {item.deadline && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  {item.deadline}
                </span>
              )}
              {item.priority && (
                <span className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  priorityColors[item.priority]
                )}>
                  {item.priority === 'high' ? 'Cao' :
                   item.priority === 'medium' ? 'Trung binh' : 'Thap'}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
