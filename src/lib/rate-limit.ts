/**
 * Rate Limiting System
 * In-memory rate limiter with sliding window algorithm
 * For production scale, consider Redis-based solution
 */

import { NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetTime: number
  blocked: boolean
  blockUntil?: number
}

// Store rate limit data in memory
const rateLimitMap = new Map<string, RateLimitEntry>()

// Track blocked IPs for suspicious activity
const blockedIPs = new Set<string>()

// Clean up old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.resetTime < now && (!entry.blockUntil || entry.blockUntil < now)) {
        rateLimitMap.delete(key)
      }
    }
  }, 60000) // Clean up every minute
}

export interface RateLimitConfig {
  maxRequests: number      // Max requests per window
  windowMs: number         // Time window in milliseconds
  blockDurationMs?: number // Duration to block after limit exceeded (optional)
  skipFailedRequests?: boolean // Don't count failed requests
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  blocked: boolean
  retryAfter?: number
}

// Preset configurations for different API types
export const RATE_LIMIT_PRESETS = {
  // Strict limit for authentication endpoints
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 min block after exceeding
  },
  // Standard API endpoints
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  // AI endpoints (expensive operations)
  ai: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  },
  // Email operations
  email: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  },
  // Very strict for public endpoints
  public: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },
} as const

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const key = identifier

  // Check if IP is blocked
  if (blockedIPs.has(key)) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: now + (config.blockDurationMs || 60000),
      blocked: true,
      retryAfter: Math.ceil((config.blockDurationMs || 60000) / 1000),
    }
  }

  let entry = rateLimitMap.get(key)

  // Check if currently blocked
  if (entry?.blockUntil && entry.blockUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockUntil,
      blocked: true,
      retryAfter: Math.ceil((entry.blockUntil - now) / 1000),
    }
  }

  // If no entry or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 1,
      resetTime: now + config.windowMs,
      blocked: false,
    }
    rateLimitMap.set(key, entry)
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: entry.resetTime,
      blocked: false,
    }
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    // Apply block if configured
    if (config.blockDurationMs) {
      entry.blocked = true
      entry.blockUntil = now + config.blockDurationMs
    }
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockUntil || entry.resetTime,
      blocked: entry.blocked,
      retryAfter: Math.ceil(((entry.blockUntil || entry.resetTime) - now) / 1000),
    }
  }

  // Increment counter
  entry.count++
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    blocked: false,
  }
}

// Get client IP from request headers
export function getClientIP(request: Request): string {
  // Check various headers for real IP (proxies, CDN, etc.)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  if (cfConnectingIP) {
    return cfConnectingIP
  }

  return 'unknown'
}

// Create rate limit headers
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers()
  headers.set('X-RateLimit-Limit', result.remaining.toString())
  headers.set('X-RateLimit-Remaining', Math.max(0, result.remaining).toString())
  headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString())

  if (!result.allowed && result.retryAfter) {
    headers.set('Retry-After', result.retryAfter.toString())
  }

  return headers
}

// Rate limit response helper
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: result.blocked
        ? 'You have been temporarily blocked due to excessive requests'
        : 'Rate limit exceeded. Please try again later.',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: createRateLimitHeaders(result),
    }
  )
}

// Block an IP manually (for suspicious activity)
export function blockIP(ip: string): void {
  blockedIPs.add(ip)
}

// Unblock an IP
export function unblockIP(ip: string): void {
  blockedIPs.delete(ip)
}

// Check if IP is blocked
export function isIPBlocked(ip: string): boolean {
  return blockedIPs.has(ip)
}
