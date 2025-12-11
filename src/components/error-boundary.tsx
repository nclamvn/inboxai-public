'use client'

import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-64 text-[#6B6B6B]">
          <AlertCircle className="w-12 h-12 mb-4 text-[#DC2626]" strokeWidth={1.5} />
          <p className="text-[15px] font-medium text-[#1A1A1A]">Đã xảy ra lỗi</p>
          <p className="text-[13px] mt-1">{this.state.error?.message}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Tải lại trang
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
