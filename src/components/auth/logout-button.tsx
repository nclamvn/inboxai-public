'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface LogoutButtonProps {
  className?: string
  showIcon?: boolean
  children?: React.ReactNode
}

export function LogoutButton({ className, showIcon = true, children }: LogoutButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)

    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={className || 'flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors'}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          {showIcon && <LogOut className="w-4 h-4" />}
          {children || 'Đăng xuất'}
        </>
      )}
    </button>
  )
}
