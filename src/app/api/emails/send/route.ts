import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmailViaSMTP } from '@/lib/email/smtp-client'
import { decryptPassword, EMAIL_PROVIDERS } from '@/lib/email/imap-client'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { sourceAccountId, to, subject, text, html, cc, bcc, replyToEmailId } = body

  if (!sourceAccountId) {
    return NextResponse.json(
      { error: 'Vui lòng chọn tài khoản gửi' },
      { status: 400 }
    )
  }

  if (!to || !subject) {
    return NextResponse.json(
      { error: 'Vui lòng điền đầy đủ người nhận và tiêu đề' },
      { status: 400 }
    )
  }

  try {
    // Get source account with SMTP settings
    const { data: account, error: accountError } = await supabaseAdmin
      .from('source_accounts')
      .select('*')
      .eq('id', sourceAccountId)
      .eq('user_id', user.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Không tìm thấy tài khoản gửi' },
        { status: 404 }
      )
    }

    // Get SMTP config from provider presets or custom settings
    let smtpHost = account.smtp_host
    let smtpPort = account.smtp_port
    let smtpSecure = account.smtp_secure

    // If provider is known, use preset if not custom configured
    if (account.provider && account.provider !== 'custom' && !smtpHost) {
      const preset = EMAIL_PROVIDERS[account.provider as keyof typeof EMAIL_PROVIDERS]
      if (preset) {
        smtpHost = preset.smtp_host
        smtpPort = preset.smtp_port
        smtpSecure = preset.smtp_secure
      }
    }

    if (!smtpHost) {
      return NextResponse.json(
        { error: 'Tài khoản chưa cấu hình SMTP' },
        { status: 400 }
      )
    }

    // Decrypt password
    let password: string
    try {
      password = decryptPassword(account.password_encrypted)
    } catch (decryptError) {
      console.error('Password decrypt error:', decryptError)
      return NextResponse.json(
        { error: 'Không thể giải mã mật khẩu. Vui lòng xóa và thêm lại tài khoản email.' },
        { status: 500 }
      )
    }

    // Handle reply - get original email subject
    let finalSubject = subject
    let replyTo: string | undefined

    if (replyToEmailId) {
      const { data: originalEmail } = await supabaseAdmin
        .from('emails')
        .select('subject, from_address')
        .eq('id', replyToEmailId)
        .single()

      if (originalEmail) {
        if (!subject.toLowerCase().startsWith('re:')) {
          finalSubject = `Re: ${originalEmail.subject || ''}`
        }
        replyTo = originalEmail.from_address
      }
    }

    // Send via SMTP
    const result = await sendEmailViaSMTP(
      {
        host: smtpHost,
        port: smtpPort || 587,
        secure: smtpSecure ?? false,
        username: account.username || account.email_address,
        password
      },
      {
        from: {
          name: account.display_name || account.email_address.split('@')[0],
          address: account.email_address
        },
        to: Array.isArray(to) ? to : [to],
        cc,
        bcc,
        subject: finalSubject,
        text: text || '',
        html: html || undefined,
        replyTo
      }
    )

    if (!result.success) {
      console.error('SMTP send error:', result.error)
      return NextResponse.json(
        { error: result.error || 'Gửi email thất bại' },
        { status: 500 }
      )
    }

    // Save sent email to database
    const toAddresses = Array.isArray(to) ? to : [to]

    await supabaseAdmin.from('emails').insert({
      user_id: user.id,
      source_account_id: sourceAccountId,
      message_id: result.messageId,
      from_address: account.email_address,
      from_name: account.display_name || account.email_address.split('@')[0],
      to_addresses: toAddresses,
      cc_addresses: cc || [],
      subject: finalSubject,
      body_text: text,
      body_html: html,
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      is_read: true,
      category: 'work',
      send_status: 'sent'
    })

    return NextResponse.json({
      success: true,
      messageId: result.messageId
    })
  } catch (error) {
    console.error('Send email API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
