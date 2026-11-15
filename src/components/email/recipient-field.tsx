'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { recipientFragment, recipientQueryLimit, type ComposeRecipient } from '@/lib/compose/recipients'

type Results = { owner: string; account: string; items: ComposeRecipient[] }
type Lookup = { key: string; results?: Results; failed?: boolean }

export function RecipientField({ id, value, onChange, owner, accountId, className, required }: {
  id: string
  value: string
  onChange: (value: string) => void
  owner?: string
  accountId?: string
  className?: string
  required?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState(-1)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [composing, setComposing] = useState(false)
  const selecting = useRef(false)
  const fragment = recipientFragment(value, cursor)
  const query = fragment.query
  const canSearch = open && !signedOut && !composing && owner && accountId && query.length >= 2 && query.length <= recipientQueryLimit
  const key = canSearch ? [owner, accountId, query].join('|') : null
  const result = key && lookup?.key === key ? lookup : null
  const selectedElsewhere = new Set((value.slice(0, fragment.start) + ',' + value.slice(fragment.end))
    .split(',').map(address => address.trim().toLowerCase()))
  const items = result?.results?.items.filter(item => !selectedElsewhere.has(item.address.toLowerCase())) ?? []
  const list = id + '-options'
  const selected = active >= 0 && active < items.length ? active : -1

  useEffect(() => {
    if (!owner) return
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== owner)) {
        setSignedOut(true)
        setLookup(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [owner])

  useEffect(() => {
    if (!key || !accountId) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/compose-recipients?' + new URLSearchParams({ account: accountId, q: query }), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), cache: 'no-store',
        })
        if (!response.ok) throw new Error('Lookup unavailable')
        const results: Results = await response.json()
        if (results.owner === owner && !controller.signal.aborted) setLookup({ key, results })
      } catch {
        if (!controller.signal.aborted) setLookup({ key, failed: true })
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accountId, key, owner, query])

  function select(item: ComposeRecipient) {
    const prefix = value.slice(0, fragment.start).trimEnd()
    const inserted = (prefix ? prefix + ' ' : '') + item.address
    const next = inserted + value.slice(fragment.end)
    if (next.length > 4000) return
    onChange(next)
    setOpen(false)
    setActive(-1)
    requestAnimationFrame(() => input.current?.setSelectionRange(inserted.length, inserted.length))
  }

  return <div className="relative min-w-0 flex-1">
    <input ref={input} id={id} type="text" inputMode="email" role="combobox" autoComplete="off" autoCapitalize="none"
      spellCheck={false} maxLength={4000} aria-autocomplete="list" aria-expanded={items.length > 0}
      aria-controls={items.length > 0 ? list : undefined} aria-activedescendant={selected >= 0 ? list + '-' + selected : undefined}
      required={required} placeholder="email@example.com" value={value} className={cn('w-full', className)}
      onFocus={event => { setCursor(event.currentTarget.selectionStart ?? value.length); setOpen(true); setActive(-1) }}
      onBlur={() => {
        if (selecting.current) return
        setOpen(false)
        setActive(-1)
      }}
      onSelect={event => setCursor(event.currentTarget.selectionStart ?? value.length)}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onChange={event => {
        setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
        onChange(event.currentTarget.value)
        setOpen(true)
        setActive(-1)
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape' && open) {
          setOpen(false)
          setActive(-1)
          event.stopPropagation()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!open) setOpen(true)
          if (!items.length) return
          event.preventDefault()
          const step = event.key === 'ArrowDown' ? 1 : -1
          const next = selected < 0 ? (step === 1 ? 0 : items.length - 1) : (selected + step + items.length) % items.length
          setActive(next)
          document.getElementById(list + '-' + next)?.scrollIntoView({ block: 'nearest' })
        } else if (event.key === 'Enter' && selected >= 0) {
          event.preventDefault()
          select(items[selected])
        }
      }} />
    {items.length > 0 && <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)]">
      <p className="break-words border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground-secondary)]">
        Đã liên hệ từ {result?.results?.account}
      </p>
      <ul id={list} role="listbox" aria-label="Gợi ý người nhận" className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto">
        {items.map((item, index) => <li key={item.address} id={list + '-' + index} role="option"
          aria-selected={index === selected} className={cn('min-h-11 cursor-pointer break-all border-s-2 border-transparent px-3 py-2 text-sm hover:bg-[var(--hover)]',
            index === selected && 'border-s-[var(--accent)] bg-[var(--secondary)]')}
          onPointerDown={event => {
            if (event.pointerType === 'touch') selecting.current = true
          }}
          onPointerUp={() => { selecting.current = false }}
          onPointerLeave={() => { selecting.current = false }}
          onPointerCancel={() => { selecting.current = false }}
          onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>
          {item.name && <span className="block font-semibold">{item.name}</span>}
          <span className={item.name ? 'block text-xs text-[var(--foreground-secondary)]' : 'block'}>{item.address}</span>
        </li>)}
      </ul>
    </div>}
    {result?.failed && <p role="status" className="mt-1 text-xs text-[var(--foreground-secondary)]">Chưa tải được gợi ý. Bạn có thể nhập địa chỉ.</p>}
  </div>
}
