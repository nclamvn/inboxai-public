import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Category } from '@/types'

let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseInstance
}

interface FeedbackEntry {
  id: string
  email_id: string
  user_id: string
  from_address: string
  from_domain: string
  subject_keywords: string[]
  original_category: Category
  corrected_category: Category
  created_at: string
}

/**
 * Record user correction for classification
 */
export async function recordFeedback(
  userId: string,
  emailId: string,
  fromAddress: string,
  subject: string,
  originalCategory: Category,
  correctedCategory: Category
): Promise<void> {
  const domain = fromAddress.split('@')[1]?.toLowerCase() || ''
  const keywords = extractKeywords(subject)

  await getSupabase().from('classification_feedback').insert({
    user_id: userId,
    email_id: emailId,
    from_address: fromAddress.toLowerCase(),
    from_domain: domain,
    subject_keywords: keywords,
    original_category: originalCategory,
    corrected_category: correctedCategory,
  })
}

/**
 * Extract significant keywords from subject
 */
function extractKeywords(subject: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall',
    'for', 'and', 'nor', 'but', 'or', 'yet', 'so',
    'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about',
    'của', 'và', 'hoặc', 'trong', 'với', 'cho', 'từ',
    'là', 'được', 'có', 'này', 'đó', 'các', 'những',
    're', 'fw', 'fwd',
  ])

  return subject
    .toLowerCase()
    .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10)
}

/**
 * Get learned rules from user's feedback history
 */
export async function getLearnedRules(userId: string): Promise<{
  domainRules: Map<string, Category>
  senderRules: Map<string, Category>
}> {
  const { data: feedback, error } = await getSupabase()
    .from('classification_feedback')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !feedback || feedback.length < 3) {
    return {
      domainRules: new Map(),
      senderRules: new Map(),
    }
  }

  const domainRules = new Map<string, Category>()
  const senderRules = new Map<string, Category>()

  // Group by domain
  const domainFeedback = new Map<string, FeedbackEntry[]>()
  const senderFeedback = new Map<string, FeedbackEntry[]>()

  for (const fb of feedback as FeedbackEntry[]) {
    // Group by domain
    const domainEntries = domainFeedback.get(fb.from_domain) || []
    domainEntries.push(fb)
    domainFeedback.set(fb.from_domain, domainEntries)

    // Group by sender
    const senderEntries = senderFeedback.get(fb.from_address) || []
    senderEntries.push(fb)
    senderFeedback.set(fb.from_address, senderEntries)
  }

  // Analyze domain patterns - if same domain consistently corrected to same category
  for (const [domain, entries] of domainFeedback) {
    if (entries.length < 2) continue

    const categoryCount = new Map<Category, number>()
    for (const entry of entries) {
      categoryCount.set(
        entry.corrected_category,
        (categoryCount.get(entry.corrected_category) || 0) + 1
      )
    }

    // If 2+ corrections to same category, create rule
    for (const [category, count] of categoryCount) {
      if (count >= 2 && count / entries.length >= 0.7) {
        domainRules.set(domain, category)
      }
    }
  }

  // Analyze sender patterns - stronger signal than domain
  for (const [sender, entries] of senderFeedback) {
    if (entries.length < 2) continue

    const categoryCount = new Map<Category, number>()
    for (const entry of entries) {
      categoryCount.set(
        entry.corrected_category,
        (categoryCount.get(entry.corrected_category) || 0) + 1
      )
    }

    // If 2+ corrections to same category from same sender
    for (const [category, count] of categoryCount) {
      if (count >= 2 && count / entries.length >= 0.7) {
        senderRules.set(sender, category)
      }
    }
  }

  return { domainRules, senderRules }
}

/**
 * Apply learned rules to email classification
 */
export async function applyLearnedRules(
  email: { from_address: string; subject?: string },
  userId: string
): Promise<{
  category: Category | null
  confidence: number
  source: 'sender_rule' | 'domain_rule' | null
}> {
  const rules = await getLearnedRules(userId)

  const senderEmail = email.from_address.toLowerCase()
  const domain = senderEmail.split('@')[1] || ''

  // Check sender rule first (stronger signal)
  if (rules.senderRules.has(senderEmail)) {
    return {
      category: rules.senderRules.get(senderEmail)!,
      confidence: 0.9,
      source: 'sender_rule',
    }
  }

  // Check domain rule
  if (rules.domainRules.has(domain)) {
    return {
      category: rules.domainRules.get(domain)!,
      confidence: 0.8,
      source: 'domain_rule',
    }
  }

  return {
    category: null,
    confidence: 0,
    source: null,
  }
}

/**
 * Get classification accuracy stats for user
 */
export async function getAccuracyStats(userId: string): Promise<{
  totalFeedback: number
  categoryAccuracy: Map<Category, { correct: number; total: number }>
}> {
  const { data: feedback, error } = await getSupabase()
    .from('classification_feedback')
    .select('original_category, corrected_category')
    .eq('user_id', userId)

  if (error || !feedback) {
    return {
      totalFeedback: 0,
      categoryAccuracy: new Map(),
    }
  }

  const categoryStats = new Map<Category, { correct: number; total: number }>()

  for (const fb of feedback) {
    const stats = categoryStats.get(fb.original_category) || { correct: 0, total: 0 }
    stats.total++
    if (fb.original_category === fb.corrected_category) {
      stats.correct++
    }
    categoryStats.set(fb.original_category, stats)
  }

  return {
    totalFeedback: feedback.length,
    categoryAccuracy: categoryStats,
  }
}

/**
 * Export learning data for analysis
 */
export async function exportLearningData(userId: string): Promise<{
  feedback: FeedbackEntry[]
  rules: {
    domainRules: Record<string, Category>
    senderRules: Record<string, Category>
  }
}> {
  const { data: feedback } = await getSupabase()
    .from('classification_feedback')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const rules = await getLearnedRules(userId)

  return {
    feedback: (feedback || []) as FeedbackEntry[],
    rules: {
      domainRules: Object.fromEntries(rules.domainRules),
      senderRules: Object.fromEntries(rules.senderRules),
    },
  }
}
