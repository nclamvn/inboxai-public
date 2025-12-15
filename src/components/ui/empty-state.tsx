'use client';

/**
 * Empty State Component
 * Reusable empty state for various scenarios
 */

import { memo, ReactNode } from 'react';
import {
  Inbox,
  Search,
  Mail,
  FolderOpen,
  Wifi,
  AlertCircle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateType =
  | 'no-emails'
  | 'no-results'
  | 'no-selection'
  | 'no-account'
  | 'offline'
  | 'error'
  | 'empty-folder';

interface EmptyStateProps {
  type?: EmptyStateType;
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  } | ReactNode;
  className?: string;
}

const EMPTY_STATE_CONFIG: Record<EmptyStateType, {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconColor: string;
}> = {
  'no-emails': {
    icon: Inbox,
    title: 'Hộp thư trống',
    description: 'Bạn chưa có email nào. Hãy kết nối tài khoản email để bắt đầu.',
    iconColor: 'text-blue-500',
  },
  'no-results': {
    icon: Search,
    title: 'Không tìm thấy kết quả',
    description: 'Thử tìm kiếm với từ khóa khác hoặc bỏ bớt bộ lọc.',
    iconColor: 'text-gray-400',
  },
  'no-selection': {
    icon: Mail,
    title: 'Chọn email để xem',
    description: 'Chọn một email từ danh sách bên trái để xem nội dung chi tiết.',
    iconColor: 'text-gray-400',
  },
  'no-account': {
    icon: Plus,
    title: 'Chưa có tài khoản email',
    description: 'Kết nối tài khoản Gmail hoặc Outlook để bắt đầu đồng bộ email.',
    iconColor: 'text-green-500',
  },
  'offline': {
    icon: Wifi,
    title: 'Không có kết nối mạng',
    description: 'Vui lòng kiểm tra kết nối internet và thử lại.',
    iconColor: 'text-orange-500',
  },
  'error': {
    icon: AlertCircle,
    title: 'Đã xảy ra lỗi',
    description: 'Không thể tải dữ liệu. Vui lòng thử lại sau.',
    iconColor: 'text-red-500',
  },
  'empty-folder': {
    icon: FolderOpen,
    title: 'Thư mục trống',
    description: 'Không có email nào trong thư mục này.',
    iconColor: 'text-gray-400',
  },
};

export const EmptyState = memo(function EmptyState({
  type,
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const config = type ? EMPTY_STATE_CONFIG[type] : null;
  const Icon = config?.icon;
  const isActionObject = action && typeof action === 'object' && 'label' in action;

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-4 text-center',
      className
    )}>
      {/* Icon */}
      <div className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center mb-4',
        'bg-gray-100 dark:bg-gray-800'
      )}>
        {icon || (Icon && <Icon className={cn('w-8 h-8', config?.iconColor)} />)}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title || config?.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
        {description || config?.description}
      </p>

      {/* Action Button */}
      {action && (
        isActionObject ? (
          <button
            onClick={(action as { label: string; onClick: () => void }).onClick}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm',
              'bg-blue-600 text-white hover:bg-blue-700 transition-colors'
            )}
          >
            {type === 'error' || type === 'offline' ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {(action as { label: string; onClick: () => void }).label}
          </button>
        ) : (
          <div className="mt-4">{action}</div>
        )
      )}
    </div>
  );
});

export default EmptyState;
