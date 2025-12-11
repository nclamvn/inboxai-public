import { createClient } from '@/lib/supabase/server'
import { User, Shield, Bell, Zap, Mail } from 'lucide-react'
import { AISection } from '@/components/settings/ai-section'
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
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-[24px] font-bold text-[#1A1A1A] mb-6">Cài đặt</h1>

        {/* Profile Section */}
        <section className="bg-white rounded-xl border border-[#EBEBEB] p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-[#1A1A1A]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Hồ sơ cá nhân</h2>
              <p className="text-[14px] text-[#6B6B6B]">Quản lý thông tin tài khoản của bạn</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[#1A1A1A] rounded-full flex items-center justify-center text-white text-xl font-semibold">
                {displayName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-[#1A1A1A]">{displayName}</p>
                <p className="text-[14px] text-[#6B6B6B]">{user?.email}</p>
              </div>
            </div>

            <div className="grid gap-4 pt-4 border-t border-[#EBEBEB]">
              <div>
                <label className="block text-[14px] font-medium text-[#1A1A1A] mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  defaultValue={displayName}
                  readOnly
                  className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg bg-[#FAFAFA] text-[#1A1A1A]"
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1A1A1A] mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email}
                  disabled
                  className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg bg-[#FAFAFA] text-[#6B6B6B]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Source Email Accounts Section */}
        <section className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#EFF6FF] rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#2563EB]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Tài khoản email</h2>
              <p className="text-[14px] text-[#6B6B6B]">Kết nối Gmail, Outlook để đồng bộ email</p>
            </div>
          </div>
          <SourceAccountsSection />
        </section>

        {/* Mailbox Section */}
        <MailboxSection mailboxAddress={profile?.mailbox_address} />

        {/* AI Section */}
        <AISection />

        {/* Automation Section */}
        <section className="bg-white rounded-xl border border-[#EBEBEB] mb-6 overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-[#EBEBEB]">
            <div className="w-10 h-10 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#1A1A1A]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Automation</h2>
              <p className="text-[14px] text-[#6B6B6B]">Tự động hóa xử lý email với AI rules</p>
            </div>
          </div>
          <RulesList />
        </section>

        {/* Notifications Section */}
        <section className="bg-white rounded-xl border border-[#EBEBEB] p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#FFFBEB] rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-[#D97706]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Thông báo</h2>
              <p className="text-[14px] text-[#6B6B6B]">Quản lý cài đặt thông báo</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-[#1A1A1A]">Email quan trọng</p>
                <p className="text-[14px] text-[#6B6B6B]">Nhận thông báo khi có email ưu tiên cao</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 text-[#1A1A1A] rounded accent-[#1A1A1A]" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-[#1A1A1A]">Tóm tắt hàng ngày</p>
                <p className="text-[14px] text-[#6B6B6B]">Nhận email tóm tắt mỗi sáng</p>
              </div>
              <input type="checkbox" className="w-5 h-5 text-[#1A1A1A] rounded accent-[#1A1A1A]" />
            </label>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-white rounded-xl border border-[#EBEBEB] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#FEF2F2] rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#DC2626]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A]">Bảo mật</h2>
              <p className="text-[14px] text-[#6B6B6B]">Cài đặt bảo mật tài khoản</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="w-full text-left px-4 py-3 border border-[#EBEBEB] rounded-lg hover:bg-[#FAFAFA] transition-colors cursor-pointer">
              <p className="font-medium text-[#1A1A1A]">Đổi mật khẩu</p>
              <p className="text-[14px] text-[#6B6B6B]">Cập nhật mật khẩu đăng nhập</p>
            </div>
            <div className="w-full text-left px-4 py-3 border border-[#EBEBEB] rounded-lg hover:bg-[#FAFAFA] transition-colors cursor-pointer">
              <p className="font-medium text-[#1A1A1A]">Xác thực 2 bước</p>
              <p className="text-[14px] text-[#6B6B6B]">Thêm lớp bảo mật cho tài khoản</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
