'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Mail, Sparkles, Shield, Zap, Clock, Brain,
  ChevronRight, Check, Moon, Sun, Menu, X,
  Inbox, Tag, Trash2, Star, ArrowRight,
  Smartphone, Lock, RefreshCw
} from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { toggleTheme, resolvedTheme } = useTheme()

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" suppressHydrationWarning>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/80 backdrop-blur-lg border-b border-[var(--border)]" suppressHydrationWarning>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-[var(--primary)] rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-[var(--primary-foreground)]" />
              </div>
              <span className="text-[18px] font-bold text-[var(--foreground)]">InboxAI</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-[14px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                Tính năng
              </a>
              <a href="#how-it-works" className="text-[14px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                Cách hoạt động
              </a>
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted)]" suppressHydrationWarning>
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <Link
                href="/login"
                className="px-4 py-2 text-[14px] font-medium text-[var(--primary-foreground)] bg-[var(--primary)] rounded-xl hover:opacity-90 transition-opacity"
              >
                Đăng nhập
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted)]" suppressHydrationWarning>
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-[var(--border)]">
              <a href="#features" className="block py-2 text-[14px] text-[var(--muted)]">Tính năng</a>
              <a href="#how-it-works" className="block py-2 text-[14px] text-[var(--muted)]">Cách hoạt động</a>
              <Link href="/login" className="block py-2 text-[14px] text-[var(--primary)] font-medium">Đăng nhập</Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-[13px] font-medium text-[var(--foreground)]">Powered by AI</span>
            </div>

            {/* Headline */}
            <h1 className="text-[36px] sm:text-[48px] lg:text-[56px] font-bold text-[var(--foreground)] leading-tight mb-6">
              Email thông minh hơn.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">
                Năng suất cao hơn.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-[16px] sm:text-[18px] text-[var(--muted)] max-w-xl mx-auto mb-8">
              InboxAI sử dụng AI để tự động phân loại, ưu tiên và quản lý email của bạn.
              Tiết kiệm hàng giờ mỗi tuần.
            </p>

            {/* CTA Button */}
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl text-[16px] font-semibold hover:opacity-90 transition-opacity"
            >
              Đăng ký ngay
              <ArrowRight className="w-5 h-5" />
            </Link>

            <p className="text-[13px] text-[var(--muted-foreground)] mt-4">
              Miễn phí trong Open Beta • Không cần thẻ tín dụng
            </p>
          </div>

          {/* App Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative mx-auto max-w-4xl">
              {/* Browser frame */}
              <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden">
                {/* Browser header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-[var(--secondary)]/50 border-b border-[var(--border)]">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="max-w-sm mx-auto px-4 py-1.5 bg-[var(--background)] rounded-lg text-[12px] text-[var(--muted)] text-center">
                      inboxai.vn
                    </div>
                  </div>
                </div>

                {/* App screenshot mockup */}
                <div className="bg-[var(--background)] p-4 flex">
                  {/* Sidebar mockup */}
                  <div className="w-48 border-r border-[var(--border)] pr-4 hidden sm:block">
                    <div className="flex items-center gap-2 p-2 bg-[var(--secondary)] rounded-lg mb-2">
                      <Inbox className="w-4 h-4" />
                      <span className="text-[13px] font-medium">Hộp thư đến</span>
                      <span className="ml-auto text-[11px] bg-[var(--primary)] text-[var(--primary-foreground)] px-1.5 rounded">12</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 text-[var(--muted)]">
                      <Tag className="w-4 h-4" />
                      <span className="text-[13px]">Công việc</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 text-[var(--muted)]">
                      <Star className="w-4 h-4" />
                      <span className="text-[13px]">Quan trọng</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 text-[var(--muted)]">
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[13px]">Spam</span>
                    </div>
                  </div>

                  {/* Email list mockup */}
                  <div className="flex-1 pl-0 sm:pl-4">
                    {[
                      { from: 'Nguyễn Văn A', subject: 'Báo cáo Q4 2024', tag: 'Công việc', tagColor: 'blue', unread: true },
                      { from: 'BIDV', subject: 'Biến động số dư tài khoản', tag: 'Giao dịch', tagColor: 'green', unread: true },
                      { from: 'Team Meeting', subject: 'Lịch họp tuần này', tag: 'Công việc', tagColor: 'blue', unread: false },
                      { from: 'Newsletter', subject: 'Tech News Weekly #42', tag: 'Newsletter', tagColor: 'gray', unread: false },
                    ].map((emailItem, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg mb-1 ${emailItem.unread ? 'bg-blue-500/5' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-[var(--secondary)] flex items-center justify-center text-[12px] font-medium">
                          {emailItem.from[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] ${emailItem.unread ? 'font-semibold' : ''} truncate`}>{emailItem.from}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              emailItem.tagColor === 'blue' ? 'bg-blue-500/10 text-blue-500' :
                              emailItem.tagColor === 'green' ? 'bg-green-500/10 text-green-500' :
                              'bg-[var(--secondary)] text-[var(--muted)]'
                            }`}>
                              {emailItem.tag}
                            </span>
                          </div>
                          <p className="text-[12px] text-[var(--muted)] truncate">{emailItem.subject}</p>
                        </div>
                        {emailItem.unread && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4 sm:px-6 bg-[var(--secondary)]/30">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-[28px] sm:text-[36px] font-bold text-[var(--foreground)] mb-4">
              Email đang ngốn thời gian của bạn
            </h2>
            <p className="text-[16px] text-[var(--muted)]">
              Người làm việc trung bình dành 28% thời gian mỗi ngày để xử lý email.
              InboxAI giúp bạn lấy lại thời gian đó.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Clock, stat: '2.5 giờ', desc: 'Thời gian trung bình xử lý email mỗi ngày' },
              { icon: Inbox, stat: '121 email', desc: 'Số email nhận được mỗi ngày của dân văn phòng' },
              { icon: Brain, stat: '40%', desc: 'Email không cần thiết hoặc spam' },
            ].map((item, i) => (
              <div key={i} className="p-6 bg-[var(--card)] rounded-2xl border border-[var(--border)] text-center">
                <item.icon className="w-8 h-8 text-[var(--primary)] mx-auto mb-4" />
                <div className="text-[32px] font-bold text-[var(--foreground)] mb-2">{item.stat}</div>
                <p className="text-[14px] text-[var(--muted)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-[28px] sm:text-[36px] font-bold text-[var(--foreground)] mb-4">
              Tính năng nổi bật
            </h2>
            <p className="text-[16px] text-[var(--muted)]">
              Mọi thứ bạn cần để quản lý email hiệu quả hơn
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Sparkles,
                title: 'Phân loại AI thông minh',
                desc: 'Tự động phân loại email vào Công việc, Cá nhân, Giao dịch, Newsletter, và Spam.',
                color: 'text-purple-500 bg-purple-500/10'
              },
              {
                icon: Shield,
                title: 'Sender Trust System',
                desc: 'Học từ hành vi của bạn. Email từ người bạn đã reply sẽ không bao giờ vào spam.',
                color: 'text-blue-500 bg-blue-500/10'
              },
              {
                icon: Zap,
                title: 'Bulk Actions',
                desc: 'Xóa hàng loạt, archive, đánh dấu đã đọc chỉ với một click.',
                color: 'text-amber-500 bg-amber-500/10'
              },
              {
                icon: Smartphone,
                title: 'Mobile First',
                desc: 'Giao diện tối ưu cho điện thoại. Đọc email mượt mà trên mọi thiết bị.',
                color: 'text-green-500 bg-green-500/10'
              },
              {
                icon: Moon,
                title: 'Dark Mode',
                desc: 'Bảo vệ mắt với chế độ tối. Tự động theo system preference.',
                color: 'text-indigo-500 bg-indigo-500/10'
              },
              {
                icon: Lock,
                title: 'Bảo mật cao',
                desc: 'Mã hóa end-to-end. Dữ liệu của bạn an toàn và riêng tư.',
                color: 'text-red-500 bg-red-500/10'
              },
            ].map((feature, i) => (
              <div key={i} className="p-6 bg-[var(--card)] rounded-2xl border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors group">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.color}`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-[16px] font-semibold text-[var(--foreground)] mb-2 group-hover:text-[var(--primary)] transition-colors">
                  {feature.title}
                </h3>
                <p className="text-[14px] text-[var(--muted)] leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-[var(--secondary)]/30">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-[28px] sm:text-[36px] font-bold text-[var(--foreground)] mb-4">
              Bắt đầu trong 2 phút
            </h2>
            <p className="text-[16px] text-[var(--muted)]">
              Kết nối Gmail và để AI làm việc cho bạn
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Kết nối Gmail',
                desc: 'Đăng nhập với Google và cấp quyền truy cập email một cách an toàn.'
              },
              {
                step: '2',
                title: 'AI phân loại',
                desc: 'InboxAI tự động quét và phân loại tất cả email của bạn.'
              },
              {
                step: '3',
                title: 'Quản lý thông minh',
                desc: 'Xem email quan trọng trước, bulk delete spam, tiết kiệm thời gian.'
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-[2px] bg-[var(--border)]" />
                )}
                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-[24px] font-bold mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-[18px] font-semibold text-[var(--foreground)] mb-2">
                    {item.title}
                  </h3>
                  <p className="text-[14px] text-[var(--muted)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Lock, title: 'Bảo mật', desc: 'Mã hóa AES-256, không lưu mật khẩu dạng plain text' },
              { icon: RefreshCw, title: 'Sync realtime', desc: 'Email mới được sync tự động, không cần refresh' },
              { icon: Shield, title: 'Privacy first', desc: 'Không bán dữ liệu, không ads, không tracking' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 p-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-[var(--muted)]">
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-[15px] font-semibold text-[var(--foreground)] mb-1">{item.title}</h4>
                  <p className="text-[13px] text-[var(--muted)]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-8 sm:p-12 bg-gradient-to-br from-[var(--primary)]/10 via-purple-500/10 to-blue-500/10 rounded-3xl border border-[var(--border)]">
            <h2 className="text-[28px] sm:text-[36px] font-bold text-[var(--foreground)] mb-4">
              Sẵn sàng tiết kiệm thời gian?
            </h2>
            <p className="text-[16px] text-[var(--muted)] mb-8 max-w-lg mx-auto">
              Tham gia Open Beta ngay hôm nay và trải nghiệm cách quản lý email thông minh hơn.
            </p>

            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl text-[16px] font-semibold hover:opacity-90 transition-opacity"
            >
              Đăng ký miễn phí
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center">
              <Mail className="w-4 h-4 text-[var(--primary-foreground)]" />
            </div>
            <span className="text-[15px] font-semibold text-[var(--foreground)]">InboxAI</span>
          </div>

          <p className="text-[13px] text-[var(--muted)]">
            © 2025 InboxAI. Made with love in Vietnam.
          </p>

          <div className="flex items-center gap-4">
            <a href="#" className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)]">Privacy</a>
            <a href="#" className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)]">Terms</a>
            <a href="mailto:support@inboxai.vn" className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)]">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
