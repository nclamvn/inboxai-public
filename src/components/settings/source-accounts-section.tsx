'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw, Trash2, Mail, AlertCircle, CheckCircle, Loader2, Sparkles, ChevronDown, Star, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddAccountModal } from './add-account-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

// Account colors for color picker
const ACCOUNT_COLORS = [
  '#2563EB', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
]

interface SourceAccount {
  id: string
  email_address: string
  display_name?: string
  provider: string
  avatar_url?: string
  is_primary: boolean
  color: string
  is_active: boolean
  last_sync_at?: string
  sync_status?: 'idle' | 'syncing' | 'error'
  sync_error?: string
  total_emails_synced: number
  email_count?: number
  unread_count?: number
  auth_type?: string
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
          limit: fullSync ? 500 : 100  // Optimized: 100 for quick, 500 for full
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

  const handleSetPrimary = async (accountId: string) => {
    try {
      const res = await fetch(`/api/source-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true })
      })

      if (res.ok) {
        setAccounts(prev => prev.map(a => ({
          ...a,
          is_primary: a.id === accountId
        })))
      }
    } catch (error) {
      console.error('Set primary error:', error)
    }
  }

  const handleUpdateColor = async (accountId: string, color: string) => {
    try {
      const res = await fetch(`/api/source-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color })
      })

      if (res.ok) {
        setAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, color } : a
        ))
      }
    } catch (error) {
      console.error('Update color error:', error)
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
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--foreground)]">Tài khoản email</h3>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
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

      <div className="divide-y divide-[var(--border)]">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto text-[var(--muted)] animate-spin" />
            <p className="text-[14px] text-[var(--muted-foreground)] mt-2">Đang tải...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-10 h-10 mx-auto text-[var(--muted)] mb-3" strokeWidth={1.5} />
            <p className="text-[14px] text-[var(--muted-foreground)]">Chưa có tài khoản email nào</p>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              Thêm tài khoản để bắt đầu đồng bộ email
            </p>
          </div>
        ) : (
          accounts.map(account => (
            <div key={account.id} className="p-4 flex items-center gap-4">
              {/* Account avatar/icon with color indicator */}
              <div className="relative">
                {account.avatar_url ? (
                  <img
                    src={account.avatar_url}
                    alt={account.display_name || account.email_address}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-xl">
                    {getProviderIcon(account.provider)}
                  </div>
                )}
                {/* Color indicator */}
                <div
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[var(--card)]"
                  style={{ backgroundColor: account.color || '#2563EB' }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium text-[var(--foreground)] truncate">
                    {account.display_name || account.email_address}
                  </p>
                  {account.is_primary && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/20 px-1.5 py-0.5 rounded">
                      <Star className="w-3 h-3 fill-current" />
                      Primary
                    </span>
                  )}
                  {account.sync_status === 'syncing' ? (
                    <span className="flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/20 px-1.5 py-0.5 rounded">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Syncing
                    </span>
                  ) : account.is_active ? (
                    <span className="flex items-center gap-1 text-[11px] text-gray-900 dark:text-white bg-green-50 dark:bg-green-500/20 px-1.5 py-0.5 rounded">
                      <CheckCircle className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--muted)] bg-[var(--secondary)] px-1.5 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--muted)] truncate">
                  {account.email_address}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    Đồng bộ: {formatDate(account.last_sync_at)}
                  </p>
                  <p className="text-[12px] text-[var(--muted)]">
                    {account.email_count || account.total_emails_synced} email
                    {account.unread_count ? ` (${account.unread_count} chưa đọc)` : ''}
                  </p>
                </div>
                {account.sync_error && (
                  <p className="flex items-center gap-1 text-[12px] text-red-500 dark:text-red-400 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {account.sync_error}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Set as Primary */}
                {!account.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(account.id)}
                    className="p-2 text-[var(--muted-foreground)] hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                    title="Đặt làm tài khoản chính"
                  >
                    <Star className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}

                {/* Color picker */}
                <div className="relative group">
                  <button
                    className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors"
                    title="Đổi màu"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: account.color || '#2563EB' }}
                    />
                  </button>
                  <div className="absolute right-0 top-full mt-1 p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="grid grid-cols-4 gap-1">
                      {ACCOUNT_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => handleUpdateColor(account.id, color)}
                          className={cn(
                            "w-6 h-6 rounded-full transition-transform hover:scale-110",
                            account.color === color && "ring-2 ring-offset-2 ring-[var(--primary)]"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sync dropdown */}
                <div className="relative" ref={syncDropdownId === account.id ? dropdownRef : undefined}>
                  <button
                    onClick={() => setSyncDropdownId(syncDropdownId === account.id ? null : account.id)}
                    disabled={syncingId === account.id || account.sync_status === 'syncing'}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors disabled:opacity-50",
                      syncDropdownId === account.id && "bg-[var(--hover)] text-[var(--foreground)]"
                    )}
                    title="Đồng bộ email"
                  >
                    <RefreshCw className={cn("w-4 h-4", (syncingId === account.id || account.sync_status === 'syncing') && "animate-spin")} strokeWidth={1.5} />
                    <ChevronDown className={cn("w-3 h-3 transition-transform", syncDropdownId === account.id && "rotate-180")} strokeWidth={1.5} />
                  </button>

                  {/* Dropdown menu */}
                  {syncDropdownId === account.id && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={() => {
                          setSyncDropdownId(null)
                          handleSync(account.id, false)
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
                      >
                        <div className="font-medium">Sync nhanh</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">100 email mới nhất</div>
                      </button>
                      <button
                        onClick={() => {
                          setSyncDropdownId(null)
                          handleSync(account.id, true)
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
                      >
                        <div className="font-medium">Sync đầy đủ</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">500 email (batch optimized)</div>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setDeleteConfirm({ show: true, account })}
                  className="p-2 text-[var(--muted-foreground)] hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
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
