/**
 * GET /api/email-providers
 * Get list of email provider presets
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: providers, error } = await supabase
      .from('email_provider_presets')
      .select('*')
      .order('name')

    if (error) {
      // If table doesn't exist, return hardcoded defaults
      console.warn('[Providers] Table not found, using defaults:', error.message)
      return NextResponse.json({
        providers: getDefaultProviders()
      })
    }

    return NextResponse.json({
      providers: providers || getDefaultProviders()
    })
  } catch (error: any) {
    console.error('[Providers] Error:', error)
    return NextResponse.json({
      providers: getDefaultProviders()
    })
  }
}

// Default providers if database table doesn't exist
function getDefaultProviders() {
  return [
    {
      id: 'gmail',
      name: 'Gmail',
      imap_host: 'imap.gmail.com',
      imap_port: 993,
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      requires_app_password: true,
      notes: 'Dùng App Password từ Google Account > Security'
    },
    {
      id: 'outlook',
      name: 'Outlook / Hotmail',
      imap_host: 'outlook.office365.com',
      imap_port: 993,
      smtp_host: 'smtp.office365.com',
      smtp_port: 587,
      requires_app_password: false,
      notes: 'Dùng mật khẩu thường hoặc App Password'
    },
    {
      id: 'yahoo',
      name: 'Yahoo Mail',
      imap_host: 'imap.mail.yahoo.com',
      imap_port: 993,
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 587,
      requires_app_password: true,
      notes: 'Dùng App Password từ Yahoo Account Security'
    },
    {
      id: 'zoho',
      name: 'Zoho Mail',
      imap_host: 'imap.zoho.com',
      imap_port: 993,
      smtp_host: 'smtp.zoho.com',
      smtp_port: 587,
      requires_app_password: false,
      notes: 'Enable IMAP in Zoho Mail settings'
    },
    {
      id: 'icloud',
      name: 'iCloud Mail',
      imap_host: 'imap.mail.me.com',
      imap_port: 993,
      smtp_host: 'smtp.mail.me.com',
      smtp_port: 587,
      requires_app_password: true,
      notes: 'Tạo App-Specific Password trong Apple ID'
    },
    {
      id: 'yandex',
      name: 'Yandex Mail',
      imap_host: 'imap.yandex.com',
      imap_port: 993,
      smtp_host: 'smtp.yandex.com',
      smtp_port: 587,
      requires_app_password: true,
      notes: 'Tạo App Password trong Yandex settings'
    },
    {
      id: 'fastmail',
      name: 'FastMail',
      imap_host: 'imap.fastmail.com',
      imap_port: 993,
      smtp_host: 'smtp.fastmail.com',
      smtp_port: 587,
      requires_app_password: true,
      notes: 'Dùng App Password'
    },
    {
      id: 'hostinger',
      name: 'Hostinger Email',
      imap_host: 'imap.hostinger.com',
      imap_port: 993,
      smtp_host: 'smtp.hostinger.com',
      smtp_port: 587,
      requires_app_password: false,
      notes: 'Dùng mật khẩu email'
    },
    {
      id: 'namecheap',
      name: 'Namecheap Private Email',
      imap_host: 'mail.privateemail.com',
      imap_port: 993,
      smtp_host: 'mail.privateemail.com',
      smtp_port: 587,
      requires_app_password: false,
      notes: 'Dùng mật khẩu email'
    },
    {
      id: 'custom',
      name: 'Máy chủ tùy chỉnh',
      imap_host: '',
      imap_port: 993,
      smtp_host: '',
      smtp_port: 587,
      requires_app_password: false,
      notes: 'Nhập thông tin server thủ công'
    }
  ]
}
