import { SupabaseClient } from '@supabase/supabase-js'

interface UnsubscribedSender {
  id: string
  email_address: string | null
  domain: string | null
  sender_name: string | null
  unsubscribed_at: string
  reason: string
}

export class UnsubscribeService {
  private cache: Map<string, Set<string>> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor(private supabase: SupabaseClient) {}

  // Load unsubscribed list for user
  async loadUnsubscribedList(userId: string): Promise<{
    emails: Set<string>
    domains: Set<string>
  }> {
    // Check cache
    const cacheKey = `unsubscribed_${userId}`
    const cached = this.cache.get(cacheKey)
    const expiry = this.cacheExpiry.get(cacheKey)

    if (cached && expiry && Date.now() < expiry) {
      return this.parseCache(cached)
    }

    // Fetch from DB
    const { data } = await this.supabase
      .from('unsubscribed_senders')
      .select('email_address, domain')
      .eq('user_id', userId)

    const emails = new Set<string>()
    const domains = new Set<string>()

    for (const item of data || []) {
      if (item.email_address) {
        emails.add(item.email_address.toLowerCase())
      }
      if (item.domain) {
        domains.add(item.domain.toLowerCase())
      }
    }

    // Update cache
    const combined = new Set([...emails, ...Array.from(domains).map(d => `@${d}`)])
    this.cache.set(cacheKey, combined)
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL)

    return { emails, domains }
  }

  private parseCache(cached: Set<string>): { emails: Set<string>; domains: Set<string> } {
    const emails = new Set<string>()
    const domains = new Set<string>()

    for (const item of cached) {
      if (item.startsWith('@')) {
        domains.add(item.slice(1))
      } else {
        emails.add(item)
      }
    }

    return { emails, domains }
  }

  // Check if sender is unsubscribed
  async isUnsubscribed(userId: string, fromAddress: string): Promise<boolean> {
    const { emails, domains } = await this.loadUnsubscribedList(userId)

    const normalizedEmail = fromAddress.toLowerCase()

    // Check exact email match
    if (emails.has(normalizedEmail)) {
      return true
    }

    // Check domain match
    const domain = normalizedEmail.split('@')[1]
    if (domain && domains.has(domain)) {
      return true
    }

    return false
  }

  // Add to unsubscribe list
  async unsubscribe(
    userId: string,
    emailAddress: string,
    senderName?: string,
    unsubscribeDomain: boolean = false
  ): Promise<void> {
    const domain = emailAddress.split('@')[1]

    if (unsubscribeDomain && domain) {
      // Unsubscribe entire domain
      await this.supabase
        .from('unsubscribed_senders')
        .upsert({
          user_id: userId,
          domain: domain.toLowerCase(),
          email_address: null,
          sender_name: senderName || null,
          reason: 'manual'
        }, {
          onConflict: 'user_id,domain'
        })
    } else {
      // Unsubscribe specific email
      await this.supabase
        .from('unsubscribed_senders')
        .upsert({
          user_id: userId,
          email_address: emailAddress.toLowerCase(),
          domain: null,
          sender_name: senderName || null,
          reason: 'manual'
        }, {
          onConflict: 'user_id,email_address'
        })
    }

    // Clear cache
    this.cache.delete(`unsubscribed_${userId}`)
  }

  // Remove from unsubscribe list
  async resubscribe(userId: string, emailOrDomain: string): Promise<void> {
    // Try to delete by email
    await this.supabase
      .from('unsubscribed_senders')
      .delete()
      .eq('user_id', userId)
      .eq('email_address', emailOrDomain.toLowerCase())

    // Try to delete by domain
    await this.supabase
      .from('unsubscribed_senders')
      .delete()
      .eq('user_id', userId)
      .eq('domain', emailOrDomain.toLowerCase())

    // Clear cache
    this.cache.delete(`unsubscribed_${userId}`)
  }

  // Get unsubscribed list for display
  async getUnsubscribedList(userId: string): Promise<UnsubscribedSender[]> {
    const { data } = await this.supabase
      .from('unsubscribed_senders')
      .select('*')
      .eq('user_id', userId)
      .order('unsubscribed_at', { ascending: false })

    return data || []
  }

  // Filter emails - remove unsubscribed senders
  async filterEmails<T extends { from_address: string }>(
    userId: string,
    emails: T[]
  ): Promise<{ filtered: T[]; blockedCount: number }> {
    const { emails: blockedEmails, domains: blockedDomains } = await this.loadUnsubscribedList(userId)

    let blockedCount = 0
    const filtered = emails.filter(email => {
      const fromAddress = email.from_address.toLowerCase()

      // Check exact email
      if (blockedEmails.has(fromAddress)) {
        console.log(`[UNSUBSCRIBE] Filtered: ${fromAddress} (exact match)`)
        blockedCount++
        return false
      }

      // Check domain
      const domain = fromAddress.split('@')[1]
      if (domain && blockedDomains.has(domain)) {
        console.log(`[UNSUBSCRIBE] Filtered: ${fromAddress} (domain: ${domain})`)
        blockedCount++
        return false
      }

      return true
    })

    return { filtered, blockedCount }
  }
}

// Singleton instance for server-side use
let unsubscribeServiceInstance: UnsubscribeService | null = null

export function getUnsubscribeService(supabase: SupabaseClient): UnsubscribeService {
  if (!unsubscribeServiceInstance) {
    unsubscribeServiceInstance = new UnsubscribeService(supabase)
  }
  return unsubscribeServiceInstance
}
