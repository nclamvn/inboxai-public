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
import { Button } from './button';

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
}> = {
  'no-emails': {
    icon: Inbox,
    title: 'Hộp thư trống',
    description: 'Bạn chưa có email nào. Hãy kết nối tài khoản email để bắt đầu.',
  },
  'no-results': {
    icon: Search,
    title: 'Không tìm thấy kết quả',
    description: 'Thử tìm kiếm với từ khóa khác hoặc bỏ bớt bộ lọc.',
  },
  'no-selection': {
    icon: Mail,
    title: 'Chọn email để xem',
    description: 'Chọn một email từ danh sách bên trái để xem nội dung chi tiết.',
  },
  'no-account': {
    icon: Plus,
    title: 'Chưa có tài khoản email',
    description: 'Kết nối tài khoản Gmail hoặc Outlook để bắt đầu đồng bộ email.',
  },
  'offline': {
    icon: Wifi,
    title: 'Không có kết nối mạng',
    description: 'Vui lòng kiểm tra kết nối internet và thử lại.',
  },
  'error': {
    icon: AlertCircle,
    title: 'Đã xảy ra lỗi',
    description: 'Không thể tải dữ liệu. Vui lòng thử lại sau.',
  },
  'empty-folder': {
    icon: FolderOpen,
    title: 'Thư mục trống',
    description: 'Không có email nào trong thư mục này.',
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
      <div aria-hidden="true" className={cn(
        'w-12 h-12 flex items-center justify-center mb-4 text-[var(--accent-foreground)]'
      )}>
        {icon || (Icon && <Icon className="w-6 h-6" />)}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
        {title || config?.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-[var(--foreground-muted)] max-w-sm mb-6">
        {description || config?.description}
      </p>

      {/* Action Button */}
      {action && (
        isActionObject ? (
          <Button type="button" variant="outline"
            onClick={(action as { label: string; onClick: () => void }).onClick}
            leftIcon={type === 'error' || type === 'offline'
              ? <RefreshCw size={16} aria-hidden="true" />
              : <Plus size={16} aria-hidden="true" />}
          >
            {(action as { label: string; onClick: () => void }).label}
          </Button>
        ) : (
          <div className="mt-4">{action}</div>
        )
      )}
    </div>
  );
});

export default EmptyState;
