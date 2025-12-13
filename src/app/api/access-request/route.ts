import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

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

// Rate limit: 3 requests per IP per minute
const RATE_LIMIT_CONFIG = {
  maxRequests: 3,
  windowMs: 60 * 1000 // 1 minute
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request)
    const rateLimitResult = checkRateLimit(`access-request:${clientIP}`, RATE_LIMIT_CONFIG)

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

    const { email, fullName, reason } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email là bắt buộc' },
        { status: 400 }
      )
    }

    if (!fullName) {
      return NextResponse.json(
        { error: 'Họ tên là bắt buộc' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if already in whitelist
    const { data: existing } = await getSupabase()
      .from('whitelist')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Email này đã có quyền truy cập' },
        { status: 400 }
      )
    }

    // Check if already requested
    const { data: existingRequest } = await getSupabase()
      .from('access_requests')
      .select('id, status')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'Yêu cầu của bạn đang được xem xét' },
          { status: 400 }
        )
      }
      if (existingRequest.status === 'rejected') {
        return NextResponse.json(
          { error: 'Yêu cầu trước đó đã bị từ chối. Vui lòng liên hệ admin.' },
          { status: 400 }
        )
      }
    }

    // Create new access request
    const { error } = await getSupabase()
      .from('access_requests')
      .insert({
        email: normalizedEmail,
        full_name: fullName,
        reason: reason || null,
        status: 'pending'
      })

    if (error) {
      console.error('Failed to create access request:', error)
      return NextResponse.json(
        { error: 'Có lỗi xảy ra. Vui lòng thử lại.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Access request error:', error)
    return NextResponse.json(
      { error: 'Có lỗi xảy ra. Vui lòng thử lại.' },
      { status: 500 }
    )
  }
}
