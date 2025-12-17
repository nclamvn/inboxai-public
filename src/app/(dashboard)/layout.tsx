import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileNav } from '@/components/layout/mobile-nav'
import { UrgentAlertWrapper } from '@/components/ai/urgent-alert-wrapper'
import { AutoSyncProvider } from '@/providers/auto-sync-provider'
import { AIIntroTooltip } from '@/components/onboarding/ai-intro-tooltip'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <AutoSyncProvider enabled={true} interval={30000}>
      <div className="h-screen flex bg-[var(--background)]">
        {/* Sidebar - Hidden on mobile */}
        <Sidebar defaultCollapsed={true} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto pb-16 md:pb-0">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <MobileNav />

        <UrgentAlertWrapper />
        <AIIntroTooltip />
      </div>
    </AutoSyncProvider>
  )
}
