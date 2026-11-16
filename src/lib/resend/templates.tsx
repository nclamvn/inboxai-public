import * as React from 'react'

// ====== WAITLIST TEMPLATES ======

interface WaitlistConfirmationEmailProps {
  email: string
  name?: string
}

export function WaitlistConfirmationEmail({ email, name }: WaitlistConfirmationEmailProps) {
  const userName = name || 'bạn'
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0', maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '40px 20px 20px', borderBottom: '1px solid #eee' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>InboxAI</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Email thông minh với AI</div>
      </div>

      {/* Content */}
      <div style={{ padding: '40px 30px' }}>
        <h2 style={{ color: '#1a1a1a', fontSize: '20px', fontWeight: '600', margin: '0 0 20px' }}>
          Xin chào {userName}!
        </h2>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 16px' }}>
          Cảm ơn bạn đã đăng ký tham gia InboxAI - hệ thống email thông minh với AI.
        </p>

        <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', margin: '24px 0', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#666' }}>
            <strong style={{ color: '#333' }}>Trạng thái:</strong> Đang chờ duyệt
          </p>
          <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
            <strong style={{ color: '#333' }}>Email:</strong> {email}
          </p>
        </div>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 16px' }}>
          Chúng tôi sẽ xem xét yêu cầu của bạn và gửi email thông báo ngay khi tài khoản được kích hoạt.
        </p>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0' }}>
          Trân trọng,<br />
          <strong>Team InboxAI</strong>
        </p>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #eee', padding: '20px 30px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: '0' }}>
          © 2025 InboxAI. Made with love in Vietnam.
        </p>
      </div>
    </div>
  )
}

interface WaitlistApprovedEmailProps {
  email: string
  name?: string
}

export function WaitlistApprovedEmail({ name }: WaitlistApprovedEmailProps) {
  const userName = name || 'bạn'
  const signupUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/signup`
    : 'https://inboxai.vn/signup'

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0', maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '40px 20px 20px', borderBottom: '1px solid #eee' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>InboxAI</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Email thông minh với AI</div>
      </div>

      {/* Success Banner */}
      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '30px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '600' }}>Chúc mừng {userName}!</h2>
        <p style={{ margin: '0', opacity: 0.9, fontSize: '14px' }}>Bạn đã được duyệt tham gia InboxAI</p>
      </div>

      {/* Content */}
      <div style={{ padding: '40px 30px' }}>
        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 16px' }}>
          Xin chào {userName},
        </p>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 16px' }}>
          Tin tuyệt vời! Yêu cầu tham gia InboxAI của bạn đã được phê duyệt.
        </p>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 24px' }}>
          Bạn có thể tạo tài khoản và bắt đầu sử dụng ngay bây giờ:
        </p>

        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <a
            href={signupUrl}
            style={{
              display: 'inline-block',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '14px 32px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '15px'
            }}
          >
            Tạo tài khoản ngay
          </a>
        </div>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '24px 0 8px', fontWeight: '600' }}>
          InboxAI giúp bạn:
        </p>
        <ul style={{ color: '#444', fontSize: '15px', lineHeight: '1.9', paddingLeft: '20px', margin: '0 0 24px' }}>
          <li>Tự động phân loại email thông minh</li>
          <li>Tóm tắt email dài chỉ trong vài giây</li>
          <li>Gợi ý phản hồi nhanh với AI</li>
          <li>Tìm kiếm ngữ nghĩa tiếng Việt</li>
        </ul>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '0 0 8px' }}>
          Nếu có câu hỏi, đừng ngần ngại liên hệ với chúng tôi.
        </p>

        <p style={{ color: '#444', fontSize: '15px', lineHeight: '1.7', margin: '24px 0 0' }}>
          Trân trọng,<br />
          <strong>Team InboxAI</strong>
        </p>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #eee', padding: '20px 30px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: '0 0 8px' }}>
          © 2025 InboxAI. All rights reserved.
        </p>
        <a href="https://inboxai.vn" style={{ color: '#666', fontSize: '12px' }}>inboxai.vn</a>
      </div>
    </div>
  )
}

// ====== USER TEMPLATES ======

interface WelcomeEmailProps {
  userName: string
}

export function WelcomeEmail({ userName }: WelcomeEmailProps) {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '40px', maxWidth: '600px' }}>
      <h1 style={{ color: '#1A1A1A', fontSize: '24px', fontWeight: '500' }}>
        Chào mừng đến với InboxAI!
      </h1>
      <p style={{ color: '#6B6B6B', fontSize: '15px', lineHeight: '1.6' }}>
        Xin chào {userName},
      </p>
      <p style={{ color: '#6B6B6B', fontSize: '15px', lineHeight: '1.6' }}>
        Cảm ơn bạn đã đăng ký InboxAI - trợ lý email thông minh với AI.
        Bây giờ bạn có thể:
      </p>
      <ul style={{ color: '#6B6B6B', fontSize: '15px', lineHeight: '1.8' }}>
        <li>Nhận và gửi email trực tiếp</li>
        <li>AI tự động phân loại email</li>
        <li>AI hỗ trợ soạn thư trả lời</li>
        <li>Xem báo cáo productivity hàng tuần</li>
      </ul>
      <a
        href="https://inboxai.vn/inbox"
        style={{
          display: 'inline-block',
          marginTop: '20px',
          padding: '12px 24px',
          backgroundColor: '#1A1A1A',
          color: '#FFFFFF',
          textDecoration: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500'
        }}
      >
        Mở InboxAI
      </a>
      <p style={{ color: '#9B9B9B', fontSize: '13px', marginTop: '40px' }}>
        Nếu cần hỗ trợ, reply email này hoặc liên hệ support@inboxai.vn
      </p>
    </div>
  )
}

interface NotificationEmailProps {
  userName: string
  subject: string
  message: string
  actionUrl?: string
  actionText?: string
}

export function NotificationEmail({
  userName,
  subject,
  message,
  actionUrl,
  actionText
}: NotificationEmailProps) {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '40px', maxWidth: '600px' }}>
      <h1 style={{ color: '#1A1A1A', fontSize: '20px', fontWeight: '500' }}>
        {subject}
      </h1>
      <p style={{ color: '#6B6B6B', fontSize: '15px', lineHeight: '1.6' }}>
        Xin chào {userName},
      </p>
      <p style={{ color: '#6B6B6B', fontSize: '15px', lineHeight: '1.6' }}>
        {message}
      </p>
      {actionUrl && actionText && (
        <a
          href={actionUrl}
          style={{
            display: 'inline-block',
            marginTop: '20px',
            padding: '12px 24px',
            backgroundColor: '#1A1A1A',
            color: '#FFFFFF',
            textDecoration: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {actionText}
        </a>
      )}
    </div>
  )
}
