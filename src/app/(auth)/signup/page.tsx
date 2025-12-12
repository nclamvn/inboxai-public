'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, User, ArrowRight, Loader2, CheckCircle } from 'lucide-react'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Chỉ lưu vào waitlist, KHÔNG tạo Supabase user
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: fullName })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setSuccess(true)
        setMessage(data.message || 'Đã thêm vào danh sách chờ!')
      } else {
        setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
    } catch (err) {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // Success state - Hiện popup cảm ơn
  if (success) {
    return (
      <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" strokeWidth={1.5} />
        </div>

        <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-3">
          Cảm ơn bạn đã đăng ký!
        </h1>

        <p className="text-[15px] text-[var(--muted)] mb-6">
          {message || 'Bạn đã được thêm vào danh sách chờ của InboxAI. Chúng tôi sẽ liên hệ khi có slot mới.'}
        </p>

        <div className="p-4 bg-[var(--secondary)] rounded-xl mb-6">
          <p className="text-[14px] text-[var(--muted-foreground)]">
            InboxAI đang trong giai đoạn Private Beta.
            Chúng tôi sẽ mở rộng dần dần để đảm bảo chất lượng tốt nhất.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[var(--foreground)] font-medium hover:underline"
        >
          Quay lại trang chủ
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl shadow-executive-lg border border-[var(--border)] p-8">
      <div className="text-center mb-8">
        <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-2">
          Đăng ký nhận thông báo
        </h1>
        <p className="text-[var(--muted)]">
          Để lại email để được mời sử dụng InboxAI khi có slot
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-[14px]">
            {error}
          </div>
        )}

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
              Đang xử lý...
            </>
          ) : (
            <>
              Đăng ký waitlist
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

      <div className="mt-4 p-3 bg-[var(--secondary)] rounded-lg">
        <p className="text-[12px] text-[var(--muted-foreground)] text-center">
          InboxAI đang trong giai đoạn Private Beta. Chúng tôi sẽ mời bạn khi có slot mới.
        </p>
      </div>
    </div>
  )
}
