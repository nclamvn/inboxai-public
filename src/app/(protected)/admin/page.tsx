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
      setError('Co loi xay ra khi tai du lieu')
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
      fetchData()
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
      fetchData()
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
      fetchData()
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
      fetchData()
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

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const filteredWhitelist = whitelist.filter(w =>
    w.email.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredRequests = requests.filter(r =>
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (error === 'Ban khong co quyen truy cap trang nay') {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="text-center">
          <Shield className="w-16 h-16 text-[#9B9B9B] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[#1A1A1A] mb-2">
            Khong co quyen truy cap
          </h1>
          <p className="text-[#6B6B6B] mb-6">
            Ban khong phai la admin cua he thong.
          </p>
          <button
            onClick={() => router.push('/inbox')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lai Inbox
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/inbox')}
                className="p-2 hover:bg-[#F5F5F5] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B6B6B]" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Admin Dashboard
                </h1>
                <p className="text-[13px] text-[#6B6B6B]">
                  Quan ly whitelist va yeu cau truy cap
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-[14px] font-medium hover:bg-[#333] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Them email
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-[#EBEBEB] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#1A1A1A]">
                  {whitelist.filter(w => w.is_active).length}
                </p>
                <p className="text-[13px] text-[#6B6B6B]">Whitelist Active</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#EBEBEB] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#1A1A1A]">
                  {pendingCount}
                </p>
                <p className="text-[13px] text-[#6B6B6B]">Cho phe duyet</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#EBEBEB] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#1A1A1A]">
                  {requests.filter(r => r.status === 'approved').length}
                </p>
                <p className="text-[13px] text-[#6B6B6B]">Da phe duyet</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden">
          <div className="flex border-b border-[#EBEBEB]">
            <button
              onClick={() => setActiveTab('requests')}
              className={cn(
                'flex-1 px-4 py-3 text-[14px] font-medium transition-colors relative',
                activeTab === 'requests'
                  ? 'text-[#1A1A1A]'
                  : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              )}
            >
              Yeu cau truy cap
              {pendingCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-600 text-[12px] rounded-full">
                  {pendingCount}
                </span>
              )}
              {activeTab === 'requests' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1A1A1A]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('whitelist')}
              className={cn(
                'flex-1 px-4 py-3 text-[14px] font-medium transition-colors relative',
                activeTab === 'whitelist'
                  ? 'text-[#1A1A1A]'
                  : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              )}
            >
              Whitelist
              <span className="ml-2 px-2 py-0.5 bg-[#F5F5F5] text-[#6B6B6B] text-[12px] rounded-full">
                {whitelist.length}
              </span>
              {activeTab === 'whitelist' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1A1A1A]" />
              )}
            </button>
          </div>

          {/* Search & Refresh */}
          <div className="p-4 border-b border-[#EBEBEB] flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tim kiem..."
                className="w-full pl-10 pr-4 py-2 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10 focus:border-[#1A1A1A]"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 border border-[#EBEBEB] rounded-lg hover:bg-[#F5F5F5] transition-colors"
            >
              <RefreshCw className={cn('w-5 h-5 text-[#6B6B6B]', loading && 'animate-spin')} />
            </button>
          </div>

          {/* Content */}
          <div className="divide-y divide-[#EBEBEB]">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-6 h-6 text-[#9B9B9B] animate-spin mx-auto" />
              </div>
            ) : activeTab === 'requests' ? (
              filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-[#6B6B6B]">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Khong co yeu cau nao</p>
                </div>
              ) : (
                filteredRequests.map((request) => (
                  <div key={request.id} className="p-4 hover:bg-[#FAFAFA] transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-[#1A1A1A]">
                            {request.full_name}
                          </span>
                          <span className={cn(
                            'px-2 py-0.5 text-[11px] rounded-full',
                            request.status === 'pending' && 'bg-orange-100 text-orange-600',
                            request.status === 'approved' && 'bg-green-100 text-green-600',
                            request.status === 'rejected' && 'bg-red-100 text-red-600'
                          )}>
                            {request.status === 'pending' && 'Cho duyet'}
                            {request.status === 'approved' && 'Da duyet'}
                            {request.status === 'rejected' && 'Tu choi'}
                          </span>
                        </div>
                        <p className="text-[14px] text-[#6B6B6B]">{request.email}</p>
                        {request.reason && (
                          <p className="text-[13px] text-[#9B9B9B] mt-1">
                            "{request.reason}"
                          </p>
                        )}
                        <p className="text-[12px] text-[#BBBBBB] mt-2">
                          {formatDate(request.created_at)}
                        </p>
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(request.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-600 rounded-lg text-[13px] font-medium hover:bg-green-200 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            Duyet
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[13px] font-medium hover:bg-red-200 transition-colors"
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
            ) : (
              filteredWhitelist.length === 0 ? (
                <div className="p-8 text-center text-[#6B6B6B]">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Whitelist trong</p>
                </div>
              ) : (
                filteredWhitelist.map((entry) => (
                  <div key={entry.id} className="p-4 hover:bg-[#FAFAFA] transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            'text-[14px]',
                            entry.is_active ? 'text-[#1A1A1A] font-medium' : 'text-[#9B9B9B]'
                          )}>
                            {entry.email}
                          </span>
                          {!entry.is_active && (
                            <span className="px-2 py-0.5 bg-[#F5F5F5] text-[#9B9B9B] text-[11px] rounded-full">
                              Inactive
                            </span>
                          )}
                        </div>
                        {entry.notes && (
                          <p className="text-[13px] text-[#9B9B9B]">{entry.notes}</p>
                        )}
                        <p className="text-[12px] text-[#BBBBBB] mt-1">
                          {formatDate(entry.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(entry.id)}
                          className={cn(
                            'p-2 rounded-lg transition-colors',
                            entry.is_active
                              ? 'bg-green-100 text-green-600 hover:bg-green-200'
                              : 'bg-[#F5F5F5] text-[#9B9B9B] hover:bg-[#EBEBEB]'
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
                          className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                          title="Xoa"
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
          <div className="w-full max-w-md bg-white rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
                Them email vao whitelist
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-[#F5F5F5] rounded"
              >
                <X className="w-5 h-5 text-[#6B6B6B]" />
              </button>
            </div>
            <form onSubmit={handleAddToWhitelist} className="p-4 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full px-4 py-2.5 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10 focus:border-[#1A1A1A]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">
                  Ghi chu (tuy chon)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="VIP, Beta tester, etc."
                  className="w-full px-4 py-2.5 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10 focus:border-[#1A1A1A]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-[#EBEBEB] rounded-lg text-[14px] font-medium text-[#6B6B6B] hover:bg-[#F5F5F5] transition-colors"
                >
                  Huy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail}
                  className="flex-1 py-2.5 bg-[#1A1A1A] text-white rounded-lg text-[14px] font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
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
