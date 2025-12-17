import { resend, DEFAULT_FROM } from './client'

interface SendWaitlistEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Generate HTML for waitlist confirmation email
 */
function getWaitlistConfirmationHtml(email: string, name?: string): string {
  const userName = name || 'bạn'
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 0; margin: 0; background: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="text-align: center; padding: 40px 20px 20px; border-bottom: 1px solid #eee;">
          <div style="font-size: 24px; font-weight: bold; color: #2563eb;">InboxAI</div>
          <div style="font-size: 13px; color: #666; margin-top: 4px;">Email thông minh với AI</div>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 20px;">
            Xin chào ${userName}!
          </h2>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
            Cảm ơn bạn đã đăng ký tham gia InboxAI - hệ thống email thông minh với AI.
          </p>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
              <strong style="color: #333;">Trạng thái:</strong> ⏳ Đang chờ duyệt
            </p>
            <p style="margin: 0; font-size: 14px; color: #666;">
              <strong style="color: #333;">Email:</strong> ${email}
            </p>
          </div>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
            Chúng tôi sẽ xem xét yêu cầu của bạn và gửi email thông báo ngay khi tài khoản được kích hoạt.
          </p>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0;">
            Trân trọng,<br>
            <strong>Team InboxAI</strong>
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #eee; padding: 20px 30px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            © 2025 InboxAI. Made with love in Vietnam.
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Generate HTML for waitlist approval email
 */
function getWaitlistApprovalHtml(email: string, name?: string): string {
  const userName = name || 'bạn'
  const signupUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/signup`
    : 'https://inboxai.vn/signup'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 0; margin: 0; background: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="text-align: center; padding: 40px 20px 20px; border-bottom: 1px solid #eee;">
          <div style="font-size: 24px; font-weight: bold; color: #2563eb;">InboxAI</div>
          <div style="font-size: 13px; color: #666; margin-top: 4px;">Email thông minh với AI</div>
        </div>

        <!-- Success Banner -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
          <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 600;">Chúc mừng ${userName}!</h2>
          <p style="margin: 0; opacity: 0.9; font-size: 14px;">Bạn đã được duyệt tham gia InboxAI</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
            Xin chào ${userName},
          </p>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
            Tin tuyệt vời! Yêu cầu tham gia InboxAI của bạn đã được phê duyệt.
          </p>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
            Bạn có thể tạo tài khoản và bắt đầu sử dụng ngay bây giờ:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${signupUrl}"
               style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Tạo tài khoản ngay
            </a>
          </div>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 24px 0 8px; font-weight: 600;">
            InboxAI giúp bạn:
          </p>
          <ul style="color: #444; font-size: 15px; line-height: 1.9; padding-left: 20px; margin: 0 0 24px;">
            <li>📧 Tự động phân loại email thông minh</li>
            <li>📝 Tóm tắt email dài chỉ trong vài giây</li>
            <li>💬 Gợi ý phản hồi nhanh với AI</li>
            <li>🔍 Tìm kiếm ngữ nghĩa tiếng Việt</li>
          </ul>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">
            Nếu có câu hỏi, đừng ngần ngại liên hệ với chúng tôi.
          </p>

          <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 24px 0 0;">
            Trân trọng,<br>
            <strong>Team InboxAI</strong>
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #eee; padding: 20px 30px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0 0 8px;">
            © 2025 InboxAI. All rights reserved.
          </p>
          <a href="https://inboxai.vn" style="color: #666; font-size: 12px;">inboxai.vn</a>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Send confirmation email when user signs up for waitlist
 */
export async function sendWaitlistConfirmation(
  email: string,
  name?: string
): Promise<SendWaitlistEmailResult> {
  try {
    // Check if RESEND_API_KEY is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('[WAITLIST EMAIL] RESEND_API_KEY not configured, skipping email')
      return { success: true, messageId: 'skipped-no-api-key' }
    }

    const html = getWaitlistConfirmationHtml(email, name)

    const { data, error } = await resend.emails.send({
      from: `InboxAI <${DEFAULT_FROM}>`,
      to: [email],
      subject: '✅ Đã nhận đăng ký - InboxAI',
      html,
    })

    if (error) {
      console.error('[WAITLIST EMAIL] Confirmation error:', error)
      return { success: false, error: error.message }
    }

    console.log(`[WAITLIST EMAIL] Confirmation sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    console.error('[WAITLIST EMAIL] Confirmation exception:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

/**
 * Send approval email when admin approves waitlist request
 */
export async function sendWaitlistApproval(
  email: string,
  name?: string
): Promise<SendWaitlistEmailResult> {
  try {
    // Check if RESEND_API_KEY is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('[WAITLIST EMAIL] RESEND_API_KEY not configured, skipping email')
      return { success: true, messageId: 'skipped-no-api-key' }
    }

    const html = getWaitlistApprovalHtml(email, name)

    const { data, error } = await resend.emails.send({
      from: `InboxAI <${DEFAULT_FROM}>`,
      to: [email],
      subject: '🎉 Chào mừng bạn đến với InboxAI!',
      html,
    })

    if (error) {
      console.error('[WAITLIST EMAIL] Approval error:', error)
      return { success: false, error: error.message }
    }

    console.log(`[WAITLIST EMAIL] Approval sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    console.error('[WAITLIST EMAIL] Approval exception:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}
