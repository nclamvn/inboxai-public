'use client'

import { memo, useCallback } from 'react'
import { Clock, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccessRequest {
  id: string
  email: string
  full_name: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at?: string
}

interface AdminRequestsTabProps {
  requests: AccessRequest[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export const AdminRequestsTab = memo(function AdminRequestsTab({
  requests,
  onApprove,
  onReject,
}: AdminRequestsTabProps) {
  const formatDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [])

  if (requests.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--muted)]">
        <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>Khong co yeu cau nao</p>
      </div>
    )
  }

  return (
    <>
      {requests.map((request) => (
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
                  {`"${request.reason}"`}
                </p>
              )}
              <p className="text-[12px] text-[var(--muted-foreground)] mt-2">
                {formatDate(request.created_at)}
              </p>
            </div>
            {request.status === 'pending' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onApprove(request.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-[13px] font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Duyet
                </button>
                <button
                  onClick={() => onReject(request.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-[13px] font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Tu choi
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  )
})

export default AdminRequestsTab
