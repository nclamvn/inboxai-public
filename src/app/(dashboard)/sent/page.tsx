'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send } from 'lucide-react'
import { useEmailDetailQuery } from '@/hooks/use-emails-query'
import { useEmails } from '@/hooks/use-emails'
import { EmailList } from '@/components/email/email-list'
import { EmailDetail } from '@/components/email/email-detail'
import type { Email } from '@/types'

export default function SentPage() {
  const { userId, emails, loading, markAsRead, toggleStar, archiveEmail, deleteEmail } = useEmails({ folder: 'sent' })
  const router = useRouter()
  const selectedId = useSearchParams().get('email')
  const { data: detail, isPending: opening, isError, refetch } = useEmailDetailQuery(selectedId, userId)
  const selectedEmail = detail && !detail.is_deleted && !detail.provider_deleted ? detail : null
  const unavailable = isError || (detail && !selectedEmail) || !userId
  const lastOpened = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedId) lastOpened.current = null
    if (!selectedEmail || selectedEmail.direction !== 'inbound' || lastOpened.current === selectedEmail.id) return
    lastOpened.current = selectedEmail.id
    if (!selectedEmail.is_read) void markAsRead(selectedEmail.id, selectedEmail).then(() => refetch())
  }, [selectedId, selectedEmail, markAsRead, refetch])
  const close = () => router.push('/sent', { scroll: false })
  const select = (email: Email) => router.push('/sent?email=' + encodeURIComponent(email.id), { scroll: false })

  const handleArchive = () => {
    if (selectedEmail) {
      void archiveEmail(selectedEmail.id, selectedEmail)
      close()
    }
  }

  const handleDelete = () => {
    if (selectedEmail) {
      void deleteEmail(selectedEmail.id)
      close()
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--foreground)]"></div>
      </div>
    )
  }

  if (emails.length === 0 && !selectedId) {
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
      <div className={`${selectedId ? 'hidden lg:block lg:w-2/5 xl:w-1/3' : 'w-full'} border-r border-[var(--border)] overflow-auto bg-[var(--card)]`}>
        <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
          <h1 className="text-[18px] font-semibold text-[var(--foreground)]">Đã gửi</h1>
          <p className="text-[14px] text-[var(--muted-foreground)]">{emails.length} email</p>
        </div>
        <EmailList
          emails={emails}
          selectedId={selectedId ?? undefined}
          onSelect={select}
          onStar={toggleStar}
        />
      </div>

      {selectedId && opening && !unavailable && <p role="status" className="p-5 text-sm">Đang mở thư…</p>}
      {selectedId && unavailable && !selectedEmail && <div className="space-y-2 p-5 text-sm">
        <p role="alert">Chưa thể mở thư này.</p>
        <button type="button" onClick={close} className="neo-target text-[var(--accent-foreground)] underline">Về Đã gửi</button>
      </div>}
      {selectedEmail && (
        <div className="min-w-0 flex-1 lg:w-3/5 xl:w-2/3">
          <EmailDetail
            email={selectedEmail}
            conversationFolder="sent"
            onClose={close}
            onStar={() => void toggleStar(selectedEmail.id, selectedEmail).then(() => refetch())}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}
