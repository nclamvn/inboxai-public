'use client'

import { memo } from 'react'
import { Clock, Users, Brain, Target, Globe } from 'lucide-react'

interface AdminStatsProps {
  pendingCount: number
  activeWhitelistCount: number
  totalClassifications: number
  accuracyRate: number | null
  totalDomains: number
}

export const AdminStats = memo(function AdminStats({
  pendingCount,
  activeWhitelistCount,
  totalClassifications,
  accuracyRate,
  totalDomains,
}: AdminStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--foreground)]">{pendingCount}</p>
            <p className="text-[12px] text-[var(--muted)]">Pending</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--foreground)]">
              {activeWhitelistCount}
            </p>
            <p className="text-[12px] text-[var(--muted)]">Whitelist</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--foreground)]">
              {totalClassifications}
            </p>
            <p className="text-[12px] text-[var(--muted)]">Classifications</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--foreground)]">
              {accuracyRate ? `${(accuracyRate * 100).toFixed(0)}%` : '-'}
            </p>
            <p className="text-[12px] text-[var(--muted)]">Accuracy</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--foreground)]">
              {totalDomains}
            </p>
            <p className="text-[12px] text-[var(--muted)]">Domains</p>
          </div>
        </div>
      </div>
    </div>
  )
})

export default AdminStats
