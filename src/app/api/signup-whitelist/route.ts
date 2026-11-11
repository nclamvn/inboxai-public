import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrationAdmission, registrationEnabled, registrationSchema, requireEmailConfirmation } from '@/lib/auth/registration'

export async function POST(request: NextRequest) {
  if (!registrationEnabled()) return NextResponse.json({ error: 'Đăng ký hiện chưa được mở.' }, { status: 503 })
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Email, họ tên hoặc mật khẩu không hợp lệ. Mật khẩu cần ít nhất 12 ký tự.' }, { status: 400 })
  try {
    const { email, password, fullName } = parsed.data
    const denied = await registrationAdmission(request, email)
    if (denied) return denied
    if (!await requireEmailConfirmation()) return NextResponse.json({ error: 'Đăng ký tạm thời chưa khả dụng.' }, { status: 503 })
    const base = new URL(process.env.NEXT_PUBLIC_APP_URL!)
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: new URL('/auth/callback', base).toString() },
    })
    if (error) return NextResponse.json({ error: 'Không thể hoàn tất đăng ký. Vui lòng thử lại sau.' }, { status: error.status === 429 ? 429 : 400 })
    if (data.session) {
      await supabase.auth.signOut({ scope: 'global' })
      return NextResponse.json({ error: 'Đăng ký tạm thời chưa khả dụng.' }, { status: 503 })
    }
    return NextResponse.json({ success: true, requires_email_verification: true,
      message: 'Nếu địa chỉ đủ điều kiện đăng ký, bạn sẽ nhận được email xác minh. Vui lòng xác minh trước khi đăng nhập.' },
    { status: 202, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Đăng ký tạm thời chưa khả dụng.' }, { status: 503 })
  }
}
