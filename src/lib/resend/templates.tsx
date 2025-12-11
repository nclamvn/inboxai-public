import * as React from 'react'

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
