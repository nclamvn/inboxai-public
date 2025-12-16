/**
 * Toast Utility
 * Wrapper around the toast system with error integration
 */

import { toast as showToast, type ToastType } from '@/components/ui/toast'
import { ApiError, getErrorMessage, isApiError } from '@/lib/api/errors'

// =============================================================================
// Toast Functions
// =============================================================================

/**
 * Show success toast
 */
export function toastSuccess(message: string, description?: string) {
  showToast('success', message, description)
}

/**
 * Show error toast
 */
export function toastError(message: string, description?: string) {
  showToast('error', message, description)
}

/**
 * Show warning toast
 */
export function toastWarning(message: string, description?: string) {
  showToast('warning', message, description)
}

/**
 * Show info toast
 */
export function toastInfo(message: string, description?: string) {
  showToast('info', message, description)
}

/**
 * Show toast from Error object
 */
export function toastFromError(error: unknown, defaultMessage?: string) {
  const message = getErrorMessage(error) || defaultMessage || 'Đã xảy ra lỗi'

  if (isApiError(error)) {
    // For retryable errors, show as warning
    if (error.retryable) {
      showToast('warning', message, 'Vui lòng thử lại sau giây lát')
    } else {
      showToast('error', message)
    }
  } else {
    showToast('error', message)
  }
}

/**
 * Show network error toast
 */
export function toastNetworkError() {
  showToast('error', 'Lỗi kết nối mạng', 'Vui lòng kiểm tra internet và thử lại')
}

/**
 * Show offline toast
 */
export function toastOffline() {
  showToast('warning', 'Bạn đang offline', 'Một số tính năng có thể bị hạn chế')
}

/**
 * Show back online toast
 */
export function toastBackOnline() {
  showToast('success', 'Đã kết nối lại', 'Bạn đã online trở lại')
}

// =============================================================================
// Promise Toast
// =============================================================================

interface PromiseToastOptions<T> {
  loading?: string
  success?: string | ((data: T) => string)
  error?: string | ((error: unknown) => string)
}

/**
 * Show toast for async operations (loading -> success/error)
 */
export async function toastPromise<T>(
  promise: Promise<T>,
  options: PromiseToastOptions<T>
): Promise<T> {
  // Show loading toast
  if (options.loading) {
    showToast('info', options.loading, undefined, 0) // No auto-dismiss
  }

  try {
    const result = await promise

    // Show success toast
    const successMessage =
      typeof options.success === 'function'
        ? options.success(result)
        : options.success || 'Thành công'
    showToast('success', successMessage)

    return result
  } catch (error) {
    // Show error toast
    const errorMessage =
      typeof options.error === 'function'
        ? options.error(error)
        : options.error || getErrorMessage(error)
    showToast('error', errorMessage)

    throw error
  }
}

// =============================================================================
// Re-export base toast for flexibility
// =============================================================================

export { showToast as toast }
export type { ToastType }
