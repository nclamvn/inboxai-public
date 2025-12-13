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
    <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
          <Mail className="w-5 h-5 text-green-600 dark:text-green-400" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Địa chỉ InboxAI</h2>
          <p className="text-[14px] text-[var(--muted-foreground)]">Địa chỉ email riêng của bạn trên InboxAI</p>
        </div>
      </div>

      <div className="bg-[var(--secondary)] rounded-lg p-4">
        <p className="text-[14px] text-[var(--muted-foreground)] mb-2">Địa chỉ email InboxAI của bạn</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg font-mono text-[var(--foreground)]">
            {mailboxAddress || 'Đang tạo...'}
          </code>
          <button
            onClick={handleCopy}
            className="px-3 py-2 text-[14px] text-[var(--foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors flex items-center gap-1"
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
        <p className="text-[12px] text-[var(--muted)] mt-2">
          Forward email từ Gmail/Outlook đến địa chỉ này để nhận vào InboxAI
        </p>
      </div>
    </section>
  )
}
