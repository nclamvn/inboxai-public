'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Check, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SourceAccount {
  id: string
  email_address: string
  display_name?: string
  provider: string
  avatar_url?: string
  is_primary: boolean
  color: string
  is_active: boolean
  email_count?: number
  unread_count?: number
}

interface AccountSwitcherProps {
  selectedAccountIds: string[]
  onAccountChange: (accountIds: string[]) => void
  className?: string
}

export function AccountSwitcher({
  selectedAccountIds,
  onAccountChange,
  className
}: AccountSwitcherProps) {
  const [accounts, setAccounts] = useState<SourceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch accounts
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
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleAccount = (accountId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      // Remove account
      const newIds = selectedAccountIds.filter(id => id !== accountId)
      onAccountChange(newIds)
    } else {
      // Add account
      onAccountChange([...selectedAccountIds, accountId])
    }
  }

  const selectAll = () => {
    onAccountChange([]) // Empty array means "all accounts"
  }

  const isAllSelected = selectedAccountIds.length === 0

  // Get display label
  const getDisplayLabel = () => {
    if (isAllSelected || selectedAccountIds.length === 0) {
      return 'Tất cả tài khoản'
    }
    if (selectedAccountIds.length === 1) {
      const account = accounts.find(a => a.id === selectedAccountIds[0])
      return account?.display_name || account?.email_address || 'Tài khoản'
    }
    return `${selectedAccountIds.length} tài khoản`
  }

  // Get selected accounts for avatar display
  const selectedAccounts = selectedAccountIds.length > 0
    ? accounts.filter(a => selectedAccountIds.includes(a.id))
    : []

  if (loading) {
    return (
      <div className={cn("h-9 w-40 bg-[var(--secondary)] rounded-lg animate-pulse", className)} />
    )
  }

  if (accounts.length <= 1) {
    // Don't show switcher if only one account
    return null
  }

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--hover)] transition-colors",
          isOpen && "bg-[var(--hover)]"
        )}
      >
        {/* Avatar stack */}
        <div className="flex -space-x-2">
          {selectedAccounts.length > 0 ? (
            selectedAccounts.slice(0, 3).map((account, index) => (
              <div
                key={account.id}
                className="w-6 h-6 rounded-full border-2 border-[var(--card)] flex items-center justify-center text-white text-[10px] font-medium"
                style={{ backgroundColor: account.color, zIndex: 3 - index }}
              >
                {account.avatar_url ? (
                  <img src={account.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  account.email_address[0].toUpperCase()
                )}
              </div>
            ))
          ) : (
            <div className="w-6 h-6 rounded-full bg-[var(--primary)] flex items-center justify-center">
              <Mail className="w-3 h-3 text-white" />
            </div>
          )}
          {selectedAccounts.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-[var(--muted)] border-2 border-[var(--card)] flex items-center justify-center text-[10px] font-medium text-[var(--muted-foreground)]">
              +{selectedAccounts.length - 3}
            </div>
          )}
        </div>

        <span className="text-[13px] text-[var(--foreground)] font-medium">
          {getDisplayLabel()}
        </span>

        <ChevronDown className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
          {/* All accounts option */}
          <button
            onClick={() => {
              selectAll()
              setIsOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--hover)] transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--primary)] flex items-center justify-center">
              <Mail className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[13px] font-medium text-[var(--foreground)]">Tất cả tài khoản</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {accounts.reduce((sum, a) => sum + (a.email_count || 0), 0)} email
              </p>
            </div>
            {isAllSelected && (
              <Check className="w-4 h-4 text-[var(--primary)]" />
            )}
          </button>

          <div className="border-t border-[var(--border)] my-1" />

          {/* Individual accounts */}
          {accounts.map(account => {
            const isSelected = selectedAccountIds.includes(account.id)
            return (
              <button
                key={account.id}
                onClick={() => toggleAccount(account.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--hover)] transition-colors"
              >
                <div className="relative">
                  {account.avatar_url ? (
                    <img
                      src={account.avatar_url}
                      alt={account.display_name || account.email_address}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                      style={{ backgroundColor: account.color }}
                    >
                      {account.email_address[0].toUpperCase()}
                    </div>
                  )}
                  {/* Color indicator */}
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[var(--card)]"
                    style={{ backgroundColor: account.color }}
                  />
                </div>

                <div className="flex-1 text-left min-w-0">
                  <p className="text-[13px] font-medium text-[var(--foreground)] truncate">
                    {account.display_name || account.email_address}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                    {account.email_count || 0} email
                    {account.unread_count ? ` (${account.unread_count} mới)` : ''}
                  </p>
                </div>

                {isSelected && (
                  <Check className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
