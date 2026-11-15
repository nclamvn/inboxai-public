'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Paperclip, FileText, Image, FileSpreadsheet,
  File, Download, Eye, X
} from 'lucide-react'
import { isPurchaseCsv } from '@/lib/commitments/purchase-csv'
import { cn } from '@/lib/utils'
import { isRasterPreviewType } from '@/lib/email/attachment-preview'

export interface Attachment {
  id: string
  filename: string
  content_type: string | null
  size: number
  is_inline: boolean
}

interface AttachmentListProps {
  attachments: Attachment[]
  purchaseEmailId?: string
}

// Get icon based on content type
function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return Image
  if (contentType.includes('pdf')) return FileText
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return FileSpreadsheet
  if (contentType.includes('document') || contentType.includes('word')) return FileText
  return File
}

// Get color based on content type
function getFileColor(contentType: string) {
  if (contentType.startsWith('image/')) return 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
  if (contentType.includes('pdf')) return 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
  if (contentType.includes('document') || contentType.includes('word')) return 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
  return 'bg-[var(--secondary)] text-[var(--muted-foreground)]'
}

// Format file size
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentList({ attachments, purchaseEmailId }: AttachmentListProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>('')

  // Filter out inline attachments (shown in email body)
  const visibleAttachments = attachments.filter(a => !a.is_inline)

  if (visibleAttachments.length === 0) return null

  const handlePreview = (attachment: Attachment) => {
    setPreviewUrl(`/api/attachments/${attachment.id}`)
    setPreviewName(attachment.filename)
  }

  const handleDownload = (attachment: Attachment) => {
    const link = document.createElement('a')
    link.href = `/api/attachments/${attachment.id}`
    link.download = attachment.filename
    link.click()
  }

  const closePreview = () => {
    setPreviewUrl(null)
    setPreviewName('')
  }

  return (
    <>
      {/* Attachment List */}
      <div className="border-t border-[var(--border)] mt-4 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className="w-4 h-4 text-[var(--muted)]" />
          <span className="text-[13px] font-medium text-[var(--muted)]">
            {visibleAttachments.length} tệp đính kèm
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleAttachments.map((att) => {
            const type = att.content_type?.toLowerCase() ?? ''
            const Icon = getFileIcon(type)
            const colorClass = getFileColor(type)
            const isPreviewable = isRasterPreviewType(type)

            return (
              <div
                key={att.id}
                className="group flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-[var(--secondary)] px-3 py-2 transition-colors hover:bg-[var(--border)]"
              >
                {/* Icon */}
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--foreground)] truncate max-w-[150px]">
                    {att.filename}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {formatSize(att.size)}
                  </div>
                </div>

                {/* Actions */}
                <div className={cn('ml-2 flex min-w-0 items-center gap-1', !(purchaseEmailId && isPurchaseCsv(att.filename, type)) &&
                  'sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity')}>
                  {purchaseEmailId && isPurchaseCsv(att.filename, type) && (
                    <div className="flex flex-wrap items-center">
                      <Link href={'/commitments/purchase-csv?' + new URLSearchParams({ email: purchaseEmailId, file: att.id })}
                        prefetch={false} aria-label={'Đối soát CSV · ' + att.filename} className="neo-target inline-flex min-h-11 items-center px-2 text-xs font-medium text-[var(--accent-foreground)] underline">
                        Đối soát CSV
                      </Link>
                      <Link href={'/commitments/payment?' + new URLSearchParams({ email: purchaseEmailId, file: att.id })}
                        prefetch={false} aria-label={'Bảng giá hoặc hóa đơn · ' + att.filename}
                        className="neo-target inline-flex min-h-11 items-center px-2 text-xs font-medium text-[var(--accent-foreground)] underline">
                        Bảng giá / hóa đơn
                      </Link>
                      <Link href={'/commitments/settlements?' + new URLSearchParams({ email: purchaseEmailId, file: att.id })}
                        prefetch={false} aria-label={'Đối soát thanh toán · ' + att.filename}
                        className="neo-target inline-flex min-h-11 items-center px-2 text-xs font-medium text-[var(--accent-foreground)] underline">
                        Thanh toán
                      </Link>
                    </div>
                  )}
                  {isPreviewable && (
                    <button
                      onClick={() => handlePreview(att)}
                      type="button"
                      className="neo-icon-button"
                      title="Xem trước"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(att)}
                    type="button"
                      className="neo-icon-button"
                    title="Tải xuống"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          {/* Close button */}
          <button
            onClick={closePreview}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Filename */}
          <div className="absolute top-4 left-4 text-white text-[14px] font-medium">
            {previewName}
          </div>

          {/* Download button */}
          <a
            href={previewUrl}
            download={previewName}
            className="absolute top-4 right-16 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <Download className="w-6 h-6" />
          </a>

          {/* Preview content */}
          <div className="max-w-full max-h-full overflow-auto">
            <img
              src={`${previewUrl}?preview=1`}
              alt={previewName}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
