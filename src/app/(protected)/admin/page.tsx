'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Shield, Clock, Plus, Search, RefreshCw, ArrowLeft,
  BarChart3, Globe, Settings, X, RotateCcw, Users
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Dynamic imports for code splitting
const AdminStats = dynamic(() => import('./components/admin-stats'), {
  loading: () => <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-[var(--secondary)] rounded-xl animate-pulse" />)}</div>,
})

const AdminRequestsTab = dynamic(() => import('./components/admin-requests-tab'), {
  loading: () => <div className="p-8"><div className="h-32 bg-[var(--secondary)] rounded-lg animate-pulse" /></div>,
})

const AdminWhitelistTab = dynamic(() => import('./components/admin-whitelist-tab'), {
  loading: () => <div className="p-8"><div className="h-32 bg-[var(--secondary)] rounded-lg animate-pulse" /></div>,
})

const AdminAIMetricsTab = dynamic(() => import('./components/admin-ai-metrics-tab'), {
  loading: () => <div className="p-8"><div className="h-64 bg-[var(--secondary)] rounded-lg animate-pulse" /></div>,
})

const AdminDomainsTab = dynamic(() => import('./components/admin-domains-tab'), {
  loading: () => <div className="p-8"><div className="h-32 bg-[var(--secondary)] rounded-lg animate-pulse" /></div>,
})

const AdminAISettingsTab = dynamic(() => import('./components/admin-ai-settings-tab'), {
  loading: () => <div className="p-8"><div className="h-64 bg-[var(--secondary)] rounded-lg animate-pulse" /></div>,
})

// Types
interface WhitelistEntry {
  id: string
  email: string
  notes?: string
  is_active: boolean
  created_at: string
}

interface AccessRequest {
  id: string
  email: string
  full_name: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface AIMetrics {
  totalClassifications: number
  averageConfidence: number
  accuracyRate: number
  feedbackCount: number
  positiveRate: number
  bySource: Record<string, number>
  accuracyByCategory: Record<string, { total: number; accurate: number; accuracy: number }>
}

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

interface AISettings {
  sender_reputation_threshold: number
  sender_reputation_enabled: boolean
  phishing_score_threshold: number
  phishing_auto_spam: boolean
  low_confidence_threshold: number
  domain_weight_open: number
  domain_weight_reply: number
  domain_weight_archive: number
  domain_weight_delete: number
  domain_weight_spam: number
  domain_weight_phishing: number
  is_default?: boolean
}

type TabType = 'requests' | 'whitelist' | 'ai-metrics' | 'domains' | 'ai-settings'

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('requests')
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [aiMetrics, setAIMetrics] = useState<AIMetrics | null>(null)
  const [domains, setDomains] = useState<DomainEntry[]>([])
  const [domainStats, setDomainStats] = useState<DomainStats | null>(null)
  const [aiSettings, setAISettings] = useState<AISettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [metricsDays, setMetricsDays] = useState(7)
  const [savingSettings, setSavingSettings] = useState(false)

  // Fetch functions
  const fetchWhitelistData = useCallback(async () => {
    try {
      const [whitelistRes, requestsRes] = await Promise.all([
        fetch('/api/admin/whitelist?type=whitelist'),
        fetch('/api/admin/whitelist?type=requests')
      ])

      if (!whitelistRes.ok || !requestsRes.ok) {
        if (whitelistRes.status === 403 || requestsRes.status === 403) {
          setError('Ban khong co quyen truy cap trang nay')
          return
        }
        throw new Error('Failed to fetch data')
      }

      const whitelistData = await whitelistRes.json()
      const requestsData = await requestsRes.json()
      setWhitelist(whitelistData.whitelist || [])
      setRequests(requestsData.requests || [])
    } catch (err) {
      console.error('Fetch whitelist error:', err)
    }
  }, [])

  const fetchAIMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/ai-metrics?days=${metricsDays}`)
      if (res.ok) {
        const data = await res.json()
        setAIMetrics(data.stats)
      }
    } catch (err) {
      console.error('Fetch AI metrics error:', err)
    }
  }, [metricsDays])

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/domain-reputation?limit=50')
      if (res.ok) {
        const data = await res.json()
        setDomains(data.topDomains || [])
        setDomainStats(data.stats || null)
      }
    } catch (err) {
      console.error('Fetch domains error:', err)
    }
  }, [])

  const fetchAISettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-settings')
      if (res.ok) {
        const data = await res.json()
        setAISettings(data)
      }
    } catch (err) {
      console.error('Fetch AI settings error:', err)
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    await Promise.all([fetchWhitelistData(), fetchAIMetrics(), fetchDomains(), fetchAISettings()])
    setLoading(false)
  }, [fetchWhitelistData, fetchAIMetrics, fetchDomains, fetchAISettings])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (activeTab === 'ai-metrics') {
      fetchAIMetrics()
    }
  }, [metricsDays, activeTab, fetchAIMetrics])

  // Handlers
  const handleAddToWhitelist = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, notes: newNotes })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      setShowAddModal(false)
      setNewEmail('')
      setNewNotes('')
      fetchWhitelistData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Co loi xay ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprove = useCallback(async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve', type: 'request' })
      })
      fetchWhitelistData()
    } catch { setError('Co loi xay ra') }
  }, [fetchWhitelistData])

  const handleReject = useCallback(async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', type: 'request' })
      })
      fetchWhitelistData()
    } catch { setError('Co loi xay ra') }
  }, [fetchWhitelistData])

  const handleToggle = useCallback(async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle' })
      })
      fetchWhitelistData()
    } catch { setError('Co loi xay ra') }
  }, [fetchWhitelistData])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Ban co chac muon xoa?')) return
    try {
      await fetch(`/api/admin/whitelist?id=${id}`, { method: 'DELETE' })
      fetchWhitelistData()
    } catch { setError('Co loi xay ra') }
  }, [fetchWhitelistData])

  const handleDomainAction = useCallback(async (domain: string, action: 'whitelist' | 'blacklist') => {
    try {
      await fetch('/api/admin/domain-reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, domain })
      })
      fetchDomains()
    } catch { setError('Co loi xay ra') }
  }, [fetchDomains])

  const handleRebuildReputation = async () => {
    if (!confirm('Rebuild domain reputation? This may take a moment.')) return
    setIsSubmitting(true)
    try {
      await fetch('/api/admin/domain-reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild' })
      })
      fetchDomains()
    } catch { setError('Co loi xay ra') }
    finally { setIsSubmitting(false) }
  }

  const handleSaveSettings = async () => {
    if (!aiSettings) return
    setSavingSettings(true)
    try {
      const res = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiSettings)
      })
      if (res.ok) {
        const data = await res.json()
        setAISettings({ ...data.settings, is_default: false })
      }
    } catch { setError('Co loi xay ra khi luu cai dat') }
    finally { setSavingSettings(false) }
  }

  const handleResetSettings = async () => {
    if (!confirm('Reset to default settings?')) return
    try {
      await fetch('/api/admin/ai-settings', { method: 'DELETE' })
      fetchAISettings()
    } catch { setError('Co loi xay ra') }
  }

  // Filtered data
  const pendingCount = requests.filter(r => r.status === 'pending').length
  const filteredWhitelist = whitelist.filter(w => w.email.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredRequests = requests.filter(r =>
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredDomains = domains.filter(d => d.domain.toLowerCase().includes(searchQuery.toLowerCase()))

  // Access denied view
  if (error === 'Ban khong co quyen truy cap trang nay') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-center">
          <Shield className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">Khong co quyen truy cap</h1>
          <p className="text-[var(--muted)] mb-6">Ban khong phai la admin cua he thong.</p>
          <button
            onClick={() => router.push('/inbox')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lai Inbox
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/inbox')} className="p-2 hover:bg-[var(--hover)] rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-[var(--muted)]" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Admin Dashboard
                </h1>
                <p className="text-[13px] text-[var(--muted)]">Quan ly he thong va AI settings</p>
              </div>
            </div>
            {activeTab === 'whitelist' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Them email
              </button>
            )}
            {activeTab === 'domains' && (
              <button
                onClick={handleRebuildReputation}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <RotateCcw className={cn('w-4 h-4', isSubmitting && 'animate-spin')} />
                Rebuild
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Quick Stats */}
        <AdminStats
          pendingCount={pendingCount}
          activeWhitelistCount={whitelist.filter(w => w.is_active).length}
          totalClassifications={aiMetrics?.totalClassifications || 0}
          accuracyRate={aiMetrics?.accuracyRate || null}
          totalDomains={domainStats?.total_domains || 0}
        />

        {/* Main Content */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] overflow-x-auto">
            {[
              { id: 'requests' as TabType, label: 'Yeu cau', icon: Clock, badge: pendingCount },
              { id: 'whitelist' as TabType, label: 'Whitelist', icon: Users, badge: whitelist.length },
              { id: 'ai-metrics' as TabType, label: 'AI Metrics', icon: BarChart3 },
              { id: 'domains' as TabType, label: 'Domains', icon: Globe },
              { id: 'ai-settings' as TabType, label: 'AI Settings', icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-[14px] font-medium transition-colors relative whitespace-nowrap',
                  activeTab === tab.id ? 'text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full',
                    tab.id === 'requests' && tab.badge > 0
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                      : 'bg-[var(--secondary)] text-[var(--muted)]'
                  )}>
                    {tab.badge}
                  </span>
                )}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />}
              </button>
            ))}
          </div>

          {/* Search & Refresh */}
          {['requests', 'whitelist', 'domains'].includes(activeTab) && (
            <div className="p-4 border-b border-[var(--border)] flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tim kiem..."
                  className="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                />
              </div>
              <button onClick={fetchData} disabled={loading} className="p-2 border border-[var(--border)] rounded-lg hover:bg-[var(--hover)] transition-colors">
                <RefreshCw className={cn('w-5 h-5 text-[var(--muted)]', loading && 'animate-spin')} />
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className="divide-y divide-[var(--border)]">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-6 h-6 text-[var(--muted-foreground)] animate-spin mx-auto" />
              </div>
            ) : activeTab === 'requests' ? (
              <AdminRequestsTab requests={filteredRequests} onApprove={handleApprove} onReject={handleReject} />
            ) : activeTab === 'whitelist' ? (
              <AdminWhitelistTab whitelist={filteredWhitelist} onToggle={handleToggle} onDelete={handleDelete} />
            ) : activeTab === 'ai-metrics' ? (
              <AdminAIMetricsTab metrics={aiMetrics} metricsDays={metricsDays} onDaysChange={setMetricsDays} />
            ) : activeTab === 'domains' ? (
              <AdminDomainsTab domains={filteredDomains} stats={domainStats} onDomainAction={handleDomainAction} />
            ) : activeTab === 'ai-settings' ? (
              <AdminAISettingsTab
                settings={aiSettings}
                saving={savingSettings}
                onSettingsChange={setAISettings}
                onSave={handleSaveSettings}
                onReset={handleResetSettings}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[var(--card)] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[var(--foreground)]">Them email vao whitelist</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-[var(--hover)] rounded">
                <X className="w-5 h-5 text-[var(--muted)]" />
              </button>
            </div>
            <form onSubmit={handleAddToWhitelist} className="p-4 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Ghi chu (tuy chon)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="VIP, Beta tester, etc."
                  className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-[var(--border)] rounded-lg text-[14px] font-medium text-[var(--muted)] hover:bg-[var(--hover)] transition-colors"
                >
                  Huy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail}
                  className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? 'Dang them...' : 'Them'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
