import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-9 h-9 bg-[#1A1A1A] rounded-lg flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-[20px] text-[#1A1A1A]">InboxAI</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-[14px] text-[#9B9B9B]">
        <p>© 2025 InboxAI. Made with love in Vietnam.</p>
      </footer>
    </div>
  )
}
