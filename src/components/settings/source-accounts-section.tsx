'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw, Trash2, Mail, AlertCircle, CheckCircle, Loader2, Sparkles, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddAccountModal } from './add-account-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

interface SourceAccount {
  id: string
  email_address: string
  display_name?: string
  provider: string
  is_active: boolean
  last_sync_at?: string
  sync_error?: string
  total_emails_synced: number
  created_at: string
}

export function SourceAccountsSection() {
  const [accounts, setAccounts] = useState<SourceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; account?: SourceAccount }>({ show: false })
  const [deleting, setDeleting] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [syncDropdownId, setSyncDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/source-accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSyncDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSync = async (accountId: string, fullSync = false) => {
    setSyncingId(accountId)
    try {
      const res = await fetch(`/api/source-accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullSync,
          limit: fullSync ? 500 : 200
        })
      })
      const data = await res.json()

      if (res.ok) {
        // Refresh accounts to show updated sync info
        fetchAccounts()
        alert(data.message || `Đã đồng bộ ${data.synced} email`)
      } else {
        alert(data.error || 'Đồng bộ thất bại')
      }
    } catch (error) {
      console.error('Sync error:', error)
      alert('Đồng bộ thất bại')
    } finally {
      setSyncingId(null)
    }
  }

  const handleClassify = async () => {
    setClassifying(true)
    try {
      const res = await fetch('/api/ai/classify-batch', {
        method: 'POST'
      })
      const data = await res.json()

      if (res.ok) {
        alert(data.message || `Đã phân loại ${data.classified}/${data.total} email`)
      } else {
        alert(data.error || 'Phân loại thất bại')
      }
    } catch (error) {
      console.error('Classify error:', error)
      alert('Phân loại thất bại')
    } finally {
      setClassifying(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.account) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/source-accounts/${deleteConfirm.account.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== deleteConfirm.account!.id))
        setDeleteConfirm({ show: false })
      } else {
        const data = await res.json()
        alert(data.error || 'Xóa thất bại')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Xóa thất bại')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Chưa đồng bộ'
    const date = new Date(dateStr)
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'gmail': return '📧'
      case 'outlook': return '📨'
      case 'yahoo': return '📩'
      default: return '⚙️'
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#EBEBEB]">
      <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1A1A1A]">Tài khoản email</h3>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5">
            Kết nối các tài khoản email để đồng bộ vào InboxAI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleClassify}
            size="sm"
            variant="secondary"
            disabled={classifying}
          >
            <Sparkles className={`w-4 h-4 mr-1 ${classifying ? 'animate-pulse' : ''}`} />
            {classifying ? 'Đang phân loại...' : 'Phân loại AI'}
          </Button>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Thêm
          </Button>
        </div>
      </div>

      <div className="divide-y divide-[#EBEBEB]">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto text-[#9B9B9B] animate-spin" />
            <p className="text-[14px] text-[#6B6B6B] mt-2">Đang tải...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-10 h-10 mx-auto text-[#9B9B9B] mb-3" strokeWidth={1.5} />
            <p className="text-[14px] text-[#6B6B6B]">Chưa có tài khoản email nào</p>
            <p className="text-[13px] text-[#9B9B9B] mt-1">
              Thêm tài khoản để bắt đầu đồng bộ email
            </p>
          </div>
        ) : (
          accounts.map(account => (
            <div key={account.id} className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-xl">
                {getProviderIcon(account.provider)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium text-[#1A1A1A] truncate">
                    {account.email_address}
                  </p>
                  {account.is_active ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                      <CheckCircle className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#9B9B9B] bg-[#F5F5F5] px-1.5 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[12px] text-[#6B6B6B]">
                    Đồng bộ: {formatDate(account.last_sync_at)}
                  </p>
                  <p className="text-[12px] text-[#9B9B9B]">
                    {account.total_emails_synced} email
                  </p>
                </div>
                {account.sync_error && (
                  <p className="flex items-center gap-1 text-[12px] text-red-500 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {account.sync_error}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Sync dropdown */}
                <div className="relative" ref={syncDropdownId === account.id ? dropdownRef : undefined}>
                  <button
                    onClick={() => setSyncDropdownId(syncDropdownId === account.id ? null : account.id)}
                    disabled={syncingId === account.id}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors disabled:opacity-50",
                      syncDropdownId === account.id && "bg-[#F5F5F5] text-[#1A1A1A]"
                    )}
                    title="Đồng bộ email"
                  >
                    <RefreshCw className={cn("w-4 h-4", syncingId === account.id && "animate-spin")} strokeWidth={1.5} />
                    <ChevronDown className={cn("w-3 h-3 transition-transform", syncDropdownId === account.id && "rotate-180")} strokeWidth={1.5} />
                  </button>

                  {/* Dropdown menu */}
                  {syncDropdownId === account.id && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#EBEBEB] rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={() => {
                          setSyncDropdownId(null)
                          handleSync(account.id, false)
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                      >
                        <div className="font-medium">Sync mới</div>
                        <div className="text-[11px] text-[#6B6B6B]">Chỉ email mới (nhanh)</div>
                      </button>
                      <button
                        onClick={() => {
                          setSyncDropdownId(null)
                          handleSync(account.id, true)
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                      >
                        <div className="font-medium">Sync tất cả</div>
                        <div className="text-[11px] text-[#6B6B6B]">Tối đa 500 email gần nhất</div>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setDeleteConfirm({ show: true, account })}
                  className="p-2 text-[#6B6B6B] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Xóa tài khoản"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false)
          fetchAccounts()
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.show}
        title="Xóa tài khoản email?"
        message={`Bạn có chắc muốn xóa ${deleteConfirm.account?.email_address}? Email đã đồng bộ sẽ không bị xóa.`}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ show: false })}
      />
    </div>
  )
}
