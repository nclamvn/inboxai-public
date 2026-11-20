'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Command, Search, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { primaryDestinations, mailDestinations, toolDestinations } from './navigation'

const destinations = [{ href: '/compose', icon: Pencil, label: 'Soạn thư' }, ...primaryDestinations, ...mailDestinations, ...toolDestinations]
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()

export function WorkspaceMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'j' && !event.isComposing) {
        if (document.querySelector('dialog[open]:not(.neo-quick-navigation-dialog)')) return
        event.preventDefault()
        setQuery('')
        setOpen(value => !value)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const close = () => { setOpen(false); setQuery('') }
  const results = destinations.filter(item => normalize(item.label).includes(normalize(query)))
  return <>
    <button type="button" aria-label="Đi đến nhanh" aria-keyshortcuts="Control+j Meta+j" title="Đi đến nhanh · ⌘/Ctrl J"
      onClick={() => { setQuery(''); setOpen(true) }} className="neo-quick-launch neo-target">
      <Command size={17} strokeWidth={1.6} aria-hidden="true" />
      {!compact && <><span>Đi đến nhanh</span><kbd>⌘ J</kbd></>}
    </button>
    <Modal open={open} onClose={close} title="Đi đến nhanh" size="md" className="neo-quick-navigation-dialog">
      <div className="neo-command-search"><Search size={18} aria-hidden="true" />
        <input type="search" autoFocus aria-label="Tìm màn hình" placeholder="Hộp thư, bản nháp, cam kết…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }} />
      </div>
      <p className="my-3 text-xs text-[var(--foreground-muted)]">Chọn màn hình để mở. Không thực hiện hành động trên thư.</p>
      <ul className="neo-command-results">
        {results.map(({ href, icon: Icon, label }) => <li key={href}>
          <Link href={href} onClick={close} className="neo-target"><Icon size={18} aria-hidden="true" />{label}</Link>
        </li>)}
      </ul>
      {!results.length && <p role="status" className="py-4 text-sm">Không tìm thấy màn hình. Thử tên khác.</p>}
    </Modal>
  </>
}
