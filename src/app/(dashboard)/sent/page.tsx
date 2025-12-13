'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { useEmails } from '@/hooks/use-emails'
import { EmailList } from '@/components/email/email-list'
import { EmailDetail } from '@/components/email/email-detail'
import type { Email } from '@/types'

export default function SentPage() {
  const { emails, loading, toggleStar, archiveEmail, deleteEmail } = useEmails({ folder: 'sent' })
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const handleArchive = () => {
    if (selectedEmail) {
      archiveEmail(selectedEmail.id)
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
      <div className="h-full flex items-center justify-center bg-[var(--background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--foreground)]"></div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[var(--background)]">
        <div className="w-20 h-20 bg-[var(--secondary)] rounded-full flex items-center justify-center mb-4">
          <Send className="w-10 h-10 text-[var(--muted)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--foreground)] mb-2">
          Chưa có email đã gửi
        </h2>
        <p className="text-[var(--muted-foreground)] max-w-md">
          Email bạn gửi đi sẽ xuất hiện ở đây.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Email List */}
      <div className={`${selectedEmail ? 'hidden lg:block lg:w-2/5 xl:w-1/3' : 'w-full'} border-r border-[var(--border)] overflow-auto bg-[var(--card)]`}>
        <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
          <h1 className="text-[18px] font-semibold text-[var(--foreground)]">Đã gửi</h1>
          <p className="text-[14px] text-[var(--muted-foreground)]">{emails.length} email</p>
        </div>
        <EmailList
          emails={emails}
          selectedId={selectedEmail?.id}
          onSelect={setSelectedEmail}
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
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}
