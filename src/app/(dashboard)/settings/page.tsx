import { createClient } from '@/lib/supabase/server'
import { User, Shield, Bell, Zap, Mail } from 'lucide-react'
import { AISection } from '@/components/settings/ai-section'
import { AIFeaturesSettings } from '@/components/ai'
import { MailboxSection } from '@/components/settings/mailbox-section'
import { RulesList } from '@/components/automation/rules-list'
import { SourceAccountsSection } from '@/components/settings/source-accounts-section'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user?.id)
    .single()

  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0]

  return (
    <div className="h-full overflow-auto bg-[var(--background)]">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-[24px] font-bold text-[var(--foreground)] mb-6">Cài đặt</h1>

        {/* Profile Section */}
        <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[var(--secondary)] rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-[var(--foreground)]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Hồ sơ cá nhân</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Quản lý thông tin tài khoản của bạn</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center text-[var(--primary-foreground)] text-xl font-semibold">
                {displayName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">{displayName}</p>
                <p className="text-[14px] text-[var(--muted-foreground)]">{user?.email}</p>
              </div>
            </div>

            <div className="grid gap-4 pt-4 border-t border-[var(--border)]">
              <div>
                <label className="block text-[14px] font-medium text-[var(--foreground)] mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  defaultValue={displayName}
                  readOnly
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--secondary)] text-[var(--foreground)]"
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[var(--foreground)] mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email}
                  disabled
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--secondary)] text-[var(--muted-foreground)]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Source Email Accounts Section */}
        <section className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Tài khoản email</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Kết nối Gmail, Outlook để đồng bộ email</p>
            </div>
          </div>
          <SourceAccountsSection />
        </section>

        {/* Mailbox Section */}
        <MailboxSection mailboxAddress={profile?.mailbox_address} />

        {/* AI Section */}
        <AISection />

        {/* AI Features Settings - Smart Allocation */}
        <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">AI Features</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Cấu hình tính năng AI theo loại email</p>
            </div>
          </div>
          <AIFeaturesSettings />
        </section>

        {/* Automation Section */}
        <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-6 overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-[var(--border)]">
            <div className="w-10 h-10 bg-[var(--secondary)] rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[var(--foreground)]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Automation</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Tự động hóa xử lý email với AI rules</p>
            </div>
          </div>
          <RulesList />
        </section>

        {/* Notifications Section */}
        <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Thông báo</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Quản lý cài đặt thông báo</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-[var(--foreground)]">Email quan trọng</p>
                <p className="text-[14px] text-[var(--muted-foreground)]">Nhận thông báo khi có email ưu tiên cao</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 rounded accent-[var(--primary)]" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-[var(--foreground)]">Tóm tắt hàng ngày</p>
                <p className="text-[14px] text-[var(--muted-foreground)]">Nhận email tóm tắt mỗi sáng</p>
              </div>
              <input type="checkbox" className="w-5 h-5 rounded accent-[var(--primary)]" />
            </label>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600 dark:text-red-400" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--foreground)]">Bảo mật</h2>
              <p className="text-[14px] text-[var(--muted-foreground)]">Cài đặt bảo mật tài khoản</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="w-full text-left px-4 py-3 border border-[var(--border)] rounded-lg hover:bg-[var(--hover)] transition-colors cursor-pointer">
              <p className="font-medium text-[var(--foreground)]">Đổi mật khẩu</p>
              <p className="text-[14px] text-[var(--muted-foreground)]">Cập nhật mật khẩu đăng nhập</p>
            </div>
            <div className="w-full text-left px-4 py-3 border border-[var(--border)] rounded-lg hover:bg-[var(--hover)] transition-colors cursor-pointer">
              <p className="font-medium text-[var(--foreground)]">Xác thực 2 bước</p>
              <p className="text-[14px] text-[var(--muted-foreground)]">Thêm lớp bảo mật cho tài khoản</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
