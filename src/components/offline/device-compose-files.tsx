'use client'

import { useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ComposeFileList } from '@/components/email/compose-files'
import type { DeviceFile } from '../../../public/offline-workspace/compose.mjs'

export function DeviceComposeFiles({ files, busy, attach, remove }: {
  files: DeviceFile[]
  busy: boolean
  attach: (files: File[]) => Promise<void>
  remove: (id: string) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  return <div className="space-y-2">
    <input ref={picker} type="file" multiple hidden aria-label="Chọn tệp đính kèm" disabled={busy} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''
      if (files.length) void attach(files)
    }} />
    <Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={() => picker.current?.click()}
      leftIcon={<Paperclip size={16} aria-hidden="true" />}>Đính kèm tệp trên thiết bị</Button>
    <ComposeFileList files={files} onRemove={busy ? undefined : remove} />
  </div>
}
