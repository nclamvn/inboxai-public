'use client'

/**
 * Global Error Boundary System
 * - ErrorBoundary: Class component for catching unhandled errors
 * - SectionErrorFallback: Reusable fallback UI for smaller sections
 * - withErrorBoundary: HOC to wrap components with error boundary
 */

import React, { Component, ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { captureException, addBreadcrumb } from '@/lib/sentry'

// =============================================================================
// Types
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

// =============================================================================
// ErrorBoundary Class Component
// =============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary] Caught error:', error)
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    }

    // Report to Sentry with context
    captureException(error, {
      tags: {
        errorBoundary: 'global',
      },
      extra: {
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
    })

    // Add breadcrumb for debugging
    addBreadcrumb('Error caught by boundary', 'error', 'error', {
      error: error.message,
    })

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReportIssue = () => {
    const subject = encodeURIComponent('Báo lỗi InboxAI')
    const body = encodeURIComponent(
      `Mô tả lỗi:\n\n` +
      `Chi tiết kỹ thuật:\n` +
      `- Error: ${this.state.error?.message || 'Unknown'}\n` +
      `- URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}\n` +
      `- Time: ${new Date().toISOString()}\n` +
      `- UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`
    )
    window.open(`mailto:support@inboxai.vn?subject=${subject}&body=${body}`)
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Error Icon */}
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Đã xảy ra lỗi
              </h1>
              <p className="text-muted-foreground">
                Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại hoặc quay về trang chủ.
              </p>
            </div>

            {/* Error Details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left bg-muted/50 rounded-lg p-4 text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Chi tiết lỗi (Development)
                </summary>
                <pre className="mt-2 overflow-auto text-xs text-destructive whitespace-pre-wrap max-h-48">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="primary">
                <RotateCcw className="w-4 h-4 mr-2" />
                Thử lại
              </Button>
              <Button onClick={this.handleReload} variant="secondary">
                <RefreshCw className="w-4 h-4 mr-2" />
                Tải lại trang
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleGoHome} variant="secondary">
                <Home className="w-4 h-4 mr-2" />
                Về trang chủ
              </Button>
              <Button onClick={this.handleReportIssue} variant="ghost">
                <Bug className="w-4 h-4 mr-2" />
                Báo lỗi
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// =============================================================================
// SectionErrorFallback - For smaller component sections
// =============================================================================

interface SectionErrorFallbackProps {
  title?: string
  message?: string
  onRetry?: () => void
  compact?: boolean
}

export function SectionErrorFallback({
  title = 'Không thể tải nội dung',
  message = 'Đã xảy ra lỗi khi tải phần này. Vui lòng thử lại.',
  onRetry,
  compact = false
}: SectionErrorFallbackProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
        <span className="text-destructive">{message}</span>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry} className="ml-auto h-7 px-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-muted/30 rounded-lg border border-border">
      <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Thử lại
        </Button>
      )}
    </div>
  )
}

// =============================================================================
// withErrorBoundary HOC
// =============================================================================

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const ComponentWithErrorBoundary = (props: P) => {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`

  return ComponentWithErrorBoundary
}

export default ErrorBoundary
