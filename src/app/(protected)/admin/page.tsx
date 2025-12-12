'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, Clock, Check, X, Plus, Search,
  UserCheck, UserX, Trash2, RefreshCw, ArrowLeft
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

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'whitelist' | 'requests'>('requests')
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const [whitelistRes, requestsRes] = await Promise.all([
        fetch('/api/admin/whitelist?type=whitelist'),
        fetch('/api/admin/whitelist?type=requests')
      ])

      if (!whitelistRes.ok || !requestsRes.ok) {
        if (whitelistRes.status === 403 || requestsRes.status === 403) {
          setError('Bạn không có quyền truy cập trang này')
          return
        }
        throw new Error('Failed to fetch data')
      }

      const whitelistData = await whitelistRes.json()
      const requestsData = await requestsRes.json()

      setWhitelist(whitelistData.whitelist || [])
      setRequests(requestsData.requests || [])
    } catch (err) {
      setError('Có lỗi xảy ra khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
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
      fetchData()
    } catch (err) {
      setError('Có lỗi xảy ra')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', type: 'request' })
      })
      fetchData()
    } catch (err) {
      setError('Có lỗi xảy ra')
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await fetch('/api/admin/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle' })
      })
      fetchData()
    } catch (err) {
      setError('Có lỗi xảy ra')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa?')) return

    try {
      await fetch(`/api/admin/whitelist?id=${id}`, {
        method: 'DELETE'
      })
      fetchData()
    } catch (err) {
      setError('Có lỗi xảy ra')
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

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const filteredWhitelist = whitelist.filter(w =>
    w.email.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredRequests = requests.filter(r =>
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (error === 'Bạn không có quyền truy cập trang này') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-center">
          <Shield className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Không có quyền truy cập
          </h1>
          <p className="text-[var(--muted)] mb-6">
            Bạn không phải là admin của hệ thống.
          </p>
          <button
            onClick={() => router.push('/inbox')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại Inbox
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-4">
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
                  Quản lý whitelist và yêu cầu truy cập
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Thêm email
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {whitelist.filter(w => w.is_active).length}
                </p>
                <p className="text-[13px] text-[var(--muted)]">Whitelist Active</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {pendingCount}
                </p>
                <p className="text-[13px] text-[var(--muted)]">Chờ phê duyệt</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {requests.filter(r => r.status === 'approved').length}
                </p>
                <p className="text-[13px] text-[var(--muted)]">Đã phê duyệt</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="flex border-b border-[var(--border)]">
            <button
              onClick={() => setActiveTab('requests')}
              className={cn(
                'flex-1 px-4 py-3 text-[14px] font-medium transition-colors relative',
                activeTab === 'requests'
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              )}
            >
              Yêu cầu truy cập
              {pendingCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[12px] rounded-full">
                  {pendingCount}
                </span>
              )}
              {activeTab === 'requests' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('whitelist')}
              className={cn(
                'flex-1 px-4 py-3 text-[14px] font-medium transition-colors relative',
                activeTab === 'whitelist'
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              )}
            >
              Whitelist
              <span className="ml-2 px-2 py-0.5 bg-[var(--secondary)] text-[var(--muted)] text-[12px] rounded-full">
                {whitelist.length}
              </span>
              {activeTab === 'whitelist' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </button>
          </div>

          {/* Search & Refresh */}
          <div className="p-4 border-b border-[var(--border)] flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm..."
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

          {/* Content */}
          <div className="divide-y divide-[var(--border)]">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-6 h-6 text-[var(--muted-foreground)] animate-spin mx-auto" />
              </div>
            ) : activeTab === 'requests' ? (
              filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)]">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Không có yêu cầu nào</p>
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
                            request.status === 'pending' && 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
                            request.status === 'approved' && 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                            request.status === 'rejected' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          )}>
                            {request.status === 'pending' && 'Chờ duyệt'}
                            {request.status === 'approved' && 'Đã duyệt'}
                            {request.status === 'rejected' && 'Từ chối'}
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-[13px] font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            Duyệt
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-[13px] font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            ) : (
              filteredWhitelist.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)]">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Whitelist trống</p>
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
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                              : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--hover)]'
                          )}
                          title={entry.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        >
                          {entry.is_active ? (
                            <UserCheck className="w-4 h-4" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[var(--card)] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
                Thêm email vào whitelist
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
                  Ghi chú (tùy chọn)
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
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail}
                  className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
