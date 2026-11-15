import { NextRequest, NextResponse } from 'next/server'
import { registrationAdmission, registrationEmailSchema, registrationEnabled } from '@/lib/auth/registration'

export async function POST(request: NextRequest) {
  if (!registrationEnabled()) return NextResponse.json({ allowed: false, error: 'Đăng ký hiện chưa được mở.' }, { status: 503 })
  const parsed = registrationEmailSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ allowed: false, error: 'Email không hợp lệ.' }, { status: 400 })
  try {
    const denied = await registrationAdmission(request, parsed.data.email)
    if (denied) {
      if (denied.status === 403) return NextResponse.json({ allowed:false, status:'not_found',
        message:'Vui lòng đăng ký danh sách chờ.' }, { headers:{ 'Cache-Control':'no-store' } })
      return denied
    }
    return NextResponse.json({ allowed: true, status: 'verification_required', message: 'Hoàn tất biểu mẫu và xác minh email để đăng ký.' },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ allowed: false, error: 'Đăng ký tạm thời chưa khả dụng.' }, { status: 503 })
  }
}
