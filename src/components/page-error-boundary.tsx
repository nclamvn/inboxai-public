'use client';

/**
 * Page-level Error Boundary
 * Lighter version for wrapping individual pages/sections
 */

import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`[PageErrorBoundary:${this.props.pageName || 'unknown'}] Error:`, error);
      console.error('[PageErrorBoundary] Stack:', errorInfo.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-[var(--card)] rounded-lg border border-[var(--border)] m-4">
          <AlertTriangle className="w-10 h-10 mb-3 text-amber-500" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-[var(--foreground)]">
            Không thể tải {this.props.pageName || 'nội dung'}
          </p>
          <p className="text-[12px] mt-1 text-[var(--muted-foreground)]">
            Đã xảy ra lỗi khi tải dữ liệu
          </p>

          {/* Show error details in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-left overflow-auto max-h-20 max-w-sm w-full">
              <p className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                {this.state.error.message}
              </p>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={this.handleRetry}
          >
            <RotateCcw className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Thử lại
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;
