import { ComposeFileList } from '@/components/email/compose-files'
import type { DeviceFile } from '../../../public/offline-workspace/compose.mjs'

export function DraftVersion({ label, fields, files = [], account }: {
  label: string
  fields: { to: string; cc: string; body: string; subject?: string }
  files?: DeviceFile[]
  account?: string
}) {
  return <div className="min-w-0 space-y-2 border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
    <h3 className="font-semibold">{label}</h3>
    <dl className="space-y-1 break-words">
      {account && <div><dt className="inline font-medium">Gửi từ </dt><dd className="inline">{account}</dd></div>}
      <div><dt className="inline font-medium">Người nhận </dt><dd className="inline">{fields.to || 'Chưa nhập'}</dd></div>
      {fields.cc && <div><dt className="inline font-medium">Cc </dt><dd className="inline">{fields.cc}</dd></div>}
      {fields.subject && <div><dt className="inline font-medium">Tiêu đề </dt><dd className="inline">{fields.subject}</dd></div>}
    </dl>
    <ComposeFileList files={files} />
    <details open className="min-w-0">
      <summary className="min-h-8 cursor-pointer font-medium focus-ring">Nội dung</summary>
      <p className="whitespace-pre-wrap break-words">{fields.body || 'Chưa có nội dung thư.'}</p>
    </details>
  </div>
}
