'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, Clock, Check, X, Plus, Search,
  UserCheck, UserX, Trash2, RefreshCw, ArrowLeft,
  Brain, Globe, Settings, TrendingUp, AlertTriangle,
  BarChart3, Target, Zap, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Star, Ban, RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  reviewed_at?: string
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchWhitelistData = async () => {
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
  }

  const fetchAIMetrics = async () => {
    try {
      const res = await fetch(`/api/admin/ai-metrics?days=${metricsDays}`)
      if (res.ok) {
        const data = await res.json()
        setAIMetrics(data.stats)
      }
    } catch (err) {
      console.error('Fetch AI metrics error:', err)
    }
  }

  const fetchDomains = async () => {
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
  }

  const fetchAISettings = async () => {
    try {
      const res = await fetch('/api/admin/ai-settings')
      if (res.ok) {
        const data = await res.json()
        setAISettings(data)
      }
    } catch (err) {
      console.error('Fetch AI settings error:', err)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setError('')

    await Promise.all([
      fetchWhitelistData(),
      fetchAIMetrics(),
      fetchDomains(),
      fetchAISettings()
    ])

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (activeTab === 'ai-metrics') {
      fetchAIMetrics()
    }
  }, [metricsDays])

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

  const handleApprove = async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve', type: 'request' })
      })
      fetchWhitelistData()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', type: 'request' })
      })
      fetchWhitelistData()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle' })
      })
      fetchWhitelistData()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ban co chac muon xoa?')) return

    try {
      await fetch(`/api/admin/whitelist?id=${id}`, {
        method: 'DELETE'
      })
      fetchWhitelistData()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

  const handleDomainAction = async (domain: string, action: 'whitelist' | 'blacklist') => {
    try {
      await fetch('/api/admin/domain-reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, domain })
      })
      fetchDomains()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

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
    } catch (err) {
      setError('Co loi xay ra')
    } finally {
      setIsSubmitting(false)
    }
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
    } catch (err) {
      setError('Co loi xay ra khi luu cai dat')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleResetSettings = async () => {
    if (!confirm('Reset to default settings?')) return
    try {
      await fetch('/api/admin/ai-settings', { method: 'DELETE' })
      fetchAISettings()
    } catch (err) {
      setError('Co loi xay ra')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'verified': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
      case 'trusted': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      case 'neutral': return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
      case 'low': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
      case 'untrusted': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
    }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const filteredWhitelist = whitelist.filter(w =>
    w.email.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredRequests = requests.filter(r =>
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredDomains = domains.filter(d =>
    d.domain.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (error === 'Ban khong co quyen truy cap trang nay') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-center">
          <Shield className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Khong co quyen truy cap
          </h1>
          <p className="text-[var(--muted)] mb-6">
            Ban khong phai la admin cua he thong.
          </p>
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
              <button
                onClick={() => router.push('/inbox')}
                className="p-2 hover:bg-[var(--hover)] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--muted)]" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Admin Dashboard
                </h1>
                <p className="text-[13px] text-[var(--muted)]">
                  Quan ly he thong va AI settings
                </p>
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
                  {whitelist.filter(w => w.is_active).length}
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
                  {aiMetrics?.totalClassifications || 0}
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
                  {aiMetrics?.accuracyRate ? `${(aiMetrics.accuracyRate * 100).toFixed(0)}%` : '-'}
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
                  {domainStats?.total_domains || 0}
                </p>
                <p className="text-[12px] text-[var(--muted)]">Domains</p>
              </div>
            </div>
          </div>
        </div>

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
                  activeTab === tab.id
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]'
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
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>

          {/* Search & Refresh (for list tabs) */}
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
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 border border-[var(--border)] rounded-lg hover:bg-[var(--hover)] transition-colors"
              >
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
              /* Requests Tab */
              filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)]">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Khong co yeu cau nao</p>
                </div>
              ) : (
                filteredRequests.map((request) => (
                  <div key={request.id} className="p-4 hover:bg-[var(--hover)] transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-[var(--foreground)]">
                            {request.full_name}
                          </span>
                          <span className={cn(
                            'px-2 py-0.5 text-[11px] rounded-full',
                            request.status === 'pending' && 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
                            request.status === 'approved' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                            request.status === 'rejected' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          )}>
                            {request.status === 'pending' && 'Cho duyet'}
                            {request.status === 'approved' && 'Da duyet'}
                            {request.status === 'rejected' && 'Tu choi'}
                          </span>
                        </div>
                        <p className="text-[14px] text-[var(--muted)]">{request.email}</p>
                        {request.reason && (
                          <p className="text-[13px] text-[var(--muted-foreground)] mt-1">
                            "{request.reason}"
                          </p>
                        )}
                        <p className="text-[12px] text-[var(--muted-foreground)] mt-2">
                          {formatDate(request.created_at)}
                        </p>
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(request.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-[13px] font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            Duyet
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-[13px] font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Tu choi
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            ) : activeTab === 'whitelist' ? (
              /* Whitelist Tab */
              filteredWhitelist.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)]">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Whitelist trong</p>
                </div>
              ) : (
                filteredWhitelist.map((entry) => (
                  <div key={entry.id} className="p-4 hover:bg-[var(--hover)] transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            'text-[14px]',
                            entry.is_active ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)]'
                          )}>
                            {entry.email}
                          </span>
                          {!entry.is_active && (
                            <span className="px-2 py-0.5 bg-[var(--secondary)] text-[var(--muted-foreground)] text-[11px] rounded-full">
                              Inactive
                            </span>
                          )}
                        </div>
                        {entry.notes && (
                          <p className="text-[13px] text-[var(--muted-foreground)]">{entry.notes}</p>
                        )}
                        <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
                          {formatDate(entry.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(entry.id)}
                          className={cn(
                            'p-2 rounded-lg transition-colors',
                            entry.is_active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                              : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--hover)]'
                          )}
                          title={entry.is_active ? 'Vo hieu hoa' : 'Kich hoat'}
                        >
                          {entry.is_active ? (
                            <UserCheck className="w-4 h-4" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title="Xoa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : activeTab === 'ai-metrics' ? (
              /* AI Metrics Tab */
              <div className="p-6">
                {/* Time Range Selector */}
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[13px] text-[var(--muted)]">Time range:</span>
                  {[7, 14, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => setMetricsDays(days)}
                      className={cn(
                        'px-3 py-1 text-[13px] rounded-lg transition-colors',
                        metricsDays === days
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--muted)] hover:bg-[var(--hover)]'
                      )}
                    >
                      {days}d
                    </button>
                  ))}
                </div>

                {aiMetrics ? (
                  <div className="space-y-6">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-[var(--background)] rounded-lg p-4">
                        <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                          <Zap className="w-4 h-4" />
                          <span className="text-[12px]">Total Classifications</span>
                        </div>
                        <p className="text-2xl font-semibold text-[var(--foreground)]">
                          {aiMetrics.totalClassifications}
                        </p>
                      </div>
                      <div className="bg-[var(--background)] rounded-lg p-4">
                        <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-[12px]">Avg Confidence</span>
                        </div>
                        <p className="text-2xl font-semibold text-[var(--foreground)]">
                          {aiMetrics.averageConfidence ? `${(aiMetrics.averageConfidence * 100).toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="bg-[var(--background)] rounded-lg p-4">
                        <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                          <Target className="w-4 h-4" />
                          <span className="text-[12px]">Accuracy Rate</span>
                        </div>
                        <p className="text-2xl font-semibold text-[var(--foreground)]">
                          {aiMetrics.accuracyRate ? `${(aiMetrics.accuracyRate * 100).toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="bg-[var(--background)] rounded-lg p-4">
                        <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[12px]">Positive Feedback</span>
                        </div>
                        <p className="text-2xl font-semibold text-[var(--foreground)]">
                          {aiMetrics.positiveRate ? `${(aiMetrics.positiveRate * 100).toFixed(0)}%` : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Classification Sources */}
                    {aiMetrics.bySource && Object.keys(aiMetrics.bySource).length > 0 && (
                      <div>
                        <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-3">
                          Classification Sources
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(aiMetrics.bySource).map(([source, count]) => (
                            <div key={source} className="flex items-center gap-3">
                              <span className="text-[13px] text-[var(--muted)] w-24">{source}</span>
                              <div className="flex-1 h-6 bg-[var(--background)] rounded overflow-hidden">
                                <div
                                  className="h-full bg-[var(--primary)] rounded"
                                  style={{
                                    width: `${(count / aiMetrics.totalClassifications) * 100}%`
                                  }}
                                />
                              </div>
                              <span className="text-[13px] text-[var(--foreground)] w-12 text-right">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Accuracy by Category */}
                    {aiMetrics.accuracyByCategory && Object.keys(aiMetrics.accuracyByCategory).length > 0 && (
                      <div>
                        <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-3">
                          Accuracy by Category
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(aiMetrics.accuracyByCategory).map(([category, data]) => (
                            <div
                              key={category}
                              className="bg-[var(--background)] rounded-lg p-3 cursor-pointer hover:bg-[var(--hover)] transition-colors"
                              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {expandedCategory === category ? (
                                    <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
                                  )}
                                  <span className="text-[13px] font-medium text-[var(--foreground)] capitalize">
                                    {category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-[12px] text-[var(--muted)]">
                                    {data.accurate}/{data.total}
                                  </span>
                                  <span className={cn(
                                    'text-[13px] font-medium',
                                    data.accuracy >= 0.8 ? 'text-green-600 dark:text-green-400' :
                                    data.accuracy >= 0.6 ? 'text-orange-600 dark:text-orange-400' :
                                    'text-red-600 dark:text-red-400'
                                  )}>
                                    {(data.accuracy * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                              {expandedCategory === category && (
                                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                  <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                    <span>Accurate: {data.accurate}</span>
                                    <XCircle className="w-3 h-3 text-red-500 ml-4" />
                                    <span>Inaccurate: {data.total - data.accurate}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-[var(--muted)] py-8">
                    <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                )}
              </div>
            ) : activeTab === 'domains' ? (
              /* Domains Tab */
              <div>
                {domainStats && (
                  <div className="p-4 bg-[var(--background)] border-b border-[var(--border)]">
                    <div className="flex items-center gap-6 text-[13px]">
                      <span className="text-[var(--muted)]">
                        Total: <strong className="text-[var(--foreground)]">{domainStats.total_domains}</strong>
                      </span>
                      <span className="text-[var(--muted)]">
                        Trusted: <strong className="text-green-600 dark:text-green-400">{domainStats.trusted_count}</strong>
                      </span>
                      <span className="text-[var(--muted)]">
                        Whitelisted: <strong className="text-blue-600 dark:text-blue-400">{domainStats.whitelisted_count}</strong>
                      </span>
                      <span className="text-[var(--muted)]">
                        Blacklisted: <strong className="text-red-600 dark:text-red-400">{domainStats.blacklisted_count}</strong>
                      </span>
                    </div>
                  </div>
                )}
                {filteredDomains.length === 0 ? (
                  <div className="p-8 text-center text-[var(--muted)]">
                    <Globe className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No domains tracked yet</p>
                  </div>
                ) : (
                  filteredDomains.map((domain) => (
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
                              onClick={() => handleDomainAction(domain.domain, 'whitelist')}
                              className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                              title="Whitelist"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}
                          {!domain.is_blacklisted && (
                            <button
                              onClick={() => handleDomainAction(domain.domain, 'blacklist')}
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
            ) : activeTab === 'ai-settings' ? (
              /* AI Settings Tab */
              <div className="p-6">
                {aiSettings ? (
                  <div className="space-y-8">
                    {aiSettings.is_default && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-[13px] text-blue-700 dark:text-blue-300">
                        <AlertTriangle className="w-4 h-4" />
                        Using default settings. Changes will be saved to your account.
                      </div>
                    )}

                    {/* Sender Reputation Settings */}
                    <div>
                      <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        Sender Reputation
                      </h3>
                      <div className="space-y-4">
                        <label className="flex items-center justify-between">
                          <span className="text-[13px] text-[var(--muted)]">Enable sender reputation</span>
                          <button
                            onClick={() => setAISettings({...aiSettings, sender_reputation_enabled: !aiSettings.sender_reputation_enabled})}
                            className={cn(
                              'w-12 h-6 rounded-full transition-colors relative',
                              aiSettings.sender_reputation_enabled ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]'
                            )}
                          >
                            <div className={cn(
                              'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                              aiSettings.sender_reputation_enabled ? 'left-7' : 'left-1'
                            )} />
                          </button>
                        </label>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[13px] text-[var(--muted)]">Reputation threshold</span>
                            <span className="text-[13px] text-[var(--foreground)]">{aiSettings.sender_reputation_threshold}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={aiSettings.sender_reputation_threshold}
                            onChange={(e) => setAISettings({...aiSettings, sender_reputation_threshold: parseFloat(e.target.value)})}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Phishing Detection Settings */}
                    <div>
                      <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Phishing Detection
                      </h3>
                      <div className="space-y-4">
                        <label className="flex items-center justify-between">
                          <span className="text-[13px] text-[var(--muted)]">Auto-mark as spam</span>
                          <button
                            onClick={() => setAISettings({...aiSettings, phishing_auto_spam: !aiSettings.phishing_auto_spam})}
                            className={cn(
                              'w-12 h-6 rounded-full transition-colors relative',
                              aiSettings.phishing_auto_spam ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]'
                            )}
                          >
                            <div className={cn(
                              'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                              aiSettings.phishing_auto_spam ? 'left-7' : 'left-1'
                            )} />
                          </button>
                        </label>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[13px] text-[var(--muted)]">Phishing score threshold</span>
                            <span className="text-[13px] text-[var(--foreground)]">{aiSettings.phishing_score_threshold}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={aiSettings.phishing_score_threshold}
                            onChange={(e) => setAISettings({...aiSettings, phishing_score_threshold: parseInt(e.target.value)})}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Confidence Settings */}
                    <div>
                      <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Classification Confidence
                      </h3>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] text-[var(--muted)]">Low confidence threshold</span>
                          <span className="text-[13px] text-[var(--foreground)]">{aiSettings.low_confidence_threshold}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={aiSettings.low_confidence_threshold}
                          onChange={(e) => setAISettings({...aiSettings, low_confidence_threshold: parseFloat(e.target.value)})}
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Domain Weights */}
                    <div>
                      <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Domain Reputation Weights
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                          { key: 'domain_weight_open', label: 'Open', color: 'green' },
                          { key: 'domain_weight_reply', label: 'Reply', color: 'blue' },
                          { key: 'domain_weight_archive', label: 'Archive', color: 'gray' },
                          { key: 'domain_weight_delete', label: 'Delete', color: 'orange' },
                          { key: 'domain_weight_spam', label: 'Spam', color: 'red' },
                          { key: 'domain_weight_phishing', label: 'Phishing', color: 'red' }
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <label className="text-[12px] text-[var(--muted)] block mb-1">{label}</label>
                            <input
                              type="number"
                              value={aiSettings[key as keyof AISettings] as number}
                              onChange={(e) => setAISettings({...aiSettings, [key]: parseInt(e.target.value)})}
                              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
                      <button
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {savingSettings ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Save Settings
                      </button>
                      <button
                        onClick={handleResetSettings}
                        className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-[var(--muted)] rounded-lg text-[14px] font-medium hover:bg-[var(--hover)] transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to Defaults
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[var(--muted)] py-8">
                    <Settings className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>Loading settings...</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[var(--card)] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
                Them email vao whitelist
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-[var(--hover)] rounded"
              >
                <X className="w-5 h-5 text-[var(--muted)]" />
              </button>
            </div>
            <form onSubmit={handleAddToWhitelist} className="p-4 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
                  Email
                </label>
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
                <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
                  Ghi chu (tuy chon)
                </label>
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
