import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================
// OPEN BETA CONFIG - Set to false to require whitelist
// ============================================
const OPEN_BETA_ENABLED = true
const MAX_BETA_USERS = 100
// ============================================

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
    const supabase = getSupabase()

    // OPEN BETA: Allow anyone if under limit
    if (OPEN_BETA_ENABLED) {
      // Count existing users
      const { count } = await supabase.auth.admin.listUsers()
      const userCount = count || 0

      if (userCount >= MAX_BETA_USERS) {
        return NextResponse.json({
          allowed: false,
          status: 'beta_full',
          message: `Đã đạt giới hạn ${MAX_BETA_USERS} người dùng beta. Vui lòng đăng ký waitlist.`
        })
      }

      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === emailLower)

      if (existingUser) {
        return NextResponse.json({
          allowed: false,
          status: 'exists',
          message: 'Email này đã đăng ký. Vui lòng đăng nhập.'
        })
      }

      // Allow signup
      return NextResponse.json({
        allowed: true,
        status: 'open_beta',
        message: `Chào mừng bạn đến với Open Beta! (${userCount}/${MAX_BETA_USERS} slots)`
      })
    }

    // Original whitelist logic below (when OPEN_BETA_ENABLED = false)

    // Check if email is in whitelist
    const { data: whitelisted } = await supabase
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
    const { data: request_data } = await supabase
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
