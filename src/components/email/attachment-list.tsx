'use client'

import { useState } from 'react'
import {
  Paperclip, FileText, Image, FileSpreadsheet,
  File, Download, Eye, X, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Attachment {
  id: string
  filename: string
  content_type: string
  size: number
  is_inline: boolean
}

interface AttachmentListProps {
  attachments: Attachment[]
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
  if (contentType.startsWith('image/')) return 'bg-purple-100 text-purple-600'
  if (contentType.includes('pdf')) return 'bg-red-100 text-red-600'
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'bg-green-100 text-green-600'
  if (contentType.includes('document') || contentType.includes('word')) return 'bg-blue-100 text-blue-600'
  return 'bg-gray-100 text-gray-600'
}

// Format file size
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentList({ attachments }: AttachmentListProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>('')
  const [previewType, setPreviewType] = useState<string>('')
  const [loading, setLoading] = useState<string | null>(null)

  // Filter out inline attachments (shown in email body)
  const visibleAttachments = attachments.filter(a => !a.is_inline)

  if (visibleAttachments.length === 0) return null

  const handlePreview = async (attachment: Attachment) => {
    if (!attachment.content_type.startsWith('image/') && !attachment.content_type.includes('pdf')) {
      // Direct download for non-previewable files
      handleDownload(attachment)
      return
    }

    setLoading(attachment.id)
    try {
      const url = `/api/attachments/${attachment.id}`
      setPreviewUrl(url)
      setPreviewName(attachment.filename)
      setPreviewType(attachment.content_type)
    } finally {
      setLoading(null)
    }
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
    setPreviewType('')
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
            const Icon = getFileIcon(att.content_type)
            const colorClass = getFileColor(att.content_type)
            const isPreviewable = att.content_type.startsWith('image/') || att.content_type.includes('pdf')

            return (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-2 bg-[#F5F5F5] rounded-lg hover:bg-[#EBEBEB] transition-colors group"
              >
                {/* Icon */}
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#1A1A1A] truncate max-w-[150px]">
                    {att.filename}
                  </div>
                  <div className="text-[11px] text-[#9B9B9B]">
                    {formatSize(att.size)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isPreviewable && (
                    <button
                      onClick={() => handlePreview(att)}
                      disabled={loading === att.id}
                      className="p-1.5 rounded-lg hover:bg-white text-[#6B6B6B]"
                      title="Xem trước"
                    >
                      {loading === att.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(att)}
                    className="p-1.5 rounded-lg hover:bg-white text-[#6B6B6B]"
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
            {previewType.includes('pdf') ? (
              <iframe
                src={previewUrl}
                className="w-[90vw] h-[85vh] bg-white rounded-lg"
                title={previewName}
              />
            ) : (
              <img
                src={previewUrl}
                alt={previewName}
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
