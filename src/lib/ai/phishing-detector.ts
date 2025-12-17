/**
 * Phishing Detection Service
 * Multi-layer detection: Domain Check → Content Analysis → AI Analysis
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'

// Types
export interface PhishingResult {
  score: number // 0-100
  risk: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  reasons: PhishingReason[]
  isPhishing: boolean // score >= 70
  requiresReview: boolean // score >= 50
}

export interface PhishingReason {
  type: string
  pattern: string
  severity: number
  description: string
}

export interface EmailInput {
  from_address: string
  from_name?: string
  subject?: string
  body_text?: string
  body_html?: string
}

// Cache for patterns and domains
let patternsCache: Map<string, PatternData[]> | null = null
let blacklistCache: Set<string> | null = null
let whitelistCache: Set<string> | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface PatternData {
  pattern_value: string
  severity: number
  description: string
  description_vi: string
}

// Suspicious TLDs
const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'link', 'work', 'gq', 'ml', 'cf', 'ga', 'tk',
  'buzz', 'fit', 'icu', 'monster', 'surf', 'rest', 'beauty', 'hair'
])

// Get admin client
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Load patterns and domains from database (with caching)
 */
async function loadPatternsAndDomains(): Promise<void> {
  const now = Date.now()
  if (patternsCache && blacklistCache && whitelistCache && (now - cacheTimestamp) < CACHE_TTL) {
    return // Use cache
  }

  const supabase = getSupabaseAdmin()

  // Load patterns
  const { data: patterns } = await supabase
    .from('phishing_patterns')
    .select('pattern_type, pattern_value, severity, description, description_vi')
    .eq('is_active', true)

  patternsCache = new Map()
  if (patterns) {
    for (const p of patterns) {
      const type = p.pattern_type
      if (!patternsCache.has(type)) {
        patternsCache.set(type, [])
      }
      patternsCache.get(type)!.push({
        pattern_value: p.pattern_value.toLowerCase(),
        severity: p.severity,
        description: p.description,
        description_vi: p.description_vi
      })
    }
  }

  // Load blacklist domains
  const { data: blacklist } = await supabase
    .from('phishing_domains')
    .select('domain')
    .eq('is_blacklisted', true)

  blacklistCache = new Set()
  if (blacklist) {
    for (const d of blacklist) {
      blacklistCache.add(d.domain.toLowerCase())
    }
  }

  // Load whitelist domains
  const { data: whitelist } = await supabase
    .from('legitimate_domains')
    .select('domain')
    .eq('is_verified', true)

  whitelistCache = new Set()
  if (whitelist) {
    for (const d of whitelist) {
      whitelistCache.add(d.domain.toLowerCase())
    }
  }

  cacheTimestamp = now
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@')
  return parts.length > 1 ? parts[1] : ''
}

/**
 * Get TLD from domain
 */
function getTLD(domain: string): string {
  const parts = domain.split('.')
  return parts.length > 0 ? parts[parts.length - 1] : ''
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Check if domain looks like a spoofed version of a legitimate domain
 */
function checkSpoofedDomain(domain: string, whitelist: Set<string>): { isSpoofed: boolean; spoofedFrom: string | null } {
  const domainLower = domain.toLowerCase()

  // Common character substitutions in typosquatting
  const substitutions: Record<string, string[]> = {
    'o': ['0'],
    '0': ['o'],
    'l': ['1', 'i'],
    '1': ['l', 'i'],
    'i': ['1', 'l'],
    'e': ['3'],
    '3': ['e'],
    'a': ['4', '@'],
    '4': ['a'],
    's': ['5', '$'],
    '5': ['s'],
  }

  for (const legitDomain of whitelist) {
    // Skip if same domain
    if (domainLower === legitDomain) continue

    // Check Levenshtein distance (typosquatting)
    const distance = levenshteinDistance(domainLower, legitDomain)
    if (distance <= 2 && distance > 0) {
      return { isSpoofed: true, spoofedFrom: legitDomain }
    }

    // Check if domain contains legit domain name with additions
    const legitName = legitDomain.split('.')[0]
    if (domainLower.includes(legitName) && domainLower !== legitDomain) {
      // e.g., vietcombank-verify.com contains vietcombank
      return { isSpoofed: true, spoofedFrom: legitDomain }
    }

    // Check common character substitutions
    let normalized = domainLower
    for (const [char, subs] of Object.entries(substitutions)) {
      for (const sub of subs) {
        normalized = normalized.replace(new RegExp(sub, 'g'), char)
      }
    }
    if (normalized === legitDomain) {
      return { isSpoofed: true, spoofedFrom: legitDomain }
    }
  }

  return { isSpoofed: false, spoofedFrom: null }
}

/**
 * Extract URLs from text/HTML
 */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi
  return text.match(urlRegex) || []
}

/**
 * Check if URL is suspicious
 */
function checkSuspiciousUrl(url: string): { isSuspicious: boolean; reason: string | null } {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    const tld = getTLD(hostname)

    // Check suspicious TLD
    if (SUSPICIOUS_TLDS.has(tld)) {
      return { isSuspicious: true, reason: `Suspicious TLD: .${tld}` }
    }

    // Check URL shorteners
    const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'buff.ly', 'ow.ly', 'short.link']
    if (shorteners.some(s => hostname.includes(s))) {
      return { isSuspicious: true, reason: 'URL shortener detected' }
    }

    // Check IP address in URL
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return { isSuspicious: true, reason: 'IP address in URL' }
    }

    // Check for login/verify/secure keywords in suspicious domains
    const suspiciousKeywords = ['login', 'verify', 'secure', 'account', 'update', 'confirm', 'banking']
    const hasKeyword = suspiciousKeywords.some(k => hostname.includes(k) || urlObj.pathname.includes(k))

    if (hasKeyword && !whitelistCache?.has(hostname)) {
      // Check if it's a spoofed domain
      const spoofCheck = checkSpoofedDomain(hostname, whitelistCache || new Set())
      if (spoofCheck.isSpoofed) {
        return { isSuspicious: true, reason: `Spoofed domain mimicking ${spoofCheck.spoofedFrom}` }
      }
    }

  } catch {
    // Invalid URL
    return { isSuspicious: true, reason: 'Malformed URL' }
  }

  return { isSuspicious: false, reason: null }
}

/**
 * LAYER 1: Domain Analysis
 */
function analyzeDomain(email: EmailInput): PhishingReason[] {
  const reasons: PhishingReason[] = []
  const domain = extractDomain(email.from_address)

  if (!domain) return reasons

  // Check blacklist
  if (blacklistCache?.has(domain)) {
    reasons.push({
      type: 'blacklist',
      pattern: domain,
      severity: 50,
      description: 'Known phishing domain'
    })
  }

  // Check if sender is from whitelist (reduces suspicion)
  if (whitelistCache?.has(domain)) {
    return [] // Trusted domain, skip other checks
  }

  // Check suspicious TLD
  const tld = getTLD(domain)
  if (SUSPICIOUS_TLDS.has(tld)) {
    reasons.push({
      type: 'suspicious_tld',
      pattern: `.${tld}`,
      severity: 20,
      description: `Suspicious TLD commonly used in phishing`
    })
  }

  // Check spoofed domain
  const spoofCheck = checkSpoofedDomain(domain, whitelistCache || new Set())
  if (spoofCheck.isSpoofed) {
    reasons.push({
      type: 'spoofed_domain',
      pattern: domain,
      severity: 45,
      description: `Domain mimics legitimate ${spoofCheck.spoofedFrom}`
    })
  }

  // Check mismatch between from_name and domain
  if (email.from_name) {
    const nameLower = email.from_name.toLowerCase()
    // Check if name claims to be a bank but domain doesn't match
    const bankNames = ['vietcombank', 'techcombank', 'bidv', 'mbbank', 'vpbank', 'acb', 'sacombank']
    for (const bank of bankNames) {
      if (nameLower.includes(bank) && !domain.includes(bank)) {
        reasons.push({
          type: 'name_domain_mismatch',
          pattern: `Name: ${email.from_name}, Domain: ${domain}`,
          severity: 35,
          description: `Sender name claims to be ${bank} but domain doesn't match`
        })
        break
      }
    }
  }

  return reasons
}

/**
 * LAYER 2: Content Analysis
 */
function analyzeContent(email: EmailInput): PhishingReason[] {
  const reasons: PhishingReason[] = []
  const content = `${email.subject || ''} ${email.body_text || ''}`.toLowerCase()

  if (!patternsCache) return reasons

  // Check all pattern types
  for (const [patternType, patterns] of patternsCache.entries()) {
    for (const p of patterns) {
      if (content.includes(p.pattern_value)) {
        reasons.push({
          type: patternType,
          pattern: p.pattern_value,
          severity: p.severity,
          description: p.description_vi || p.description
        })
      }
    }
  }

  // Check URLs in body
  const bodyContent = `${email.body_text || ''} ${email.body_html || ''}`
  const urls = extractUrls(bodyContent)

  for (const url of urls) {
    const urlCheck = checkSuspiciousUrl(url)
    if (urlCheck.isSuspicious) {
      reasons.push({
        type: 'suspicious_url',
        pattern: url.slice(0, 100), // Truncate long URLs
        severity: 25,
        description: urlCheck.reason || 'Suspicious URL detected'
      })
    }
  }

  // Check for multiple urgency + threat + request patterns (combo attack)
  const hasUrgency = reasons.some(r => r.type === 'urgency')
  const hasThreat = reasons.some(r => r.type === 'threat')
  const hasRequest = reasons.some(r => r.type === 'request')

  if (hasUrgency && hasThreat && hasRequest) {
    reasons.push({
      type: 'combo_attack',
      pattern: 'urgency + threat + request',
      severity: 20,
      description: 'Phishing combo: urgency + threat + sensitive request'
    })
  }

  return reasons
}

/**
 * Calculate risk level from score
 */
function getRiskLevel(score: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  if (score >= 20) return 'low'
  return 'safe'
}

/**
 * Main phishing detection function
 */
export async function detectPhishing(email: EmailInput): Promise<PhishingResult> {
  // Load patterns and domains
  await loadPatternsAndDomains()

  const allReasons: PhishingReason[] = []

  // LAYER 1: Domain Analysis (fast)
  const domainReasons = analyzeDomain(email)
  allReasons.push(...domainReasons)

  // Check if sender is from whitelist - if yes, significantly reduce score
  const domain = extractDomain(email.from_address)
  const isWhitelisted = whitelistCache?.has(domain) || false

  // LAYER 2: Content Analysis (pattern matching)
  const contentReasons = analyzeContent(email)
  allReasons.push(...contentReasons)

  // Calculate score
  let totalScore = allReasons.reduce((sum, r) => sum + r.severity, 0)

  // Cap at 100
  totalScore = Math.min(totalScore, 100)

  // If whitelisted domain, cap score at 30 (legitimate banks can have urgency keywords)
  if (isWhitelisted && totalScore > 30) {
    totalScore = 30
  }

  // Deduplicate reasons by pattern
  const uniqueReasons = allReasons.filter((r, i, arr) =>
    arr.findIndex(x => x.type === r.type && x.pattern === r.pattern) === i
  )

  // Sort by severity descending
  uniqueReasons.sort((a, b) => b.severity - a.severity)

  const risk = getRiskLevel(totalScore)

  return {
    score: totalScore,
    risk,
    reasons: uniqueReasons.slice(0, 10), // Max 10 reasons
    isPhishing: totalScore >= 70,
    requiresReview: totalScore >= 50
  }
}

/**
 * Update email with phishing detection results
 */
export async function updateEmailPhishingStatus(
  emailId: string,
  result: PhishingResult
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    await supabase
      .from('emails')
      .update({
        phishing_score: result.score,
        phishing_risk: result.risk,
        phishing_reasons: result.reasons
      })
      .eq('id', emailId)

  } catch {
    // Error updating email phishing status
  }
}

/**
 * Batch detect phishing for multiple emails
 */
export async function detectPhishingBatch(
  emails: Array<{ id: string } & EmailInput>
): Promise<Map<string, PhishingResult>> {
  const results = new Map<string, PhishingResult>()

  // Load patterns once
  await loadPatternsAndDomains()

  for (const email of emails) {
    const result = await detectPhishing(email)
    results.set(email.id, result)
  }

  return results
}

/**
 * Mark email as reviewed by user
 */
export async function markPhishingReviewed(emailId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  await supabase
    .from('emails')
    .update({ is_phishing_reviewed: true })
    .eq('id', emailId)
}

/**
 * Get phishing statistics for a user
 */
export async function getPhishingStats(userId: string): Promise<{
  total: number
  byRisk: Record<string, number>
  unreviewedCount: number
}> {
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('emails')
    .select('phishing_risk, is_phishing_reviewed')
    .eq('user_id', userId)
    .neq('phishing_risk', 'safe')

  const byRisk: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  }

  let unreviewedCount = 0

  if (data) {
    for (const email of data) {
      if (email.phishing_risk && byRisk[email.phishing_risk] !== undefined) {
        byRisk[email.phishing_risk]++
      }
      if (!email.is_phishing_reviewed) {
        unreviewedCount++
      }
    }
  }

  return {
    total: data?.length || 0,
    byRisk,
    unreviewedCount
  }
}
