import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { testImapConnection, encryptPassword, EMAIL_PROVIDERS } from '@/lib/email/imap-client'
import { testSmtpConnection } from '@/lib/email/smtp-client'

// GET - List user's source accounts with email counts
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: accounts, error } = await supabase
    .from('source_accounts')
    .select(`
      id,
      email_address,
      display_name,
      provider,
      avatar_url,
      is_primary,
      color,
      is_active,
      last_sync_at,
      sync_status,
      sync_error,
      total_emails_synced,
      auth_type,
      created_at
    `)
    .eq('user_id', user.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get email counts per account
  const accountsWithCounts = await Promise.all(
    (accounts || []).map(async (account) => {
      const { count: totalCount } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('source_account_id', account.id)

      const { count: unreadCount } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('source_account_id', account.id)
        .eq('is_read', false)

      return {
        ...account,
        email_count: totalCount || 0,
        unread_count: unreadCount || 0,
      }
    })
  )

  return NextResponse.json({ accounts: accountsWithCounts })
}

// POST - Add new source account
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    email_address,
    display_name,
    provider,
    username,
    password,
    // Optional custom settings
    imap_host,
    imap_port,
    imap_secure,
    smtp_host,
    smtp_port,
    smtp_secure
  } = body

  if (!email_address || !provider || !username || !password) {
    return NextResponse.json({
      error: 'Missing required fields: email_address, provider, username, password'
    }, { status: 400 })
  }

  // Get provider defaults or use custom
  const providerConfig = EMAIL_PROVIDERS[provider as keyof typeof EMAIL_PROVIDERS] || EMAIL_PROVIDERS.custom

  const config = {
    imap_host: imap_host || providerConfig.imap_host,
    imap_port: imap_port || providerConfig.imap_port,
    imap_secure: imap_secure ?? providerConfig.imap_secure,
    smtp_host: smtp_host || providerConfig.smtp_host,
    smtp_port: smtp_port || providerConfig.smtp_port,
    smtp_secure: smtp_secure ?? providerConfig.smtp_secure
  }

  // Test IMAP connection
  const imapTest = await testImapConnection({
    host: config.imap_host,
    port: config.imap_port,
    secure: config.imap_secure,
    username,
    password
  })

  if (!imapTest.success) {
    return NextResponse.json({
      error: 'IMAP connection failed',
      details: imapTest.error
    }, { status: 400 })
  }

  // Test SMTP connection
  const smtpTest = await testSmtpConnection({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    username,
    password
  })

  if (!smtpTest.success) {
    return NextResponse.json({
      error: 'SMTP connection failed',
      details: smtpTest.error
    }, { status: 400 })
  }

  // Encrypt password
  const password_encrypted = encryptPassword(password)

  // Save account
  const { data: account, error } = await supabase
    .from('source_accounts')
    .insert({
      user_id: user.id,
      email_address,
      display_name: display_name || email_address,
      provider,
      imap_host: config.imap_host,
      imap_port: config.imap_port,
      imap_secure: config.imap_secure,
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      smtp_secure: config.smtp_secure,
      username,
      password_encrypted,
      is_active: true
    })
    .select('id, email_address, display_name, provider, is_active, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({
        error: 'Email account already connected'
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    account,
    message: 'Account connected successfully'
  })
}
