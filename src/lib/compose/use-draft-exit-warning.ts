'use client'

import { useEffect } from 'react'

export function useDraftExitWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    function beforeLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.download || (link.target && link.target !== '_self')) return
      const target = new URL(link.href)
      if (target.origin !== location.origin || (target.pathname === location.pathname && target.search === location.search)) return
      if (!window.confirm('Rời trang khi bản nháp còn thay đổi chưa lưu?')) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', beforeLink, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', beforeLink, true)
    }
  }, [unsaved])
}
