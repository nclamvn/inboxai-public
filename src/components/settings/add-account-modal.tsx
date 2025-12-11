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
    color: 'bg-red-50 border-red-200',
    instructions: 'Dung App Password tu Google Account > Security > 2-Step Verification > App passwords'
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail',
    icon: '📨',
    color: 'bg-blue-50 border-blue-200',
    instructions: 'Dung mat khau thuong hoac App Password'
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    icon: '📩',
    color: 'bg-purple-50 border-purple-200',
    instructions: 'Dung App Password tu Yahoo Account > Security'
  },
  {
    id: 'custom',
    name: 'IMAP/SMTP khac',
    icon: '⚙️',
    color: 'bg-gray-50 border-gray-200',
    instructions: 'Nhap thong tin server thu cong'
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
      setError('Vui long nhap email va mat khau')
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
        throw new Error(result.details || result.error || 'Ket noi that bai')
      }

      setStep('success')
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 1500)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ket noi that bai'
      setError(errorMsg)
      setStep('error')
    }
  }

  if (!isOpen) return null

  const selectedProvider = PROVIDERS.find(p => p.id === provider)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
          <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
            Ket noi tai khoan email
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Select Provider */}
          {step === 'select-provider' && (
            <div className="space-y-3">
              <p className="text-[14px] text-[#6B6B6B] mb-4">
                Chon nha cung cap email:
              </p>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProvider(p.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-[#FAFAFA] ${p.color}`}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <span className="text-[15px] font-medium text-[#1A1A1A]">{p.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Enter Credentials */}
          {step === 'enter-credentials' && selectedProvider && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('select-provider')}
                className="text-[14px] text-[#6B6B6B] hover:text-[#1A1A1A]"
              >
                ← Quay lai
              </button>

              <div className={`flex items-center gap-3 p-3 rounded-lg ${selectedProvider.color}`}>
                <span className="text-xl">{selectedProvider.icon}</span>
                <span className="font-medium">{selectedProvider.name}</span>
              </div>

              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3 text-[13px] text-[#92400E]">
                {selectedProvider.instructions}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                    Mat khau / App Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full px-3 py-2 pr-10 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9B9B] hover:text-[#6B6B6B]"
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
                        <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                          IMAP Host
                        </label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={e => setImapHost(e.target.value)}
                          placeholder="imap.example.com"
                          className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                          IMAP Port
                        </label>
                        <input
                          type="text"
                          value={imapPort}
                          onChange={e => setImapPort(e.target.value)}
                          placeholder="993"
                          className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={e => setSmtpHost(e.target.value)}
                          placeholder="smtp.example.com"
                          className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[#6B6B6B] mb-1">
                          SMTP Port
                        </label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={e => setSmtpPort(e.target.value)}
                          placeholder="587"
                          className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg text-[#DC2626] text-[13px]">
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
                Ket noi
              </Button>
            </div>
          )}

          {/* Step 3: Connecting */}
          {step === 'connecting' && (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-[#1A1A1A] animate-spin mb-4" />
              <p className="text-[15px] text-[#6B6B6B]">
                Dang ket noi va xac thuc...
              </p>
              <p className="text-[13px] text-[#9B9B9B] mt-1">
                Vui long doi trong giay lat
              </p>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="py-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
              <p className="text-[15px] font-medium text-[#1A1A1A]">
                Ket noi thanh cong!
              </p>
              <p className="text-[13px] text-[#6B6B6B] mt-1">
                Email da duoc them vao InboxAI
              </p>
            </div>
          )}

          {/* Step 5: Error */}
          {step === 'error' && (
            <div className="py-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <p className="text-[15px] font-medium text-[#1A1A1A] mb-2">
                Ket noi that bai
              </p>
              {error && (
                <p className="text-[13px] text-[#DC2626] mb-4 px-4">
                  {error}
                </p>
              )}
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={() => setStep('enter-credentials')}>
                  Thu lai
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  Dong
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
