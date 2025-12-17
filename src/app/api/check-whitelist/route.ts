import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseInstance
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Check if email is in whitelist
    const { data: whitelisted } = await getSupabase()
      .from('whitelist')
      .select('id, is_active')
      .eq('email', emailLower)
      .eq('is_active', true)
      .maybeSingle()

    if (whitelisted) {
      return NextResponse.json({
        allowed: true,
        message: 'Email đã được duyệt! Bạn có thể đăng ký tài khoản.'
      })
    }

    // Check access_requests status
    const { data: request_data } = await getSupabase()
      .from('access_requests')
      .select('id, status')
      .eq('email', emailLower)
      .maybeSingle()

    if (request_data) {
      if (request_data.status === 'approved') {
        return NextResponse.json({
          allowed: true,
          message: 'Email đã được duyệt! Bạn có thể đăng ký tài khoản.'
        })
      }
      if (request_data.status === 'pending') {
        return NextResponse.json({
          allowed: false,
          status: 'pending',
          message: 'Yêu cầu của bạn đang được xem xét. Vui lòng chờ email thông báo.'
        })
      }
      if (request_data.status === 'rejected') {
        return NextResponse.json({
          allowed: false,
          status: 'rejected',
          message: 'Yêu cầu trước đó đã bị từ chối.'
        })
      }
    }

    // Not in system yet
    return NextResponse.json({
      allowed: false,
      status: 'not_found',
      message: 'Email chưa đăng ký. Vui lòng đăng ký waitlist.'
    })

  } catch (error) {
    console.error('[CHECK-WHITELIST] Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
