'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { createClient } from '@/lib/supabase/client'
import {
  clearOfflineVault, offlineScope, openOfflineVault, selectOfflineOwner, watchOfflineScope,
  type OfflineScope, type OfflineVault,
} from '../../../public/offline-workspace/storage.mjs'

export const offlineHome = '/offline-workspace/index.html'

type OfflineState = {
  owner: string
  scope: OfflineScope | null
  vault: OfflineVault | null
  requestVault: () => Promise<OfflineVault | null>
}
const OfflineContext = createContext<OfflineState | null>(null)

export function useOfflineWorkspace() {
  return useContext(OfflineContext)
}

async function installShell() {
  if (!('serviceWorker' in navigator) || !crypto.subtle) throw new Error('Trình duyệt chưa hỗ trợ lưu ngoại tuyến.')
  await navigator.serviceWorker.register('/inbox-offline-sw.js', { scope: '/' })
  const signal = AbortSignal.timeout(10_000)
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Chưa tải được màn hình ngoại tuyến. Hãy thử lại.')), { once: true })
    }),
  ])
}

export function OfflineWorkspaceProvider({ owner, children }: { owner: string; children: ReactNode }) {
  const [scope, setScope] = useState<OfflineScope | null>(null)
  const [vault, setVault] = useState<OfflineVault | null>(null)
  const [dialog, setDialog] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const resolve = useRef<((vault: OfflineVault | null) => void) | null>(null)

  useEffect(() => {
    let active = true
    function apply(current: OfflineScope | null) {
      if (!active) return
      const owned = current?.owner === owner ? current : null
      setScope(owned)
      setVault(previous => previous?.epoch === owned?.epoch ? previous : null)
      if (!owned) {
        resolve.current?.(null)
        resolve.current = null
        setDialog(false)
      }
    }
    if (globalThis.indexedDB && globalThis.crypto?.subtle) {
      void selectOfflineOwner(owner).then(apply).catch(() => apply(null))
    }
    const stopWatching = watchOfflineScope(() => {
      void offlineScope().then(apply).catch(() => apply(null))
    })
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== owner)) {
        apply(null)
        void clearOfflineVault(owner).catch(() => {})
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
      stopWatching()
      resolve.current?.(null)
      resolve.current = null
    }
  }, [owner])

  function requestVault() {
    if (vault) return Promise.resolve(vault)
    if (!scope) return Promise.resolve(null)
    resolve.current?.(null)
    setDialog(true)
    setPassword('')
    setError('')
    return new Promise<OfflineVault | null>(finish => { resolve.current = finish })
  }

  function finish(active: OfflineVault | null) {
    setPassword('')
    setDialog(false)
    resolve.current?.(active)
    resolve.current = null
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !scope) return
    setBusy(true)
    setError('')
    try {
      if (!scope.enrolled) await installShell()
      const active = await openOfflineVault(owner, password, !scope.enrolled)
      setScope({ owner, epoch: active.epoch, enrolled: true })
      setVault(active)
      finish(active)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa mở được kho ngoại tuyến.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <OfflineContext.Provider value={{ owner, scope, vault, requestVault }}>
      {children}
      {dialog && scope && <Modal open title={scope.enrolled ? 'Mở khóa ngoại tuyến' : 'Bật lưu ngoại tuyến'}
        onClose={() => finish(null)} showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={!busy}>
        <form onSubmit={unlock} className="space-y-3">
          {!scope.enrolled && <p className="text-sm text-[var(--foreground-secondary)]">
            Đặt mật khẩu riêng để mở thư đã lưu và bản nháp khi Chrome khởi động lại. Đăng xuất sẽ xóa các bản lưu trên thiết bị này.
          </p>}
          <label className="block text-sm font-medium">
            Mật khẩu ngoại tuyến
            <input type="password" className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 focus-ring"
              value={password} onChange={event => setPassword(event.target.value)} required
              minLength={12} maxLength={128} autoComplete={scope.enrolled ? 'current-password' : 'new-password'} />
          </label>
          {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
          <Button type="submit" loading={busy}>{scope.enrolled ? 'Mở khóa' : 'Bật lưu trên thiết bị'}</Button>
        </form>
      </Modal>}
    </OfflineContext.Provider>
  )
}
