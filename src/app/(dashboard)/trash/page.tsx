'use client'

import { useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import { useEmails } from '@/hooks/use-emails'
import { EmailList } from '@/components/email/email-list'
import { EmailDetail } from '@/components/email/email-detail'
import type { Email } from '@/types'

export default function TrashPage() {
  const { emails, loading, toggleStar, restoreEmail, permanentDelete } = useEmails({ folder: 'trash' })
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1A1A]"></div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-[#F5F5F5] rounded-full flex items-center justify-center mb-4">
          <Trash2 className="w-10 h-10 text-[#9B9B9B]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">
          Thùng rác trống
        </h2>
        <p className="text-[#6B6B6B] max-w-md">
          Email đã xóa sẽ được lưu ở đây trong 30 ngày trước khi bị xóa vĩnh viễn.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Email List */}
      <div className={`${selectedEmail ? 'hidden lg:block lg:w-2/5 xl:w-1/3' : 'w-full'} border-r border-[#EBEBEB] overflow-auto bg-white`}>
        <div className="p-4 border-b border-[#EBEBEB] sticky top-0 bg-white z-10">
          <h1 className="text-[18px] font-semibold text-[#1A1A1A]">Thùng rác</h1>
          <p className="text-[14px] text-[#6B6B6B]">{emails.length} email • Tự động xóa sau 30 ngày</p>
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
          <div className="h-full flex flex-col bg-white">
            {/* Custom header for trash */}
            <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB] bg-[#FEF2F2]">
              <div>
                <h2 className="font-semibold text-[#1A1A1A]">{selectedEmail.subject || '(Không có tiêu đề)'}</h2>
                <p className="text-[14px] text-[#DC2626]">Email này đang ở thùng rác</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-[#EBEBEB] rounded-lg text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  Khôi phục
                </button>
                <button
                  onClick={handlePermanentDelete}
                  className="flex items-center gap-2 px-3 py-2 bg-[#DC2626] text-white rounded-lg hover:bg-[#B91C1C] transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>

            {/* Email content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-[#9B9B9B] rounded-full flex items-center justify-center text-white font-medium">
                  {(selectedEmail.from_name || selectedEmail.from_address || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-[#1A1A1A]">{selectedEmail.from_name || selectedEmail.from_address}</p>
                  <p className="text-[14px] text-[#6B6B6B]">{selectedEmail.from_address}</p>
                </div>
              </div>
              <div className="prose max-w-none opacity-75">
                <pre className="whitespace-pre-wrap font-sans text-[#6B6B6B]">
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
