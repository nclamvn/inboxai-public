/**
 * API Error System
 * Standardized error handling with error codes and Vietnamese messages
 */

// =============================================================================
// Error Codes
// =============================================================================

export const API_ERROR_CODES = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  OFFLINE: 'OFFLINE',

  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Authorization errors
  FORBIDDEN: 'FORBIDDEN',
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Client errors
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Server errors
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  MAINTENANCE: 'MAINTENANCE',

  // Email-specific errors
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_SYNC_FAILED: 'EMAIL_SYNC_FAILED',
  IMAP_CONNECTION_FAILED: 'IMAP_CONNECTION_FAILED',
  SMTP_CONNECTION_FAILED: 'SMTP_CONNECTION_FAILED',
  OAUTH_ERROR: 'OAUTH_ERROR',

  // AI errors
  AI_PROCESSING_FAILED: 'AI_PROCESSING_FAILED',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',

  // Unknown
  UNKNOWN: 'UNKNOWN',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

// =============================================================================
// Vietnamese Error Messages
// =============================================================================

export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  [API_ERROR_CODES.NETWORK_ERROR]: 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.',
  [API_ERROR_CODES.TIMEOUT]: 'Yêu cầu hết thời gian chờ. Vui lòng thử lại.',
  [API_ERROR_CODES.OFFLINE]: 'Bạn đang offline. Vui lòng kiểm tra kết nối mạng.',

  [API_ERROR_CODES.UNAUTHORIZED]: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
  [API_ERROR_CODES.SESSION_EXPIRED]: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  [API_ERROR_CODES.INVALID_TOKEN]: 'Token không hợp lệ. Vui lòng đăng nhập lại.',

  [API_ERROR_CODES.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
  [API_ERROR_CODES.ACCESS_DENIED]: 'Truy cập bị từ chối.',

  [API_ERROR_CODES.BAD_REQUEST]: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.',
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  [API_ERROR_CODES.NOT_FOUND]: 'Không tìm thấy tài nguyên yêu cầu.',
  [API_ERROR_CODES.CONFLICT]: 'Xung đột dữ liệu. Vui lòng tải lại trang.',

  [API_ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Quá nhiều yêu cầu. Vui lòng đợi một chút.',
  [API_ERROR_CODES.QUOTA_EXCEEDED]: 'Đã vượt quá giới hạn sử dụng.',

  [API_ERROR_CODES.SERVER_ERROR]: 'Lỗi máy chủ. Vui lòng thử lại sau.',
  [API_ERROR_CODES.SERVICE_UNAVAILABLE]: 'Dịch vụ tạm thời không khả dụng.',
  [API_ERROR_CODES.MAINTENANCE]: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',

  [API_ERROR_CODES.EMAIL_SEND_FAILED]: 'Không thể gửi email. Vui lòng thử lại.',
  [API_ERROR_CODES.EMAIL_SYNC_FAILED]: 'Không thể đồng bộ email. Vui lòng thử lại.',
  [API_ERROR_CODES.IMAP_CONNECTION_FAILED]: 'Không thể kết nối IMAP. Kiểm tra cài đặt.',
  [API_ERROR_CODES.SMTP_CONNECTION_FAILED]: 'Không thể kết nối SMTP. Kiểm tra cài đặt.',
  [API_ERROR_CODES.OAUTH_ERROR]: 'Lỗi xác thực OAuth. Vui lòng thử lại.',

  [API_ERROR_CODES.AI_PROCESSING_FAILED]: 'AI không thể xử lý yêu cầu. Vui lòng thử lại.',
  [API_ERROR_CODES.AI_QUOTA_EXCEEDED]: 'Đã hết lượt sử dụng AI trong ngày.',

  [API_ERROR_CODES.UNKNOWN]: 'Đã xảy ra lỗi không xác định.',
}

// =============================================================================
// ApiError Class
// =============================================================================

export interface ApiErrorOptions {
  code: ApiErrorCode
  message?: string
  statusCode?: number
  details?: Record<string, unknown>
  cause?: Error
  retryable?: boolean
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly statusCode: number
  readonly details?: Record<string, unknown>
  readonly retryable: boolean
  readonly timestamp: Date

  constructor(options: ApiErrorOptions) {
    const message = options.message || ERROR_MESSAGES[options.code] || ERROR_MESSAGES.UNKNOWN
    super(message)

    this.name = 'ApiError'
    this.code = options.code
    this.statusCode = options.statusCode || 500
    this.details = options.details
    this.retryable = options.retryable ?? isRetryableError(options.code)
    this.timestamp = new Date()

    if (options.cause) {
      this.cause = options.cause
    }

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: ApiErrorCode): boolean {
  const retryableCodes: ApiErrorCode[] = [
    API_ERROR_CODES.NETWORK_ERROR,
    API_ERROR_CODES.TIMEOUT,
    API_ERROR_CODES.SERVER_ERROR,
    API_ERROR_CODES.SERVICE_UNAVAILABLE,
    API_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    API_ERROR_CODES.EMAIL_SYNC_FAILED,
  ]
  return retryableCodes.includes(code)
}

/**
 * Map HTTP status code to ApiErrorCode
 */
export function httpStatusToErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return API_ERROR_CODES.BAD_REQUEST
    case 401:
      return API_ERROR_CODES.UNAUTHORIZED
    case 403:
      return API_ERROR_CODES.FORBIDDEN
    case 404:
      return API_ERROR_CODES.NOT_FOUND
    case 409:
      return API_ERROR_CODES.CONFLICT
    case 422:
      return API_ERROR_CODES.VALIDATION_ERROR
    case 429:
      return API_ERROR_CODES.RATE_LIMIT_EXCEEDED
    case 500:
      return API_ERROR_CODES.SERVER_ERROR
    case 503:
      return API_ERROR_CODES.SERVICE_UNAVAILABLE
    default:
      if (status >= 500) return API_ERROR_CODES.SERVER_ERROR
      if (status >= 400) return API_ERROR_CODES.BAD_REQUEST
      return API_ERROR_CODES.UNKNOWN
  }
}

/**
 * Create ApiError from HTTP response
 */
export async function createErrorFromResponse(response: Response): Promise<ApiError> {
  const code = httpStatusToErrorCode(response.status)
  let details: Record<string, unknown> | undefined

  try {
    const body = await response.json()
    details = body
  } catch {
    // Response body is not JSON, ignore
  }

  return new ApiError({
    code,
    statusCode: response.status,
    details,
  })
}

/**
 * Check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message
  }

  if (error instanceof Error) {
    // Check for common network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return ERROR_MESSAGES.NETWORK_ERROR
    }
    if (error.message.includes('timeout')) {
      return ERROR_MESSAGES.TIMEOUT
    }
    return error.message
  }

  return ERROR_MESSAGES.UNKNOWN
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: ApiError) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError({
              code: API_ERROR_CODES.UNKNOWN,
              cause: error instanceof Error ? error : undefined,
            })

      if (errorHandler) {
        errorHandler(apiError)
      }

      throw apiError
    }
  }) as T
}
