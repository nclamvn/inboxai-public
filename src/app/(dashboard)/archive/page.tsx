'use client'

import { useState } from 'react'
import { Archive } from 'lucide-react'
import { useEmails } from '@/hooks/use-emails'
import { EmailList } from '@/components/email/email-list'
import { EmailDetail } from '@/components/email/email-detail'
import type { Email } from '@/types'

export default function ArchivePage() {
  const { emails, loading, toggleStar, deleteEmail, restoreEmail, markAsRead } = useEmails({ folder: 'archive' })
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const handleSelectEmail = (email: Email) => {
    setSelectedEmail(email)
    if (!email.is_read) {
      markAsRead(email.id)
    }
  }

  const handleRestore = () => {
    if (selectedEmail) {
      restoreEmail(selectedEmail.id)
      setSelectedEmail(null)
    }
  }

  const handleDelete = () => {
    if (selectedEmail) {
      deleteEmail(selectedEmail.id)
      setSelectedEmail(null)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--foreground)]"></div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-[var(--secondary)] rounded-full flex items-center justify-center mb-4">
          <Archive className="w-10 h-10 text-[var(--muted)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--foreground)] mb-2">
          Chưa có email lưu trữ
        </h2>
        <p className="text-[var(--muted-foreground)] max-w-md">
          Email được lưu trữ sẽ xuất hiện ở đây. Lưu trữ giúp dọn dẹp hộp thư mà không cần xóa.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Email List */}
      <div className={`${selectedEmail ? 'hidden lg:block lg:w-2/5 xl:w-1/3' : 'w-full'} border-r border-[var(--border)] overflow-auto bg-[var(--card)]`}>
        <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
          <h1 className="text-[18px] font-semibold text-[var(--foreground)]">Lưu trữ</h1>
          <p className="text-[14px] text-[var(--muted-foreground)]">{emails.length} email</p>
        </div>
        <EmailList
          emails={emails}
          selectedId={selectedEmail?.id}
          onSelect={handleSelectEmail}
          onStar={toggleStar}
        />
      </div>

      {/* Email Detail */}
      {selectedEmail && (
        <div className="flex-1 lg:w-3/5 xl:w-2/3">
          <EmailDetail
            email={selectedEmail}
            onClose={() => setSelectedEmail(null)}
            onStar={() => toggleStar(selectedEmail.id)}
            onArchive={handleRestore}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}
