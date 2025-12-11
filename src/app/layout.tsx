import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'InboxAI - Smart Email Hub',
  description: 'AI-powered email management. One inbox to rule them all.',
  keywords: ['email', 'ai', 'inbox', 'productivity', 'vietnam'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" className="scroll-smooth">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
