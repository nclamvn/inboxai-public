'use client'

import { memo, useCallback } from 'react'
import { Globe, Star, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DomainEntry {
  domain: string
  reputation_score: number
  trust_level: string
  total_emails: number
  opens: number
  replies: number
  deletes: number
  spam_marks: number
  is_whitelisted: boolean
  is_blacklisted: boolean
}

interface DomainStats {
  total_domains: number
  trusted_count: number
  blacklisted_count: number
  whitelisted_count: number
}

interface AdminDomainsTabProps {
  domains: DomainEntry[]
  stats: DomainStats | null
  onDomainAction: (domain: string, action: 'whitelist' | 'blacklist') => void
}

export const AdminDomainsTab = memo(function AdminDomainsTab({
  domains,
  stats,
  onDomainAction,
}: AdminDomainsTabProps) {
  const getTrustLevelColor = useCallback((level: string) => {
    switch (level) {
      case 'verified': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
      case 'trusted': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      case 'neutral': return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
      case 'low': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
      case 'untrusted': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
    }
  }, [])

  return (
    <div>
      {stats && (
        <div className="p-4 bg-[var(--background)] border-b border-[var(--border)]">
          <div className="flex items-center gap-6 text-[13px]">
            <span className="text-[var(--muted)]">
              Total: <strong className="text-[var(--foreground)]">{stats.total_domains}</strong>
            </span>
            <span className="text-[var(--muted)]">
              Trusted: <strong className="text-green-600 dark:text-green-400">{stats.trusted_count}</strong>
            </span>
            <span className="text-[var(--muted)]">
              Whitelisted: <strong className="text-blue-600 dark:text-blue-400">{stats.whitelisted_count}</strong>
            </span>
            <span className="text-[var(--muted)]">
              Blacklisted: <strong className="text-red-600 dark:text-red-400">{stats.blacklisted_count}</strong>
            </span>
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <div className="p-8 text-center text-[var(--muted)]">
          <Globe className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No domains tracked yet</p>
        </div>
      ) : (
        domains.map((domain) => (
          <div key={domain.domain} className="p-4 hover:bg-[var(--hover)] transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-[var(--foreground)]">{domain.domain}</span>
                  <span className={cn('px-2 py-0.5 text-[11px] rounded-full', getTrustLevelColor(domain.trust_level))}>
                    {domain.trust_level}
                  </span>
                  {domain.is_whitelisted && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      whitelisted
                    </span>
                  )}
                  {domain.is_blacklisted && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                      blacklisted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-[12px] text-[var(--muted)]">
                  <span>Score: <strong>{domain.reputation_score}</strong></span>
                  <span>Emails: {domain.total_emails}</span>
                  <span>Opens: {domain.opens}</span>
                  <span>Replies: {domain.replies}</span>
                  <span>Deletes: {domain.deletes}</span>
                  {domain.spam_marks > 0 && (
                    <span className="text-red-500">Spam: {domain.spam_marks}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!domain.is_whitelisted && (
                  <button
                    onClick={() => onDomainAction(domain.domain, 'whitelist')}
                    className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                    title="Whitelist"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                {!domain.is_blacklisted && (
                  <button
                    onClick={() => onDomainAction(domain.domain, 'blacklist')}
                    className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    title="Blacklist"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
})

export default AdminDomainsTab
