'use client';

/**
 * Global Error Boundary
 * Catches unhandled errors and displays a friendly fallback UI
 */

import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
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
      console.error('[ErrorBoundary] Error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    this.setState({ errorInfo });

    // TODO: Send to error tracking service in production
    // if (process.env.NODE_ENV === 'production') {
    //   captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    // }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-[var(--muted-foreground)]">
          <AlertCircle className="w-12 h-12 mb-4 text-red-600 dark:text-red-400" strokeWidth={1.5} />
          <p className="text-[15px] font-medium text-[var(--foreground)]">Đã xảy ra lỗi</p>
          <p className="text-[13px] mt-1 text-center max-w-md">
            Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại.
          </p>

          {/* Show error details in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded text-left overflow-auto max-h-24 max-w-md w-full">
              <p className="text-xs font-mono text-red-600 dark:text-red-400">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={this.handleReset}
            >
              <RotateCcw className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Thử lại
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={this.handleReload}
            >
              <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Tải lại trang
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
