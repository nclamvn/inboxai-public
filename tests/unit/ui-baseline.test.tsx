// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useHydrated } from '@/hooks/use-hydrated'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { OfflineBanner } from '@/components/offline-banner'
import { AISummary } from '@/components/email/ai-summary'
import { ThemeProvider, useTheme } from '@/contexts/theme-context'
import { Modal } from '@/components/ui/modal'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AutoSyncProvider } from '@/providers/auto-sync-provider'

const media = new Map<string, { matches: boolean; target: EventTarget }>()
beforeEach(() => {
  media.clear()
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('matchMedia', (query: string) => {
    if (!media.has(query)) media.set(query, { matches: false, target: new EventTarget() })
    const m = media.get(query)!
    return {
      get matches() { return m.matches }, media: query,
      addEventListener: m.target.addEventListener.bind(m.target),
      removeEventListener: m.target.removeEventListener.bind(m.target),
    }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('has a deterministic hydration snapshot for SSR and client render', () => {
  function State() { return <span>{String(useHydrated())}</span> }
  expect(renderToString(<State />)).toContain('false')
  render(<State />)
  expect(screen.getByText('true')).toBeTruthy()
})

it('subscribes to media changes and reads a new query immediately on rerender', () => {
  const hook = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: '(min-width: 768px)' } })
  expect(hook.result.current).toBe(false)
  act(() => { const m = media.get('(min-width: 768px)')!; m.matches = true; m.target.dispatchEvent(new Event('change')) })
  expect(hook.result.current).toBe(true)
  hook.rerender({ query: '(max-width: 500px)' })
  expect(hook.result.current).toBe(false)
})

it('tracks offline/reconnection and clears the transient reconnection state', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNetworkStatus())
  act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')) })
  expect(result.current.isOnline).toBe(false)
  act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')) })
  expect(result.current.wasOffline).toBe(true)
  act(() => vi.advanceTimersByTime(3000))
  expect(result.current.wasOffline).toBe(false)
})

it('shows offline and reconnection status through the accessible banner', () => {
  vi.useFakeTimers()
  render(<OfflineBanner />)
  act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')) })
  expect(screen.getByRole('status').textContent).toContain('offline')
  act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')) })
  expect(screen.getByRole('status').textContent).toContain('Đã kết nối lại')
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.queryByRole('status')).toBeNull()
})

it('keeps failed background sync attempts on the configured polling cadence', async () => {
  vi.useFakeTimers()
  const request = vi.fn(async () => new Response(null, { status: 503 }))
  vi.stubGlobal('fetch', request)
  const queryClient = new QueryClient()
  render(<QueryClientProvider client={queryClient}><AutoSyncProvider>Inbox</AutoSyncProvider></QueryClientProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(request).toHaveBeenCalledTimes(1)
  act(() => { window.dispatchEvent(new Event('focus')) })
  await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(50_000) })
  expect(request).toHaveBeenCalledTimes(2)
})

it('summary can cross hidden/visible states without changing hook order', () => {
  const view = render(<AISummary emailId="synthetic" category="spam" existingSummary="Evidence summary" />)
  expect(screen.queryByText('Evidence summary')).toBeNull()
  view.rerender(<AISummary emailId="synthetic" category="work" existingSummary="Evidence summary" />)
  expect(screen.getByText('Evidence summary')).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})

it('preserves stored theme and manual toggle behavior', () => {
  localStorage.setItem('inboxai-theme-mode', 'dark')
  function Toggle() { const theme = useTheme(); return <button onClick={theme.toggle}>{theme.theme}</button> }
  render(<ThemeProvider><Toggle /></ThemeProvider>)
  expect(screen.getByRole('button').textContent).toBe('dark')
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('button').textContent).toBe('light')
  expect(localStorage.getItem('inboxai-theme-mode')).toBe('light')
})

it('hydrates a deterministic theme snapshot before applying the stored dark setting', () => {
  localStorage.setItem('inboxai-theme-mode', 'dark')
  function State() { const { theme } = useTheme(); return <span>{theme}</span> }
  const ui = <ThemeProvider><State /></ThemeProvider>
  const container = document.createElement('div')
  container.innerHTML = renderToString(ui)
  expect(container.textContent).toBe('light')
  const onRecoverableError = vi.fn()
  render(ui, { container, hydrate: true, onRecoverableError })
  expect(container.textContent).toBe('dark')
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it('portals a labelled dialog and honors native cancellation settings', () => {
  // jsdom lacks the top-layer API. Chromium rehearsal exercises real focus and Escape.
  const prototype = HTMLDialogElement.prototype
  const original = Object.getOwnPropertyDescriptors(prototype)
  Object.defineProperties(prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
  })
  try {
    const onClose = vi.fn()
    const view = render(<Modal open onClose={onClose} title="Synthetic modal">Content</Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Synthetic modal' })
    expect(view.container.contains(dialog)).toBe(false)
    expect(dialog.textContent).toContain('Content')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
    view.rerender(<Modal open onClose={onClose} title="Synthetic modal" closeOnEscape={false}>Content</Modal>)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
  } finally {
    for (const method of ['showModal', 'close']) {
      if (original[method]) Object.defineProperty(prototype, method, original[method])
      else Reflect.deleteProperty(prototype, method)
    }
  }
})

it('install-prompt cleanup cancels a pending event timer', () => {
  vi.useFakeTimers()
  const view = render(<InstallPrompt />)
  act(() => window.dispatchEvent(new Event('beforeinstallprompt')))
  expect(vi.getTimerCount()).toBe(1)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
