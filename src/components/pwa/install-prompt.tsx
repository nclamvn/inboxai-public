'use client'

import { useState, useEffect } from 'react'
import { Download, X, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches

    // Check for iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)

    // Batch state updates
    setIsStandalone(standalone)
    setIsIOS(ios)

    // Check if prompt was dismissed recently
    const dismissed = localStorage.getItem('pwa-prompt-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed)
      // Don't show for 7 days after dismissal
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return
      }
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show prompt after a delay
      setTimeout(() => setShowPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // For iOS, show custom prompt after delay
    if (ios && !standalone) {
      setTimeout(() => setShowPrompt(true), 5000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setShowPrompt(false)
      }
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString())
  }

  // Don't show if already installed or prompt not ready
  if (isStandalone || (!deferredPrompt && !isIOS) || !showPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slideUp">
      <div className={cn(
        'bg-[var(--card)] rounded-xl shadow-lg border border-[var(--border)]',
        'p-4 flex items-start gap-3'
      )}>
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
            Cài đặt ứng dụng
          </h3>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
            {isIOS
              ? 'Nhấn vào nút Share rồi chọn "Add to Home Screen"'
              : 'Thêm AI Mailbox vào màn hình chính để truy cập nhanh hơn'
            }
          </p>

          {/* Actions */}
          {!isIOS && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-4 py-2 bg-blue-600 text-white text-[13px] font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Cài đặt
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Để sau
              </button>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="p-1 -mt-1 -mr-1 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted-foreground)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
