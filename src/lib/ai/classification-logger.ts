/**
 * Classification Logger Service
 * Logs AI classification results for monitoring and analytics
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Category } from '@/types'

// Types
export interface ClassificationLogInput {
  userId: string
  emailId: string
  senderEmail: string
  subject?: string
  assignedCategory: Category
  aiConfidence: number
  phishingScore?: number
  classificationSource: 'sender_reputation' | 'learned' | 'rule_based' | 'keyword' | 'gpt' | 'hybrid'
  usedSenderReputation: boolean
  senderReputationScore?: number
  processingTimeMs?: number
}

export interface ClassificationLog {
  id: string
  user_id: string
  email_id: string
  sender_email: string
  sender_domain: string
  subject: string | null
  assigned_category: string
  ai_confidence: number
  phishing_score: number
  classification_source: string
  used_sender_reputation: boolean
  sender_reputation_score: number | null
  processing_time_ms: number | null
  user_corrected_category: string | null
  is_correct: boolean | null
  feedback_at: string | null
  created_at: string
}

export interface DailyMetrics {
  metric_date: string
  total_classifications: number
  correct_classifications: number
  incorrect_classifications: number
  pending_feedback: number
  accuracy_rate: number
  reputation_hit_count: number
  reputation_hit_rate: number
  phishing_detected: number
  avg_processing_time_ms: number
  avg_confidence: number
  low_confidence_count: number
  category_stats: Record<string, { total: number; correct: number }>
  source_stats: Record<string, number>
}

// Get admin client
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Extract domain from email
 */
function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@')
  return parts.length > 1 ? parts[1] : ''
}

/**
 * Log a classification result
 */
export async function logClassification(input: ClassificationLogInput): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domain = extractDomain(input.senderEmail)

  try {
    await supabase
      .from('ai_classification_logs')
      .insert({
        user_id: input.userId,
        email_id: input.emailId,
        sender_email: input.senderEmail,
        sender_domain: domain,
        subject: input.subject || null,
        assigned_category: input.assignedCategory,
        ai_confidence: input.aiConfidence,
        phishing_score: input.phishingScore || 0,
        classification_source: input.classificationSource,
        used_sender_reputation: input.usedSenderReputation,
        sender_reputation_score: input.senderReputationScore || null,
        processing_time_ms: input.processingTimeMs || null
      })

  } catch {
    // Error logging classification
  }
}

/**
 * Record user feedback on classification
 */
export async function recordClassificationFeedback(
  emailId: string,
  userId: string,
  correctedCategory: Category | null,
  isCorrect: boolean
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    await supabase
      .from('ai_classification_logs')
      .update({
        user_corrected_category: correctedCategory,
        is_correct: isCorrect,
        feedback_at: new Date().toISOString()
      })
      .eq('email_id', emailId)
      .eq('user_id', userId)

  } catch {
    // Error recording feedback
  }
}

/**
 * Get classification logs for a user
 */
export async function getClassificationLogs(
  userId: string,
  options: {
    limit?: number
    offset?: number
    startDate?: Date
    endDate?: Date
    category?: string
    source?: string
  } = {}
): Promise<ClassificationLog[]> {
  const supabase = getSupabaseAdmin()
  const { limit = 50, offset = 0, startDate, endDate, category, source } = options

  try {
    let query = supabase
      .from('ai_classification_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }
    if (category) {
      query = query.eq('assigned_category', category)
    }
    if (source) {
      query = query.eq('classification_source', source)
    }

    const { data, error } = await query

    if (error) {
      console.error('[ClassificationLogger] Error fetching logs:', error)
      return []
    }

    return (data || []) as ClassificationLog[]
  } catch (error) {
    console.error('[ClassificationLogger] Error:', error)
    return []
  }
}

/**
 * Get daily metrics for a date range
 */
export async function getDailyMetrics(
  userId: string | null,
  startDate: Date,
  endDate: Date
): Promise<DailyMetrics[]> {
  const supabase = getSupabaseAdmin()

  try {
    let query = supabase
      .from('ai_metrics_daily')
      .select('*')
      .gte('metric_date', startDate.toISOString().split('T')[0])
      .lte('metric_date', endDate.toISOString().split('T')[0])
      .order('metric_date', { ascending: false })

    if (userId) {
      query = query.eq('user_id', userId)
    } else {
      query = query.is('user_id', null) // Global metrics
    }

    const { data, error } = await query

    if (error) {
      console.error('[ClassificationLogger] Error fetching metrics:', error)
      return []
    }

    return (data || []).map(m => ({
      ...m,
      accuracy_rate: m.total_classifications > 0
        ? (m.correct_classifications / (m.correct_classifications + m.incorrect_classifications)) * 100
        : 0
    })) as DailyMetrics[]
  } catch (error) {
    console.error('[ClassificationLogger] Error:', error)
    return []
  }
}

/**
 * Calculate real-time stats (not from aggregated table)
 */
export async function getRealtimeStats(
  userId: string,
  days: number = 7
): Promise<{
  totalClassifications: number
  accuracyRate: number
  reputationHitRate: number
  avgConfidence: number
  categoryBreakdown: Record<string, number>
  sourceBreakdown: Record<string, number>
  phishingDetected: number
}> {
  const supabase = getSupabaseAdmin()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  try {
    const { data } = await supabase
      .from('ai_classification_logs')
      .select('assigned_category, classification_source, ai_confidence, is_correct, used_sender_reputation, phishing_score')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())

    if (!data || data.length === 0) {
      return {
        totalClassifications: 0,
        accuracyRate: 0,
        reputationHitRate: 0,
        avgConfidence: 0,
        categoryBreakdown: {},
        sourceBreakdown: {},
        phishingDetected: 0
      }
    }

    const categoryBreakdown: Record<string, number> = {}
    const sourceBreakdown: Record<string, number> = {}
    let correctCount = 0
    let feedbackCount = 0
    let reputationHits = 0
    let totalConfidence = 0
    let phishingCount = 0

    for (const log of data) {
      // Category
      categoryBreakdown[log.assigned_category] = (categoryBreakdown[log.assigned_category] || 0) + 1

      // Source
      sourceBreakdown[log.classification_source] = (sourceBreakdown[log.classification_source] || 0) + 1

      // Accuracy
      if (log.is_correct !== null) {
        feedbackCount++
        if (log.is_correct) correctCount++
      }

      // Reputation
      if (log.used_sender_reputation) reputationHits++

      // Confidence
      totalConfidence += log.ai_confidence

      // Phishing
      if (log.phishing_score >= 70) phishingCount++
    }

    return {
      totalClassifications: data.length,
      accuracyRate: feedbackCount > 0 ? (correctCount / feedbackCount) * 100 : 0,
      reputationHitRate: (reputationHits / data.length) * 100,
      avgConfidence: totalConfidence / data.length,
      categoryBreakdown,
      sourceBreakdown,
      phishingDetected: phishingCount
    }
  } catch (error) {
    console.error('[ClassificationLogger] Error getting realtime stats:', error)
    return {
      totalClassifications: 0,
      accuracyRate: 0,
      reputationHitRate: 0,
      avgConfidence: 0,
      categoryBreakdown: {},
      sourceBreakdown: {},
      phishingDetected: 0
    }
  }
}

/**
 * Trigger daily metrics aggregation (call from cron)
 */
export async function aggregateDailyMetrics(date?: Date): Promise<{ success: boolean; count: number }> {
  const supabase = getSupabaseAdmin()
  const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday

  try {
    const { data, error } = await supabase.rpc('run_daily_metrics_aggregation', {
      p_date: targetDate.toISOString().split('T')[0]
    })

    if (error) {
      return { success: false, count: 0 }
    }

    return { success: true, count: data || 0 }
  } catch {
    return { success: false, count: 0 }
  }
}

/**
 * Get classification accuracy by category
 */
export async function getAccuracyByCategory(
  userId: string,
  days: number = 30
): Promise<Record<string, { total: number; correct: number; accuracy: number }>> {
  const supabase = getSupabaseAdmin()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  try {
    const { data } = await supabase
      .from('ai_classification_logs')
      .select('assigned_category, is_correct')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .not('is_correct', 'is', null)

    if (!data) return {}

    const stats: Record<string, { total: number; correct: number; accuracy: number }> = {}

    for (const log of data) {
      if (!stats[log.assigned_category]) {
        stats[log.assigned_category] = { total: 0, correct: 0, accuracy: 0 }
      }
      stats[log.assigned_category].total++
      if (log.is_correct) stats[log.assigned_category].correct++
    }

    // Calculate accuracy
    for (const cat of Object.keys(stats)) {
      stats[cat].accuracy = stats[cat].total > 0
        ? Math.round((stats[cat].correct / stats[cat].total) * 100)
        : 0
    }

    return stats
  } catch (error) {
    console.error('[ClassificationLogger] Error getting accuracy by category:', error)
    return {}
  }
}
