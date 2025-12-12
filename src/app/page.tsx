import Link from 'next/link'
import { Layers, Sparkles, Target, Inbox, Star, Send } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* Navigation */}
      <nav className="w-full border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-8 md:px-12 lg:px-16 h-16 flex items-center justify-between">
          <Link href="/" className="text-[18px] font-medium text-[var(--foreground)]">
            InboxAI
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-[14px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200"
            >
              Đăng nhập
            </Link>
            <Link
              href="/signup"
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-full text-[14px] font-medium hover:opacity-90 transition-opacity duration-200"
            >
              Đăng ký waitlist
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="w-full pt-20 md:pt-28 lg:pt-36 pb-20 md:pb-28">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h1 className="text-[44px] md:text-[52px] lg:text-[60px] font-medium text-[var(--foreground)] tracking-tight leading-[1.08]">
            Một hộp thư thông minh,
            <br />
            quản lý tất cả email.
          </h1>

          <p className="text-[17px] md:text-[19px] text-[var(--muted)] leading-relaxed max-w-[520px] mx-auto mt-8">
            Tập trung email từ mọi nơi vào một chỗ.
            <br className="hidden md:block" />
            AI tự động phân loại và tóm tắt.
          </p>

          {/* CTA Button */}
          <div className="mt-12 md:mt-14">
            <Link
              href="/signup"
              className="inline-block bg-[var(--primary)] text-[var(--primary-foreground)] px-10 py-4 rounded-full text-[15px] font-medium hover:opacity-90 transition-opacity duration-200"
            >
              Đăng ký waitlist
            </Link>
          </div>

          {/* Beta badge */}
          <div className="mt-6">
            <span className="inline-block px-4 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[13px] font-medium">
              Private Beta - Đang mở đăng ký
            </span>
          </div>
        </div>
      </section>

      {/* App Preview */}
      <section className="w-full px-8 md:px-16 lg:px-24 pt-4 pb-28 md:pb-36">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-[var(--border)] shadow-[0_8px_60px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_60px_-12px_rgba(0,0,0,0.3)] overflow-hidden bg-[var(--card)]">
            {/* Browser Chrome */}
            <div className="h-11 bg-[var(--secondary)] border-b border-[var(--border)] flex items-center px-4">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[var(--border)]"></div>
                <div className="w-3 h-3 rounded-full bg-[var(--border)]"></div>
                <div className="w-3 h-3 rounded-full bg-[var(--border)]"></div>
              </div>
            </div>

            {/* App Content */}
            <div className="flex min-h-[420px]">
              {/* Sidebar */}
              <div className="w-56 border-r border-[var(--border)] p-5 hidden md:block bg-[var(--secondary)]">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 px-3.5 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[14px] font-medium text-[var(--foreground)] shadow-sm">
                    <Inbox className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Inbox</span>
                    <span className="ml-auto bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] px-2 py-0.5 rounded-full">12</span>
                  </div>
                  <div className="flex items-center gap-3 px-3.5 py-3 text-[14px] text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)] rounded-lg transition-colors duration-200">
                    <Star className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Quan trọng</span>
                  </div>
                  <div className="flex items-center gap-3 px-3.5 py-3 text-[14px] text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)] rounded-lg transition-colors duration-200">
                    <Send className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Đã gửi</span>
                  </div>
                </div>
              </div>

              {/* Email List */}
              <div className="flex-1 p-5">
                <div className="space-y-3">
                  {/* Email Item 1 - Unread */}
                  <div className="flex items-start gap-4 p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-[var(--foreground)] text-[13px] font-semibold flex-shrink-0">
                      NA
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] font-medium text-[var(--foreground)]">Nguyễn Văn A</span>
                        <span className="text-[11px] text-[var(--foreground)] bg-[var(--secondary)] px-2 py-0.5 rounded-full font-medium">Quan trọng</span>
                      </div>
                      <p className="text-[14px] text-[var(--foreground)] truncate mt-1">Báo cáo Q4 2024 - Cần review</p>
                      <p className="text-[13px] text-[var(--muted-foreground)] mt-1.5">AI: Cần phản hồi trước 5pm</p>
                    </div>
                    <span className="text-[12px] text-[var(--muted-foreground)] flex-shrink-0">10:30</span>
                  </div>

                  {/* Email Item 2 */}
                  <div className="flex items-start gap-4 p-4 border border-[var(--border)] rounded-xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-[var(--muted)] text-[13px] font-semibold flex-shrink-0">
                      SH
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] text-[var(--muted)]">Shopee</span>
                      <p className="text-[14px] text-[var(--muted)] truncate mt-1">Đơn hàng đã được giao thành công</p>
                    </div>
                    <span className="text-[12px] text-[var(--muted-foreground)] flex-shrink-0">09:15</span>
                  </div>

                  {/* Email Item 3 */}
                  <div className="flex items-start gap-4 p-4 border border-[var(--border)] rounded-xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-[var(--muted)] text-[13px] font-semibold flex-shrink-0">
                      GC
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] text-[var(--muted)]">Google Cloud</span>
                      <p className="text-[14px] text-[var(--muted)] truncate mt-1">Your invoice for December 2024</p>
                    </div>
                    <span className="text-[12px] text-[var(--muted-foreground)] flex-shrink-0">Hôm qua</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full bg-[var(--secondary)] py-28 md:py-36">
        <div className="max-w-6xl mx-auto px-8 md:px-12 lg:px-16">
          <h2 className="text-[32px] md:text-[36px] font-medium text-[var(--foreground)] text-center mb-16 md:mb-20">
            Tại sao InboxAI
          </h2>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <div className="p-8 lg:p-10 bg-[var(--card)] border border-[var(--border)] rounded-2xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[var(--secondary)] flex items-center justify-center mb-6">
                <Layers className="w-7 h-7 text-[var(--foreground)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[var(--foreground)] mb-3">
                Hợp nhất mọi hộp thư
              </h3>
              <p className="text-[15px] text-[var(--muted)] leading-relaxed">
                Chuyển tiếp email từ Gmail, Outlook, Yahoo về một địa chỉ duy nhất. Quản lý tập trung, không còn chuyển đổi giữa các ứng dụng.
              </p>
            </div>

            <div className="p-8 lg:p-10 bg-[var(--card)] border border-[var(--border)] rounded-2xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[var(--secondary)] flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-[var(--foreground)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[var(--foreground)] mb-3">
                AI phân loại thông minh
              </h3>
              <p className="text-[15px] text-[var(--muted)] leading-relaxed">
                Tự động nhận diện mức độ ưu tiên, phân loại công việc và cá nhân, tóm tắt nội dung email chỉ trong vài giây.
              </p>
            </div>

            <div className="p-8 lg:p-10 bg-[var(--card)] border border-[var(--border)] rounded-2xl hover:border-[var(--muted-foreground)]/30 hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[var(--secondary)] flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-[var(--foreground)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[var(--foreground)] mb-3">
                Luôn đúng ưu tiên
              </h3>
              <p className="text-[15px] text-[var(--muted)] leading-relaxed">
                Highlight deadline, email cần trả lời, và gợi ý hành động. Newsletter và spam tự động được lọc ra.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="w-full bg-[var(--background)] py-28 md:py-36">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <p className="text-[22px] md:text-[26px] font-medium text-[var(--foreground)] italic leading-relaxed">
            &ldquo;InboxAI giúp tôi tiết kiệm 2 giờ mỗi ngày để tập trung vào công việc quan trọng.&rdquo;
          </p>
          <p className="text-[15px] text-[var(--muted)] mt-8">Nguyễn Văn A</p>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-1">CEO, Startup X</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full bg-[var(--secondary)] py-28 md:py-36">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <h2 className="text-[32px] md:text-[36px] font-medium text-[var(--foreground)] leading-tight">
            Sẵn sàng quản lý email
            <br />
            thông minh hơn?
          </h2>
          <div className="mt-10 md:mt-12">
            <Link
              href="/signup"
              className="inline-block bg-[var(--primary)] text-[var(--primary-foreground)] px-10 py-4 rounded-full text-[15px] font-medium hover:opacity-90 transition-opacity duration-200"
            >
              Đăng ký waitlist
            </Link>
          </div>
          <p className="mt-4 text-[14px] text-[var(--muted-foreground)]">
            Private Beta - Miễn phí trong giai đoạn thử nghiệm
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-8 md:px-12 lg:px-16 py-10 flex items-center justify-between">
          <span className="text-[15px] font-medium text-[var(--foreground)]">InboxAI</span>
          <span className="text-[13px] text-[var(--muted-foreground)]">© 2025 InboxAI</span>
        </div>
      </footer>
    </main>
  )
}
