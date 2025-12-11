import Link from 'next/link'
import { Layers, Sparkles, Target, Inbox, Star, Send } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="w-full border-b border-[#EBEBEB]">
        <div className="max-w-7xl mx-auto px-8 md:px-12 lg:px-16 h-16 flex items-center justify-between">
          <Link href="/" className="text-[18px] font-medium text-[#1A1A1A]">
            InboxAI
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-[14px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors duration-200"
            >
              Đăng nhập
            </Link>
            <Link
              href="/signup"
              className="bg-[#1A1A1A] text-white px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-[#333333] transition-colors duration-200"
            >
              Bắt đầu
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section - Tăng padding top để cách xa header */}
      <section className="w-full pt-20 md:pt-28 lg:pt-36 pb-20 md:pb-28">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h1 className="text-[44px] md:text-[52px] lg:text-[60px] font-medium text-[#1A1A1A] tracking-tight leading-[1.08]">
            Một hộp thư thông minh,
            <br />
            quản lý tất cả email.
          </h1>

          <p className="text-[17px] md:text-[19px] text-[#6B6B6B] leading-relaxed max-w-[520px] mx-auto mt-8">
            Tập trung email từ mọi nơi vào một chỗ.
            <br className="hidden md:block" />
            AI tự động phân loại và tóm tắt.
          </p>

          {/* CTA Button - Tăng margin top */}
          <div className="mt-12 md:mt-14">
            <Link
              href="/signup"
              className="inline-block bg-[#1A1A1A] text-white px-10 py-4 rounded-full text-[15px] font-medium hover:bg-[#333333] transition-colors duration-200"
            >
              Bắt đầu miễn phí
            </Link>
          </div>
        </div>
      </section>

      {/* App Preview - Tăng khoảng cách với hero */}
      <section className="w-full px-8 md:px-16 lg:px-24 pt-4 pb-28 md:pb-36">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-[#E5E5E5] shadow-[0_8px_60px_-12px_rgba(0,0,0,0.12)] overflow-hidden bg-white">
            {/* Browser Chrome */}
            <div className="h-11 bg-[#F8F8F8] border-b border-[#E5E5E5] flex items-center px-4">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
                <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
                <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
              </div>
            </div>

            {/* App Content */}
            <div className="flex min-h-[420px]">
              {/* Sidebar */}
              <div className="w-56 border-r border-[#EBEBEB] p-5 hidden md:block bg-[#FAFAFA]">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 px-3.5 py-3 bg-white border border-[#E5E5E5] rounded-lg text-[14px] font-medium text-[#1A1A1A] shadow-sm">
                    <Inbox className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Inbox</span>
                    <span className="ml-auto bg-[#1A1A1A] text-white text-[11px] px-2 py-0.5 rounded-full">12</span>
                  </div>
                  <div className="flex items-center gap-3 px-3.5 py-3 text-[14px] text-[#6B6B6B] hover:bg-white hover:text-[#1A1A1A] rounded-lg transition-colors duration-200">
                    <Star className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Quan trọng</span>
                  </div>
                  <div className="flex items-center gap-3 px-3.5 py-3 text-[14px] text-[#6B6B6B] hover:bg-white hover:text-[#1A1A1A] rounded-lg transition-colors duration-200">
                    <Send className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Đã gửi</span>
                  </div>
                </div>
              </div>

              {/* Email List */}
              <div className="flex-1 p-5">
                <div className="space-y-3">
                  {/* Email Item 1 - Unread */}
                  <div className="flex items-start gap-4 p-4 bg-white border border-[#E5E5E5] rounded-xl hover:border-[#D0D0D0] hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A] text-[13px] font-semibold flex-shrink-0">
                      NA
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] font-medium text-[#1A1A1A]">Nguyễn Văn A</span>
                        <span className="text-[11px] text-[#1A1A1A] bg-[#F0F0F0] px-2 py-0.5 rounded-full font-medium">Quan trọng</span>
                      </div>
                      <p className="text-[14px] text-[#1A1A1A] truncate mt-1">Báo cáo Q4 2024 - Cần review</p>
                      <p className="text-[13px] text-[#9B9B9B] mt-1.5">AI: Cần phản hồi trước 5pm</p>
                    </div>
                    <span className="text-[12px] text-[#9B9B9B] flex-shrink-0">10:30</span>
                  </div>

                  {/* Email Item 2 */}
                  <div className="flex items-start gap-4 p-4 border border-[#EBEBEB] rounded-xl hover:border-[#D0D0D0] hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-[#6B6B6B] text-[13px] font-semibold flex-shrink-0">
                      SH
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] text-[#6B6B6B]">Shopee</span>
                      <p className="text-[14px] text-[#6B6B6B] truncate mt-1">Đơn hàng đã được giao thành công</p>
                    </div>
                    <span className="text-[12px] text-[#9B9B9B] flex-shrink-0">09:15</span>
                  </div>

                  {/* Email Item 3 */}
                  <div className="flex items-start gap-4 p-4 border border-[#EBEBEB] rounded-xl hover:border-[#D0D0D0] hover:shadow-sm transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-[#6B6B6B] text-[13px] font-semibold flex-shrink-0">
                      GC
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] text-[#6B6B6B]">Google Cloud</span>
                      <p className="text-[14px] text-[#6B6B6B] truncate mt-1">Your invoice for December 2024</p>
                    </div>
                    <span className="text-[12px] text-[#9B9B9B] flex-shrink-0">Hôm qua</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full bg-[#FAFAFA] py-28 md:py-36">
        <div className="max-w-6xl mx-auto px-8 md:px-12 lg:px-16">
          <h2 className="text-[32px] md:text-[36px] font-medium text-[#1A1A1A] text-center mb-16 md:mb-20">
            Tại sao InboxAI
          </h2>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <div className="p-8 lg:p-10 bg-white border border-[#EBEBEB] rounded-2xl hover:border-[#D4D4D4] hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[#F5F5F5] flex items-center justify-center mb-6">
                <Layers className="w-7 h-7 text-[#1A1A1A]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[#1A1A1A] mb-3">
                Hợp nhất mọi hộp thư
              </h3>
              <p className="text-[15px] text-[#6B6B6B] leading-relaxed">
                Chuyển tiếp email từ Gmail, Outlook, Yahoo về một địa chỉ duy nhất. Quản lý tập trung, không còn chuyển đổi giữa các ứng dụng.
              </p>
            </div>

            <div className="p-8 lg:p-10 bg-white border border-[#EBEBEB] rounded-2xl hover:border-[#D4D4D4] hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[#F5F5F5] flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-[#1A1A1A]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[#1A1A1A] mb-3">
                AI phân loại thông minh
              </h3>
              <p className="text-[15px] text-[#6B6B6B] leading-relaxed">
                Tự động nhận diện mức độ ưu tiên, phân loại công việc và cá nhân, tóm tắt nội dung email chỉ trong vài giây.
              </p>
            </div>

            <div className="p-8 lg:p-10 bg-white border border-[#EBEBEB] rounded-2xl hover:border-[#D4D4D4] hover:shadow-sm transition-all duration-200">
              <div className="w-14 h-14 rounded-xl bg-[#F5F5F5] flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-[#1A1A1A]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[18px] font-medium text-[#1A1A1A] mb-3">
                Luôn đúng ưu tiên
              </h3>
              <p className="text-[15px] text-[#6B6B6B] leading-relaxed">
                Highlight deadline, email cần trả lời, và gợi ý hành động. Newsletter và spam tự động được lọc ra.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="w-full bg-white py-28 md:py-36">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <p className="text-[22px] md:text-[26px] font-medium text-[#1A1A1A] italic leading-relaxed">
            &ldquo;InboxAI giúp tôi tiết kiệm 2 giờ mỗi ngày để tập trung vào công việc quan trọng.&rdquo;
          </p>
          <p className="text-[15px] text-[#6B6B6B] mt-8">Nguyễn Văn A</p>
          <p className="text-[13px] text-[#9B9B9B] mt-1">CEO, Startup X</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full bg-[#FAFAFA] py-28 md:py-36">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <h2 className="text-[32px] md:text-[36px] font-medium text-[#1A1A1A] leading-tight">
            Sẵn sàng quản lý email
            <br />
            thông minh hơn?
          </h2>
          <div className="mt-10 md:mt-12">
            <Link
              href="/signup"
              className="inline-block bg-[#1A1A1A] text-white px-10 py-4 rounded-full text-[15px] font-medium hover:bg-[#333333] transition-colors duration-200"
            >
              Bắt đầu miễn phí
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-[#EBEBEB]">
        <div className="max-w-7xl mx-auto px-8 md:px-12 lg:px-16 py-10 flex items-center justify-between">
          <span className="text-[15px] font-medium text-[#1A1A1A]">InboxAI</span>
          <span className="text-[13px] text-[#9B9B9B]">© 2025 InboxAI</span>
        </div>
      </footer>
    </main>
  )
}
