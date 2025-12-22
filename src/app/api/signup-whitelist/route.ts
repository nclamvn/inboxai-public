import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================
// OPEN BETA CONFIG - Set to false to require whitelist
// ============================================
const OPEN_BETA_ENABLED = true
const MAX_BETA_USERS = 100
// ============================================

let supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }
  return supabaseAdmin
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email và mật khẩu là bắt buộc' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const supabase = getSupabaseAdmin()

    // OPEN BETA: Allow signup if under limit
    if (OPEN_BETA_ENABLED) {
      const { data: usersData } = await supabase.auth.admin.listUsers()
      const userCount = usersData?.users?.length || 0

      if (userCount >= MAX_BETA_USERS) {
        return NextResponse.json({
          error: `Đã đạt giới hạn ${MAX_BETA_USERS} người dùng beta. Vui lòng đăng ký waitlist.`
        }, { status: 403 })
      }
    } else {
      // Original whitelist check (when OPEN_BETA_ENABLED = false)
      const { data: whitelisted } = await supabase
        .from('whitelist')
        .select('id, is_active')
        .eq('email', emailLower)
        .eq('is_active', true)
        .maybeSingle()

      const { data: accessRequest } = await supabase
        .from('access_requests')
        .select('id, status')
        .eq('email', emailLower)
        .eq('status', 'approved')
        .maybeSingle()

      if (!whitelisted && !accessRequest) {
        return NextResponse.json({
          error: 'Email chưa được duyệt. Vui lòng đăng ký waitlist.'
        }, { status: 403 })
      }
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === emailLower)

    if (existingUser) {
      return NextResponse.json({
        error: 'Email này đã đăng ký. Vui lòng đăng nhập.'
      }, { status: 400 })
    }

    // Create user with email confirmed (since they're whitelisted)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName || 'InboxAI User'
      }
    })

    if (createError) {
      console.error('[SIGNUP-WHITELIST] Create user error:', createError)
      return NextResponse.json({
        error: createError.message || 'Không thể tạo tài khoản'
      }, { status: 500 })
    }

    // Create profile
    if (newUser?.user) {
      await supabase.from('profiles').upsert({
        id: newUser.user.id,
        email: emailLower,
        display_name: fullName || 'InboxAI User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    }

    console.log(`[SIGNUP-WHITELIST] User created: ${emailLower}`)

    return NextResponse.json({
      success: true,
      message: 'Đăng ký thành công! Bạn có thể đăng nhập ngay.'
    })

  } catch (error) {
    console.error('[SIGNUP-WHITELIST] Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
