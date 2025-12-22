'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, User, Lock, ArrowRight, Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react'

type Step = 'check_email' | 'signup_form' | 'waitlist_form' | 'success'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('check_email')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [waitlistStatus, setWaitlistStatus] = useState<string | null>(null)

  // Step 1: Check if email is whitelisted
  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/check-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      })

      const data = await res.json()

      if (data.allowed) {
        // Email is approved or open beta - show signup form
        setMessage(data.message || '')
        setStep('signup_form')
      } else if (data.status === 'exists') {
        // User already registered
        setError(data.message)
      } else if (data.status === 'beta_full') {
        // Beta is full - show waitlist form
        setWaitlistStatus('beta_full')
        setMessage(data.message)
        setStep('waitlist_form')
      } else if (data.status === 'pending') {
        // Already on waitlist, pending
        setWaitlistStatus('pending')
        setMessage(data.message)
        setStep('waitlist_form')
      } else if (data.status === 'rejected') {
        setError(data.message)
      } else {
        // Not on waitlist yet - show waitlist form
        setWaitlistStatus('not_found')
        setStep('waitlist_form')
      }
    } catch (err) {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2a: Real signup for approved users (auto-confirmed)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Use server-side API to create user with auto-confirm
      const res = await fetch('/api/signup-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
          fullName
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
        return
      }

      setMessage(data.message || 'Đăng ký thành công! Bạn có thể đăng nhập ngay.')
      setStep('success')
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2b: Submit to waitlist
  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), name: fullName })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setMessage(data.message || 'Đã thêm vào danh sách chờ!')
        setStep('success')
      } else {
        setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
    } catch (err) {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (step === 'success') {
    const isApprovedSignup = password.length > 0 // If they entered password, it was real signup

    return (
      <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" strokeWidth={1.5} />
        </div>

        <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-3">
          {isApprovedSignup ? 'Đăng ký thành công!' : 'Cảm ơn bạn đã đăng ký!'}
        </h1>

        <p className="text-[15px] text-[var(--muted)] mb-6">
          {message}
        </p>

        {isApprovedSignup ? (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90"
          >
            Đăng nhập ngay
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--foreground)] font-medium hover:underline"
          >
            Quay lại trang chủ
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        )}
      </div>
    )
  }

  // Step 1: Check email
  if (step === 'check_email') {
    return (
      <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8">
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
            Đăng ký InboxAI
          </h1>
          <p className="text-[var(--muted)]">
            Nhập email để kiểm tra quyền truy cập
          </p>
        </div>

        <form onSubmit={handleCheckEmail} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-[14px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[14px] font-medium text-[var(--foreground)] mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                Đang kiểm tra...
              </>
            ) : (
              <>
                Tiếp tục
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-[14px] text-[var(--muted)]">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-[var(--foreground)] font-medium hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    )
  }

  // Step 2a: Real signup form (for approved users or open beta)
  if (step === 'signup_form') {
    const isOpenBeta = message.includes('Open Beta')

    return (
      <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
            {isOpenBeta ? 'Tạo tài khoản' : 'Email đã được duyệt!'}
          </h1>
          <p className="text-[var(--muted)]">
            {isOpenBeta ? message : 'Hoàn tất đăng ký để sử dụng InboxAI'}
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-[14px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="p-3 bg-[var(--secondary)] rounded-lg">
            <p className="text-[14px] text-[var(--muted-foreground)]">
              <strong>Email:</strong> {email}
            </p>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-[14px] font-medium text-[var(--foreground)] mb-1">
              Họ và tên
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[14px] font-medium text-[var(--foreground)] mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                Đang tạo tài khoản...
              </>
            ) : (
              <>
                Tạo tài khoản
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => { setStep('check_email'); setError(null) }}
          className="w-full mt-4 text-[14px] text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Dùng email khác
        </button>
      </div>
    )
  }

  // Step 2b: Waitlist form (for non-approved users)
  if (step === 'waitlist_form') {
    return (
      <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400" strokeWidth={1.5} />
          </div>

          {waitlistStatus === 'pending' ? (
            <>
              <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
                Đang chờ duyệt
              </h1>
              <p className="text-[var(--muted)]">
                {message || 'Yêu cầu của bạn đang được xem xét'}
              </p>
            </>
          ) : waitlistStatus === 'beta_full' ? (
            <>
              <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
                Beta đã đầy
              </h1>
              <p className="text-[var(--muted)]">
                {message || 'Đăng ký waitlist để được thông báo'}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
                Đăng ký Waitlist
              </h1>
              <p className="text-[var(--muted)]">
                InboxAI đang trong Private Beta
              </p>
            </>
          )}
        </div>

        {waitlistStatus === 'pending' ? (
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <p className="text-[14px] text-orange-700 dark:text-orange-300">
                Email <strong>{email}</strong> đã đăng ký và đang chờ duyệt.
                Bạn sẽ nhận được email khi được chấp nhận.
              </p>
            </div>

            <Link
              href="/"
              className="w-full bg-[var(--secondary)] text-[var(--foreground)] py-2.5 rounded-lg font-medium hover:bg-[var(--hover)] transition-colors flex items-center justify-center gap-2"
            >
              Quay lại trang chủ
            </Link>
          </div>
        ) : (
          <form onSubmit={handleWaitlist} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-[14px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="p-3 bg-[var(--secondary)] rounded-lg">
              <p className="text-[14px] text-[var(--muted-foreground)]">
                <strong>Email:</strong> {email}
              </p>
            </div>

            <div>
              <label htmlFor="fullName" className="block text-[14px] font-medium text-[var(--foreground)] mb-1">
                Họ và tên
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                  Đang đăng ký...
                </>
              ) : (
                <>
                  Đăng ký Waitlist
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>
          </form>
        )}

        <button
          onClick={() => { setStep('check_email'); setError(null); setWaitlistStatus(null) }}
          className="w-full mt-4 text-[14px] text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Dùng email khác
        </button>

        <div className="mt-4 p-3 bg-[var(--secondary)] rounded-lg">
          <p className="text-[12px] text-[var(--muted-foreground)] text-center">
            Chúng tôi sẽ gửi email mời khi có slot mới.
          </p>
        </div>
      </div>
    )
  }

  return null
}
