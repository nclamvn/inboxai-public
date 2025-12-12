'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Send, CheckCircle, LogOut, User, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AccessDeniedPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userEmail, setUserEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    getUser()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          fullName,
          reason
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Có lỗi xảy ra')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--card)] rounded-2xl shadow-sm border border-[var(--border)] p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Yêu cầu đã được gửi!
          </h1>
          <p className="text-[var(--muted)] mb-6">
            Chúng tôi sẽ xem xét và phản hồi qua email <strong>{userEmail}</strong> trong thời gian sớm nhất.
          </p>
          <button
            onClick={handleLogout}
            className="text-[14px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Đăng nhập tài khoản khác
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="bg-[var(--primary)] px-8 py-6 text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-[var(--primary-foreground)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--primary-foreground)] mb-1">
            InboxAI Private Beta
          </h1>
          <p className="text-[var(--primary-foreground)]/60 text-[14px]">
            Hiện tại chỉ mở cho người dùng được mời
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="text-center mb-6">
            <p className="text-[var(--muted)] text-[14px]">
              Đang nhập với: <strong className="text-[var(--foreground)]">{userEmail}</strong>
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
              Họ và tên
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
              Lý do muốn sử dụng InboxAI
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[var(--muted-foreground)]" />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tôi muốn sử dụng InboxAI để..."
                rows={3}
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-[13px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !fullName}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium text-[14px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-[var(--primary-foreground)]/30 border-t-[var(--primary-foreground)] rounded-full animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Gửi yêu cầu truy cập
              </>
            )}
          </button>

          {/* Logout link */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--muted)] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đăng nhập tài khoản khác
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
