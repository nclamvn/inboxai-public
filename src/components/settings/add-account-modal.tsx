'use client'

import { useState } from 'react'
import { X, Mail, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AddAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const PROVIDERS = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    color: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30',
    instructions: 'Dùng App Password từ Google Account > Security > 2-Step Verification > App passwords'
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail',
    icon: '📨',
    color: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30',
    instructions: 'Dùng mật khẩu thường hoặc App Password'
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    icon: '📩',
    color: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30',
    instructions: 'Dùng App Password từ Yahoo Account > Security'
  },
  {
    id: 'custom',
    name: 'IMAP/SMTP khác',
    icon: '⚙️',
    color: 'bg-[var(--secondary)] border-[var(--border)]',
    instructions: 'Nhập thông tin server thủ công'
  }
]

type Step = 'select-provider' | 'enter-credentials' | 'connecting' | 'success' | 'error'

export function AddAccountModal({ isOpen, onClose, onSuccess }: AddAccountModalProps) {
  const [step, setStep] = useState<Step>('select-provider')
  const [provider, setProvider] = useState<string>('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Custom IMAP/SMTP settings
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')

  const resetForm = () => {
    setStep('select-provider')
    setProvider('')
    setEmail('')
    setPassword('')
    setError(null)
    setImapHost('')
    setImapPort('993')
    setSmtpHost('')
    setSmtpPort('587')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSelectProvider = (providerId: string) => {
    setProvider(providerId)
    setStep('enter-credentials')
  }

  const handleConnect = async () => {
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu')
      return
    }

    setStep('connecting')
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        email_address: email,
        provider,
        username: email,
        password
      }

      // Add custom settings if provider is custom
      if (provider === 'custom') {
        payload.imap_host = imapHost
        payload.imap_port = parseInt(imapPort)
        payload.smtp_host = smtpHost
        payload.smtp_port = parseInt(smtpPort)
      }

      const response = await fetch('/api/source-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Kết nối thất bại')
      }

      setStep('success')
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 1500)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Kết nối thất bại'
      setError(errorMsg)
      setStep('error')
    }
  }

  if (!isOpen) return null

  const selectedProvider = PROVIDERS.find(p => p.id === provider)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-[var(--card)] rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden border border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
            Kết nối tài khoản email
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-[var(--muted)] hover:text-[var(--muted-foreground)] transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Select Provider */}
          {step === 'select-provider' && (
            <div className="space-y-3">
              <p className="text-[14px] text-[var(--muted-foreground)] mb-4">
                Chọn nhà cung cấp email:
              </p>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProvider(p.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-[var(--hover)] ${p.color}`}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <span className="text-[15px] font-medium text-[var(--foreground)]">{p.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Enter Credentials */}
          {step === 'enter-credentials' && selectedProvider && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('select-provider')}
                className="text-[14px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                ← Quay lại
              </button>

              <div className={`flex items-center gap-3 p-3 rounded-lg ${selectedProvider.color}`}>
                <span className="text-xl">{selectedProvider.icon}</span>
                <span className="font-medium text-[var(--foreground)]">{selectedProvider.name}</span>
              </div>

              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-[13px] text-gray-900 dark:text-white">
                {selectedProvider.instructions}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                    Mật khẩu / App Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full px-3 py-2 pr-10 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--muted-foreground)]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Custom IMAP/SMTP fields */}
                {provider === 'custom' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                          IMAP Host
                        </label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={e => setImapHost(e.target.value)}
                          placeholder="imap.example.com"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                          IMAP Port
                        </label>
                        <input
                          type="text"
                          value={imapPort}
                          onChange={e => setImapPort(e.target.value)}
                          placeholder="993"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={e => setSmtpHost(e.target.value)}
                          placeholder="smtp.example.com"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--muted-foreground)] mb-1">
                          SMTP Port
                        </label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={e => setSmtpPort(e.target.value)}
                          placeholder="587"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-red-600 dark:text-red-400 text-[13px]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleConnect}
                className="w-full"
                disabled={!email || !password}
              >
                <Mail className="w-4 h-4 mr-2" />
                Kết nối
              </Button>
            </div>
          )}

          {/* Step 3: Connecting */}
          {step === 'connecting' && (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-[var(--foreground)] animate-spin mb-4" />
              <p className="text-[15px] text-[var(--muted-foreground)]">
                Đang kết nối và xác thực...
              </p>
              <p className="text-[13px] text-[var(--muted)] mt-1">
                Vui lòng đợi trong giây lát
              </p>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="py-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
              <p className="text-[15px] font-medium text-[var(--foreground)]">
                Kết nối thành công!
              </p>
              <p className="text-[13px] text-[var(--muted-foreground)] mt-1">
                Email đã được thêm vào InboxAI
              </p>
            </div>
          )}

          {/* Step 5: Error */}
          {step === 'error' && (
            <div className="py-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <p className="text-[15px] font-medium text-[var(--foreground)] mb-2">
                Kết nối thất bại
              </p>
              {error && (
                <p className="text-[13px] text-red-600 dark:text-red-400 mb-4 px-4">
                  {error}
                </p>
              )}
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={() => setStep('enter-credentials')}>
                  Thử lại
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
