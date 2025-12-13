'use client'

import { useState } from 'react'
import { Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react'
import { useEmails } from '@/hooks/use-emails'
import { EmailList } from '@/components/email/email-list'
import { EmailDetail } from '@/components/email/email-detail'
import type { Email } from '@/types'

export default function TrashPage() {
  const { emails, loading, toggleStar, restoreEmail, permanentDelete, emptyTrash } = useEmails({ folder: 'trash' })
  const [isEmptying, setIsEmptying] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const handleRestore = () => {
    if (selectedEmail) {
      restoreEmail(selectedEmail.id)
      setSelectedEmail(null)
    }
  }

  const handlePermanentDelete = () => {
    if (selectedEmail && confirm('Xóa vĩnh viễn email này? Hành động này không thể hoàn tác.')) {
      permanentDelete(selectedEmail.id)
      setSelectedEmail(null)
    }
  }

  const handleEmptyTrash = async () => {
    if (confirm(`Xóa vĩnh viễn ${emails.length} email? Hành động này không thể hoàn tác.`)) {
      setIsEmptying(true)
      await emptyTrash()
      setIsEmptying(false)
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
          <Trash2 className="w-10 h-10 text-[var(--muted)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--foreground)] mb-2">
          Thùng rác trống
        </h2>
        <p className="text-[var(--muted-foreground)] max-w-md">
          Email đã xóa sẽ được lưu ở đây trong 30 ngày trước khi bị xóa vĩnh viễn.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Email List */}
      <div className={`${selectedEmail ? 'hidden lg:block lg:w-2/5 xl:w-1/3' : 'w-full'} border-r border-[var(--border)] overflow-auto bg-[var(--card)]`}>
        <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[18px] font-semibold text-[var(--foreground)]">Thùng rác</h1>
              <p className="text-[14px] text-[var(--muted-foreground)]">{emails.length} email • Tự động xóa sau 30 ngày</p>
            </div>
            <button
              onClick={handleEmptyTrash}
              disabled={isEmptying || emails.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-[14px] font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isEmptying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang xóa...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Xóa tất cả
                </>
              )}
            </button>
          </div>
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
          <div className="h-full flex flex-col bg-[var(--card)]">
            {/* Custom header for trash */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-red-50 dark:bg-red-500/10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-lg transition-colors"
                  title="Đóng"
                >
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
                <div>
                  <h2 className="font-semibold text-[var(--foreground)]">{selectedEmail.subject || '(Không có tiêu đề)'}</h2>
                  <p className="text-[14px] text-red-600 dark:text-red-400">Email này đang ở thùng rác</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  Khôi phục
                </button>
                <button
                  onClick={handlePermanentDelete}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>

            {/* Email content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-[var(--muted)] rounded-full flex items-center justify-center text-white font-medium">
                  {(selectedEmail.from_name || selectedEmail.from_address || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">{selectedEmail.from_name || selectedEmail.from_address}</p>
                  <p className="text-[14px] text-[var(--muted-foreground)]">{selectedEmail.from_address}</p>
                </div>
              </div>
              <div className="prose dark:prose-invert max-w-none opacity-75">
                <pre className="whitespace-pre-wrap font-sans text-[var(--muted-foreground)]">
                  {selectedEmail.body_text || selectedEmail.snippet || '(Không có nội dung)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
