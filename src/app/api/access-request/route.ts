import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role for server-side access request creation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, reason } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email la bat buoc' },
        { status: 400 }
      )
    }

    if (!fullName) {
      return NextResponse.json(
        { error: 'Ho ten la bat buoc' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if already in whitelist
    const { data: existing } = await supabaseAdmin
      .from('whitelist')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Email nay da co quyen truy cap' },
        { status: 400 }
      )
    }

    // Check if already requested
    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'Yeu cau cua ban dang duoc xem xet' },
          { status: 400 }
        )
      }
      if (existingRequest.status === 'rejected') {
        return NextResponse.json(
          { error: 'Yeu cau truoc do da bi tu choi. Vui long lien he admin.' },
          { status: 400 }
        )
      }
    }

    // Create new access request
    const { error } = await supabaseAdmin
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
        { error: 'Co loi xay ra. Vui long thu lai.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Access request error:', error)
    return NextResponse.json(
      { error: 'Co loi xay ra. Vui long thu lai.' },
      { status: 500 }
    )
  }
}
