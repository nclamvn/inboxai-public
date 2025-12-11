'use client'

import { useState } from 'react'
import { Mail, Check, Copy } from 'lucide-react'

interface MailboxSectionProps {
  mailboxAddress: string | null
}

export function MailboxSection({ mailboxAddress }: MailboxSectionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (mailboxAddress) {
      navigator.clipboard.writeText(mailboxAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#EBEBEB] p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#F0FDF4] rounded-lg flex items-center justify-center">
          <Mail className="w-5 h-5 text-[#16A34A]" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Địa chỉ InboxAI</h2>
          <p className="text-[14px] text-[#6B6B6B]">Địa chỉ email riêng của bạn trên InboxAI</p>
        </div>
      </div>

      <div className="bg-[#FAFAFA] rounded-lg p-4">
        <p className="text-[14px] text-[#6B6B6B] mb-2">Địa chỉ email InboxAI của bạn</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-white border border-[#EBEBEB] rounded-lg font-mono text-[#1A1A1A]">
            {mailboxAddress || 'Đang tạo...'}
          </code>
          <button
            onClick={handleCopy}
            className="px-3 py-2 text-[14px] text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-lg transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" strokeWidth={1.5} />
                Đã sao chép
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" strokeWidth={1.5} />
                Sao chép
              </>
            )}
          </button>
        </div>
        <p className="text-[12px] text-[#9B9B9B] mt-2">
          Forward email từ Gmail/Outlook đến địa chỉ này để nhận vào InboxAI
        </p>
      </div>
    </section>
  )
}
