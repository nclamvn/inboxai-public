/**
 * Domain Reputation Service
 * Tracks user behavior to calculate domain trustworthiness
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'

// Types
export interface DomainReputation {
  id: string
  user_id: string
  domain: string
  reputation_score: number
  trust_level: 'untrusted' | 'low' | 'neutral' | 'trusted' | 'verified'
  total_emails: number
  opened_count: number
  replied_count: number
  archived_count: number
  deleted_count: number
  spam_reported_count: number
  phishing_reported_count: number
  open_rate: number
  reply_rate: number
  delete_rate: number
  category_distribution: Record<string, number>
  primary_category: string | null
  is_whitelisted: boolean
  is_blacklisted: boolean
  is_legitimate: boolean
  first_seen_at: string
  last_seen_at: string
}

export interface DomainLookupResult {
  found: boolean
  reputation: DomainReputation | null
  trustLevel: string
  score: number
  isLegitimate: boolean
  suggestedCategory: string | null
}

export type ActionType = 'open' | 'reply' | 'archive' | 'delete' | 'spam' | 'phishing_report' | 'mark_safe'

// Get admin client
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@')
  return parts.length > 1 ? parts[1] : ''
}

/**
 * Get trust level from score
 */
export function getTrustLevel(score: number): 'untrusted' | 'low' | 'neutral' | 'trusted' | 'verified' {
  if (score >= 90) return 'verified'
  if (score >= 70) return 'trusted'
  if (score >= 40) return 'neutral'
  if (score >= 20) return 'low'
  return 'untrusted'
}

/**
 * Log user action on email (triggers domain reputation update via DB trigger)
 */
export async function logEmailAction(
  userId: string,
  emailId: string,
  senderEmail: string,
  actionType: ActionType
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domain = extractDomain(senderEmail)

  if (!domain) {
    return
  }

  try {
    await supabase
      .from('email_action_logs')
      .insert({
        user_id: userId,
        email_id: emailId,
        sender_domain: domain,
        action_type: actionType
      })
  } catch {
    // Error logging action
  }
}

/**
 * Get domain reputation for a specific domain
 */
export async function getDomainReputation(
  userId: string,
  domain: string
): Promise<DomainLookupResult> {
  const supabase = getSupabaseAdmin()
  const domainLower = domain.toLowerCase()

  try {
    // Check user-specific reputation
    const { data: userRep } = await supabase
      .from('domain_reputation')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domainLower)
      .single()

    if (userRep) {
      return {
        found: true,
        reputation: userRep as DomainReputation,
        trustLevel: userRep.trust_level,
        score: userRep.reputation_score,
        isLegitimate: userRep.is_legitimate || userRep.is_whitelisted,
        suggestedCategory: userRep.primary_category
      }
    }

    // Check if domain is in legitimate_domains table
    const { data: legitDomain } = await supabase
      .from('legitimate_domains')
      .select('domain, category')
      .eq('domain', domainLower)
      .eq('is_verified', true)
      .single()

    if (legitDomain) {
      return {
        found: false,
        reputation: null,
        trustLevel: 'verified',
        score: 95,
        isLegitimate: true,
        suggestedCategory: legitDomain.category === 'bank' ? 'transaction' : null
      }
    }

    // Not found
    return {
      found: false,
      reputation: null,
      trustLevel: 'neutral',
      score: 50,
      isLegitimate: false,
      suggestedCategory: null
    }
  } catch (error) {
    console.error('[DomainReputation] Error getting reputation:', error)
    return {
      found: false,
      reputation: null,
      trustLevel: 'neutral',
      score: 50,
      isLegitimate: false,
      suggestedCategory: null
    }
  }
}

/**
 * Get top domains by reputation for a user
 */
export async function getTopDomains(
  userId: string,
  limit: number = 20
): Promise<DomainReputation[]> {
  const supabase = getSupabaseAdmin()

  try {
    const { data, error } = await supabase
      .from('domain_reputation')
      .select('*')
      .eq('user_id', userId)
      .order('total_emails', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[DomainReputation] Error getting top domains:', error)
      return []
    }

    return (data || []) as DomainReputation[]
  } catch (error) {
    console.error('[DomainReputation] Error:', error)
    return []
  }
}

/**
 * Get domain statistics for a user
 */
export async function getDomainStats(userId: string): Promise<{
  totalDomains: number
  trustedDomains: number
  untrustedDomains: number
  topCategories: Record<string, number>
}> {
  const supabase = getSupabaseAdmin()

  try {
    const { data } = await supabase
      .from('domain_reputation')
      .select('trust_level, primary_category')
      .eq('user_id', userId)

    if (!data) {
      return {
        totalDomains: 0,
        trustedDomains: 0,
        untrustedDomains: 0,
        topCategories: {}
      }
    }

    const topCategories: Record<string, number> = {}
    let trusted = 0
    let untrusted = 0

    for (const rep of data) {
      // Count trust levels
      if (rep.trust_level === 'trusted' || rep.trust_level === 'verified') {
        trusted++
      } else if (rep.trust_level === 'untrusted' || rep.trust_level === 'low') {
        untrusted++
      }

      // Count categories
      if (rep.primary_category) {
        topCategories[rep.primary_category] = (topCategories[rep.primary_category] || 0) + 1
      }
    }

    return {
      totalDomains: data.length,
      trustedDomains: trusted,
      untrustedDomains: untrusted,
      topCategories
    }
  } catch (error) {
    console.error('[DomainReputation] Error getting stats:', error)
    return {
      totalDomains: 0,
      trustedDomains: 0,
      untrustedDomains: 0,
      topCategories: {}
    }
  }
}

/**
 * Whitelist a domain for a user
 */
export async function whitelistDomain(
  userId: string,
  domain: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domainLower = domain.toLowerCase()

  try {
    await supabase
      .from('domain_reputation')
      .upsert({
        user_id: userId,
        domain: domainLower,
        is_whitelisted: true,
        is_blacklisted: false,
        reputation_score: 90,
        trust_level: 'trusted'
      }, {
        onConflict: 'user_id,domain'
      })
  } catch {
    // Error whitelisting
  }
}

/**
 * Blacklist a domain for a user
 */
export async function blacklistDomain(
  userId: string,
  domain: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domainLower = domain.toLowerCase()

  try {
    await supabase
      .from('domain_reputation')
      .upsert({
        user_id: userId,
        domain: domainLower,
        is_whitelisted: false,
        is_blacklisted: true,
        reputation_score: 0,
        trust_level: 'untrusted'
      }, {
        onConflict: 'user_id,domain'
      })
  } catch {
    // Error blacklisting
  }
}

/**
 * Update domain's primary category based on email classification
 */
export async function updateDomainCategory(
  userId: string,
  domain: string,
  category: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domainLower = domain.toLowerCase()

  try {
    // Get current category distribution
    const { data: current } = await supabase
      .from('domain_reputation')
      .select('category_distribution, total_emails')
      .eq('user_id', userId)
      .eq('domain', domainLower)
      .single()

    const distribution = (current?.category_distribution || {}) as Record<string, number>
    distribution[category] = (distribution[category] || 0) + 1

    // Find primary category
    let maxCount = 0
    let primaryCategory = category
    for (const [cat, count] of Object.entries(distribution)) {
      if (count > maxCount) {
        maxCount = count
        primaryCategory = cat
      }
    }

    // Update
    await supabase
      .from('domain_reputation')
      .upsert({
        user_id: userId,
        domain: domainLower,
        category_distribution: distribution,
        primary_category: primaryCategory,
        total_emails: (current?.total_emails || 0) + 1,
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,domain'
      })
  } catch (error) {
    console.error('[DomainReputation] Error updating category:', error)
  }
}

/**
 * Recalculate rates for a domain
 */
export async function recalculateDomainRates(
  userId: string,
  domain: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const domainLower = domain.toLowerCase()

  try {
    const { data } = await supabase
      .from('domain_reputation')
      .select('total_emails, opened_count, replied_count, deleted_count')
      .eq('user_id', userId)
      .eq('domain', domainLower)
      .single()

    if (!data || data.total_emails === 0) return

    const openRate = data.opened_count / data.total_emails
    const replyRate = data.replied_count / data.total_emails
    const deleteRate = data.deleted_count / data.total_emails

    await supabase
      .from('domain_reputation')
      .update({
        open_rate: openRate,
        reply_rate: replyRate,
        delete_rate: deleteRate
      })
      .eq('user_id', userId)
      .eq('domain', domainLower)
  } catch (error) {
    console.error('[DomainReputation] Error recalculating rates:', error)
  }
}

/**
 * Bulk update domain reputation from existing emails
 * Useful for initial setup or rebuilding reputation data
 */
export async function rebuildDomainReputation(userId: string): Promise<{
  processed: number
  domains: number
}> {
  const supabase = getSupabaseAdmin()

  try {
    // Get all emails with their actions
    const { data: emails } = await supabase
      .from('emails')
      .select('id, from_address, category, is_read, is_archived, is_deleted')
      .eq('user_id', userId)
      .limit(1000)

    if (!emails) return { processed: 0, domains: 0 }

    const domainData: Record<string, {
      total: number
      opened: number
      archived: number
      deleted: number
      categories: Record<string, number>
    }> = {}

    // Aggregate by domain
    for (const email of emails) {
      const domain = extractDomain(email.from_address)
      if (!domain) continue

      if (!domainData[domain]) {
        domainData[domain] = {
          total: 0,
          opened: 0,
          archived: 0,
          deleted: 0,
          categories: {}
        }
      }

      domainData[domain].total++
      if (email.is_read) domainData[domain].opened++
      if (email.is_archived) domainData[domain].archived++
      if (email.is_deleted) domainData[domain].deleted++
      if (email.category) {
        domainData[domain].categories[email.category] =
          (domainData[domain].categories[email.category] || 0) + 1
      }
    }

    // Update domain reputation
    for (const [domain, data] of Object.entries(domainData)) {
      // Calculate score based on behavior
      let score = 50 // Start neutral
      score += Math.min(20, data.opened * 2) // Max +20 for opens
      score -= Math.min(20, data.deleted * 2) // Max -20 for deletes
      score = Math.max(0, Math.min(100, score))

      // Find primary category
      let primaryCategory: string | null = null
      let maxCount = 0
      for (const [cat, count] of Object.entries(data.categories)) {
        if (count > maxCount) {
          maxCount = count
          primaryCategory = cat
        }
      }

      await supabase
        .from('domain_reputation')
        .upsert({
          user_id: userId,
          domain,
          reputation_score: score,
          trust_level: getTrustLevel(score),
          total_emails: data.total,
          opened_count: data.opened,
          archived_count: data.archived,
          deleted_count: data.deleted,
          category_distribution: data.categories,
          primary_category: primaryCategory,
          open_rate: data.total > 0 ? data.opened / data.total : 0,
          delete_rate: data.total > 0 ? data.deleted / data.total : 0
        }, {
          onConflict: 'user_id,domain'
        })
    }

    return {
      processed: emails.length,
      domains: Object.keys(domainData).length
    }
  } catch (error) {
    console.error('[DomainReputation] Error rebuilding:', error)
    return { processed: 0, domains: 0 }
  }
}
