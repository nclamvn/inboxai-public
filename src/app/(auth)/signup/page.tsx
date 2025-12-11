'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, ArrowRight, Loader2, Check, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess(true)
    } catch (err) {
      setError('Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-executive-lg border border-[#EBEBEB] p-8 text-center">
        <div className="w-16 h-16 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-[#16A34A]" strokeWidth={1.5} />
        </div>
        <h1 className="text-[24px] font-bold text-[#1A1A1A] mb-2">
          Kiểm tra email của bạn
        </h1>
        <p className="text-[#6B6B6B] mb-6">
          Chúng tôi đã gửi link xác nhận đến <strong>{email}</strong>.
          Vui lòng kiểm tra và xác nhận email để hoàn tất đăng ký.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[#1A1A1A] font-medium hover:underline"
        >
          Quay lại đăng nhập
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-executive-lg border border-[#EBEBEB] p-8">
      <div className="text-center mb-8">
        <h1 className="text-[24px] font-bold text-[#1A1A1A] mb-2">
          Tạo tài khoản mới
        </h1>
        <p className="text-[#6B6B6B]">
          Bắt đầu quản lý email thông minh với InboxAI
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg text-[#DC2626] text-[14px]">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="block text-[14px] font-medium text-[#1A1A1A] mb-1">
            Họ và tên
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9B9B9B]" strokeWidth={1.5} />
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              className="w-full pl-10 pr-4 py-2.5 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-[14px] font-medium text-[#1A1A1A] mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9B9B9B]" strokeWidth={1.5} />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full pl-10 pr-4 py-2.5 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-[14px] font-medium text-[#1A1A1A] mb-1">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9B9B9B]" strokeWidth={1.5} />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              required
              minLength={6}
              className="w-full pl-10 pr-10 py-2.5 border border-[#EBEBEB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9B9B] hover:text-[#6B6B6B]"
            >
              {showPassword ? <EyeOff className="w-5 h-5" strokeWidth={1.5} /> : <Eye className="w-5 h-5" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1A1A1A] text-white py-2.5 rounded-lg font-medium hover:bg-[#2D2D2D] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
          ) : (
            <>
              Đăng ký
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-[14px] text-[#6B6B6B]">
        Đã có tài khoản?{' '}
        <Link href="/login" className="text-[#1A1A1A] font-medium hover:underline">
          Đăng nhập
        </Link>
      </div>
    </div>
  )
}
