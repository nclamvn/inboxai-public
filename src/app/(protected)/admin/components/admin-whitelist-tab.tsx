'use client'

import { memo, useCallback } from 'react'
import { Users, UserCheck, UserX, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WhitelistEntry {
  id: string
  email: string
  notes?: string
  is_active: boolean
  created_at: string
}

interface AdminWhitelistTabProps {
  whitelist: WhitelistEntry[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export const AdminWhitelistTab = memo(function AdminWhitelistTab({
  whitelist,
  onToggle,
  onDelete,
}: AdminWhitelistTabProps) {
  const formatDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [])

  if (whitelist.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--muted)]">
        <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>Danh sách trống</p>
      </div>
    )
  }

  return (
    <>
      {whitelist.map((entry) => (
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
                    Không hoạt động
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
                onClick={() => onToggle(entry.id)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  entry.is_active
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--hover)]'
                )}
                title={entry.is_active ? 'Vô hiệu hoá' : 'Kích hoạt'}
              >
                {entry.is_active ? (
                  <UserCheck className="w-4 h-4" />
                ) : (
                  <UserX className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => onDelete(entry.id)}
                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                title="Xoá"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  )
})

export default AdminWhitelistTab
