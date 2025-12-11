'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, Trash2, Mail, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddAccountModal } from './add-account-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId)
    try {
      const res = await fetch(`/api/source-accounts/${accountId}/sync`, {
        method: 'POST'
      })
      const data = await res.json()

      if (res.ok) {
        // Refresh accounts to show updated sync info
        fetchAccounts()
        alert(`Da dong bo ${data.synced} email`)
      } else {
        alert(data.error || 'Dong bo that bai')
      }
    } catch (error) {
      console.error('Sync error:', error)
      alert('Dong bo that bai')
    } finally {
      setSyncingId(null)
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
        alert(data.error || 'Xoa that bai')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Xoa that bai')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Chua dong bo'
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
    <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden">
      <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1A1A1A]">Tai khoan email</h3>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5">
            Ket noi cac tai khoan email de dong bo vao InboxAI
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Them
        </Button>
      </div>

      <div className="divide-y divide-[#EBEBEB]">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto text-[#9B9B9B] animate-spin" />
            <p className="text-[14px] text-[#6B6B6B] mt-2">Dang tai...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-10 h-10 mx-auto text-[#9B9B9B] mb-3" strokeWidth={1.5} />
            <p className="text-[14px] text-[#6B6B6B]">Chua co tai khoan email nao</p>
            <p className="text-[13px] text-[#9B9B9B] mt-1">
              Them tai khoan de bat dau dong bo email
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
                    Dong bo: {formatDate(account.last_sync_at)}
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
                <button
                  onClick={() => handleSync(account.id)}
                  disabled={syncingId === account.id}
                  className="p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors disabled:opacity-50"
                  title="Dong bo ngay"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingId === account.id ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ show: true, account })}
                  className="p-2 text-[#6B6B6B] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Xoa tai khoan"
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
        title="Xoa tai khoan email?"
        message={`Ban co chac muon xoa ${deleteConfirm.account?.email_address}? Email da dong bo se khong bi xoa.`}
        confirmText="Xoa"
        cancelText="Huy"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ show: false })}
      />
    </div>
  )
}
