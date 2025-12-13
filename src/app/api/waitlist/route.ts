import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rate limit: 5 requests per IP per minute
const RATE_LIMIT_CONFIG = {
  maxRequests: 5,
  windowMs: 60 * 1000 // 1 minute
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request)
    const rateLimitResult = checkRateLimit(`waitlist:${clientIP}`, RATE_LIMIT_CONFIG)

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitResult.resetTime)
          }
        }
      )
    }

    const { email, name } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Check if already in waitlist
    const { data: existing } = await supabase
      .from('access_requests')
      .select('id, status')
      .eq('email', emailLower)
      .single()

    if (existing) {
      // Already registered
      return NextResponse.json({
        success: true,
        message: 'Bạn đã đăng ký trước đó. Chúng tôi sẽ liên hệ sớm!'
      })
    }

    // Check if already whitelisted
    const { data: whitelisted } = await supabase
      .from('whitelist')
      .select('id')
      .eq('email', emailLower)
      .single()

    if (whitelisted) {
      return NextResponse.json({
        success: true,
        message: 'Email của bạn đã được duyệt! Vui lòng đăng nhập.',
        redirect: '/login'
      })
    }

    // Add to waitlist
    const { error } = await supabase
      .from('access_requests')
      .insert({
        email: emailLower,
        name: name?.trim() || null,
        status: 'pending'
      })

    if (error) {
      console.error('[WAITLIST] Error:', error)
      return NextResponse.json({ error: 'Không thể đăng ký. Vui lòng thử lại.' }, { status: 500 })
    }

    console.log(`[WAITLIST] New signup: ${emailLower}`)

    return NextResponse.json({
      success: true,
      message: 'Bạn đã được thêm vào danh sách chờ của InboxAI. Chúng tôi sẽ liên hệ khi có slot mới!'
    })

  } catch (error) {
    console.error('[WAITLIST] Exception:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
