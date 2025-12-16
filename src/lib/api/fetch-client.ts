/**
 * Fetch Client with Retry Logic
 * - Exponential backoff retry
 * - Request/response interceptors
 * - Timeout handling
 * - Error standardization
 */

import {
  ApiError,
  API_ERROR_CODES,
  createErrorFromResponse,
  isRetryableError,
} from './errors'
import { captureException, addBreadcrumb, trackApiCall } from '@/lib/sentry'

// =============================================================================
// Types
// =============================================================================

export interface FetchClientOptions {
  baseUrl?: string
  timeout?: number
  retries?: number
  retryDelay?: number
  maxRetryDelay?: number
  headers?: Record<string, string>
  onRequest?: (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>
  onResponse?: (response: Response) => Response | Promise<Response>
  onError?: (error: ApiError) => void
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  timeout?: number
  retries?: number
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_OPTIONS: Required<
  Pick<FetchClientOptions, 'timeout' | 'retries' | 'retryDelay' | 'maxRetryDelay'>
> = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
  maxRetryDelay: 10000, // 10 seconds
}

// =============================================================================
// FetchClient Class
// =============================================================================

export class FetchClient {
  private baseUrl: string
  private timeout: number
  private retries: number
  private retryDelay: number
  private maxRetryDelay: number
  private defaultHeaders: Record<string, string>
  private onRequest?: FetchClientOptions['onRequest']
  private onResponse?: FetchClientOptions['onResponse']
  private onError?: FetchClientOptions['onError']

  constructor(options: FetchClientOptions = {}) {
    this.baseUrl = options.baseUrl || ''
    this.timeout = options.timeout ?? DEFAULT_OPTIONS.timeout
    this.retries = options.retries ?? DEFAULT_OPTIONS.retries
    this.retryDelay = options.retryDelay ?? DEFAULT_OPTIONS.retryDelay
    this.maxRetryDelay = options.maxRetryDelay ?? DEFAULT_OPTIONS.maxRetryDelay
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse
    this.onError = options.onError
  }

  /**
   * Make a fetch request with retry logic
   */
  async request<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
    const fullUrl = this.buildUrl(url, options.params)
    const requestOptions = await this.buildRequestInit(options)
    const maxRetries = options.retries ?? this.retries
    const timeout = options.timeout ?? this.timeout
    const method = options.method || 'GET'
    const startTime = Date.now()

    // Add breadcrumb for API call start
    addBreadcrumb(`API: ${method} ${url}`, 'api', 'info')

    let lastError: ApiError | undefined
    let attempt = 0

    while (attempt <= maxRetries) {
      try {
        const response = await this.fetchWithTimeout(fullUrl, requestOptions, timeout)

        // Handle response interceptor
        const processedResponse = this.onResponse
          ? await this.onResponse(response)
          : response

        if (!processedResponse.ok) {
          throw await createErrorFromResponse(processedResponse)
        }

        // Track successful API call
        const duration = Date.now() - startTime
        trackApiCall(url, method, processedResponse.status, duration)

        // Parse response
        const contentType = processedResponse.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          return (await processedResponse.json()) as T
        }

        // Return text for non-JSON responses
        return (await processedResponse.text()) as unknown as T
      } catch (error) {
        lastError = this.normalizeError(error)

        // Don't retry if not retryable or last attempt
        if (!isRetryableError(lastError.code) || attempt >= maxRetries) {
          break
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(
          this.retryDelay * Math.pow(2, attempt),
          this.maxRetryDelay
        )
        await this.sleep(delay)
        attempt++
      }
    }

    // Track failed API call
    const duration = Date.now() - startTime
    trackApiCall(url, method, lastError?.statusCode || 0, duration)

    // Capture exception to Sentry (only for server errors)
    if (lastError && lastError.statusCode >= 500) {
      captureException(lastError, {
        tags: { api: 'fetch' },
        extra: {
          url,
          method,
          attempt,
          duration,
          errorCode: lastError.code,
        },
      })
    }

    // Call error handler if provided
    if (lastError && this.onError) {
      this.onError(lastError)
    }

    throw lastError
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' })
  }

  /**
   * POST request
   */
  async post<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', body })
  }

  /**
   * PUT request
   */
  async put<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PUT', body })
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PATCH', body })
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' })
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private buildUrl(url: string, params?: RequestOptions['params']): string {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`

    if (!params) return fullUrl

    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    })

    const queryString = searchParams.toString()
    if (!queryString) return fullUrl

    return `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${queryString}`
  }

  private async buildRequestInit(options: RequestOptions): Promise<RequestInit> {
    const { timeout: _timeout, retries: _retries, params: _params, body, ...rest } = options

    let init: RequestInit = {
      ...rest,
      headers: {
        ...this.defaultHeaders,
        ...(options.headers as Record<string, string>),
      },
    }

    // Serialize body
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    // Apply request interceptor
    if (this.onRequest) {
      init = await this.onRequest(options.method || 'GET', init)
    }

    return init
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })
      return response
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError({
          code: API_ERROR_CODES.TIMEOUT,
          message: `Request timed out after ${timeout}ms`,
        })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private normalizeError(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error
    }

    if (error instanceof TypeError) {
      // Network error (fetch failed)
      if (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('Failed to fetch')
      ) {
        // Check if offline
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return new ApiError({
            code: API_ERROR_CODES.OFFLINE,
            cause: error,
          })
        }
        return new ApiError({
          code: API_ERROR_CODES.NETWORK_ERROR,
          cause: error,
        })
      }
    }

    return new ApiError({
      code: API_ERROR_CODES.UNKNOWN,
      message: error instanceof Error ? error.message : 'Unknown error',
      cause: error instanceof Error ? error : undefined,
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// =============================================================================
// Default Client Instance
// =============================================================================

export const apiClient = new FetchClient({
  baseUrl: '',
  onError: (error) => {
    console.error('[API Error]', error.code, error.message)
  },
})

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a fetch client with authentication
 */
export function createAuthenticatedClient(
  getToken: () => string | null | Promise<string | null>,
  options?: FetchClientOptions
): FetchClient {
  return new FetchClient({
    ...options,
    onRequest: async (url, init) => {
      const token = await getToken()
      if (token) {
        return {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${token}`,
          },
        }
      }
      return init
    },
  })
}

/**
 * Simple fetch wrapper for one-off requests
 */
export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestOptions
): Promise<T> {
  return apiClient.request<T>(url, options)
}
