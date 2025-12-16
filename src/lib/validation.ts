/**
 * Input Validation & Sanitization
 * Using Zod for type-safe validation
 */

import { z } from 'zod'

// ============================================
// Common Validators
// ============================================

// Email validation with sanitization
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .max(254, 'Email too long')
  .transform((email) => email.toLowerCase().trim())

// Sanitize function for XSS prevention
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim()
}

// Safe string that prevents XSS (base schema without transform for chaining)
export const safeStringSchema = z.string().transform(sanitizeString)

// Safe string with max length helper
export function safeString(maxLength?: number) {
  const base = z.string()
  return maxLength
    ? base.max(maxLength).transform(sanitizeString)
    : base.transform(sanitizeString)
}

// UUID validation
export const uuidSchema = z.string().uuid('Invalid ID format')

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Date range
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate
    }
    return true
  },
  { message: 'Start date must be before end date' }
)

// ============================================
// API Request Schemas
// ============================================

// Access request
export const accessRequestSchema = z.object({
  email: emailSchema,
  name: z
    .string()
    .min(2, 'Name too short')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s\u00C0-\u1EF9'-]+$/, 'Invalid characters in name'),
  reason: z
    .string()
    .min(10, 'Reason too short')
    .max(500, 'Reason too long')
    .optional(),
})

// Email action
export const emailActionSchema = z.object({
  emailId: uuidSchema,
  action: z.enum(['archive', 'delete', 'star', 'unstar', 'markRead', 'markUnread', 'trash', 'restore']),
})

// Bulk email action
export const bulkEmailActionSchema = z.object({
  emailIds: z.array(uuidSchema).min(1, 'At least one email required').max(100, 'Too many emails'),
  action: z.enum(['archive', 'delete', 'markRead', 'markUnread', 'trash']),
})

// AI feedback
export const aiFeedbackSchema = z.object({
  emailId: uuidSchema,
  feedbackType: z.enum(['helpful', 'not_helpful', 'wrong', 'offensive']),
  comment: safeString(1000).optional(),
})

// Smart reply
export const smartReplySchema = z.object({
  emailId: uuidSchema,
  tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
  context: safeString(2000).optional(),
})

// Search query
export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query required').max(200, 'Query too long').transform(sanitizeString),
  folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'archive', 'all']).optional(),
  from: emailSchema.optional(),
  to: emailSchema.optional(),
  hasAttachment: z.coerce.boolean().optional(),
  isStarred: z.coerce.boolean().optional(),
  ...paginationSchema.shape,
})

// Follow-up creation
export const followUpSchema = z.object({
  emailId: uuidSchema,
  dueDate: z.coerce.date().refine(
    (date) => date > new Date(),
    'Due date must be in the future'
  ),
  note: safeString(500).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})

// Admin whitelist
export const whitelistSchema = z.object({
  email: emailSchema,
  isActive: z.boolean().default(true),
})

// Settings update
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'vi']).optional(),
  emailsPerPage: z.number().int().min(10).max(100).optional(),
  notificationsEnabled: z.boolean().optional(),
  aiSuggestionsEnabled: z.boolean().optional(),
})

// ============================================
// Validation Helpers
// ============================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodError }

/**
 * Validate data against a schema
 */
export function validate<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}

/**
 * Format Zod errors for API response
 */
export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root'
    if (!formatted[path]) {
      formatted[path] = []
    }
    formatted[path].push(issue.message)
  }

  return formatted
}

/**
 * Sanitize HTML content (basic - for more robust sanitization use DOMPurify)
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * Validate and parse JSON body from request
 */
export async function parseAndValidate<T extends z.ZodSchema>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: string; details?: Record<string, string[]> }> {
  try {
    const body = await request.json()
    const result = validate(schema, body)

    if (!result.success) {
      return {
        error: 'Validation failed',
        details: formatValidationErrors(result.errors),
      }
    }

    return { data: result.data }
  } catch {
    return { error: 'Invalid JSON body' }
  }
}

// Export all schemas for type inference
export const schemas = {
  email: emailSchema,
  safeString: safeStringSchema,
  uuid: uuidSchema,
  pagination: paginationSchema,
  dateRange: dateRangeSchema,
  accessRequest: accessRequestSchema,
  emailAction: emailActionSchema,
  bulkEmailAction: bulkEmailActionSchema,
  aiFeedback: aiFeedbackSchema,
  smartReply: smartReplySchema,
  searchQuery: searchQuerySchema,
  followUp: followUpSchema,
  whitelist: whitelistSchema,
  settings: settingsSchema,
}

// Export types
export type AccessRequest = z.infer<typeof accessRequestSchema>
export type EmailAction = z.infer<typeof emailActionSchema>
export type BulkEmailAction = z.infer<typeof bulkEmailActionSchema>
export type AIFeedback = z.infer<typeof aiFeedbackSchema>
export type SmartReply = z.infer<typeof smartReplySchema>
export type SearchQuery = z.infer<typeof searchQuerySchema>
export type FollowUp = z.infer<typeof followUpSchema>
export type Whitelist = z.infer<typeof whitelistSchema>
export type Settings = z.infer<typeof settingsSchema>
