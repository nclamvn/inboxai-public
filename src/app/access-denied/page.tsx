'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Send, CheckCircle, LogOut, Mail, User, MessageSquare } from 'lucide-react'
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
        throw new Error(data.error || 'Co loi xay ra')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Co loi xay ra')
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
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#EBEBEB] p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-[#1A1A1A] mb-2">
            Yeu cau da duoc gui!
          </h1>
          <p className="text-[#6B6B6B] mb-6">
            Chung toi se xem xet va phan hoi qua email <strong>{userEmail}</strong> trong thoi gian som nhat.
          </p>
          <button
            onClick={handleLogout}
            className="text-[14px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
          >
            Dang nhap tai khoan khac
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#EBEBEB] overflow-hidden">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-8 py-6 text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-1">
            InboxAI Private Beta
          </h1>
          <p className="text-white/60 text-[14px]">
            Hien tai chi mo cho nguoi dung duoc moi
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="text-center mb-6">
            <p className="text-[#6B6B6B] text-[14px]">
              Dang nhap voi: <strong className="text-[#1A1A1A]">{userEmail}</strong>
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">
              Ho va ten
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B]" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyen Van A"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10 focus:border-[#1A1A1A]"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">
              Ly do muon su dung InboxAI
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[#9B9B9B]" />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Toi muon su dung InboxAI de..."
                rows={3}
                className="w-full pl-10 pr-4 py-2.5 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10 focus:border-[#1A1A1A] resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !fullName}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium text-[14px] hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Dang gui...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Gui yeu cau truy cap
              </>
            )}
          </button>

          {/* Logout link */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-[13px] text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Dang nhap tai khoan khac
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
