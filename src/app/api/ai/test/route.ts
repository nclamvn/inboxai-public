import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyEmail } from '@/lib/ai/classifier'

export async function GET() {
  // Auth check - only authenticated users can test
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const testEmail = {
    from_address: 'boss@company.com',
    from_name: 'Nguyễn Văn A',
    subject: 'Báo cáo Q4 - Cần review trước 5pm',
    body_text: 'Hi, cần bạn review báo cáo Q4 trước 5pm hôm nay. Đây là deadline cuối cùng. Thanks!'
  }

  try {
    const result = await classifyEmail(testEmail)

    return NextResponse.json({
      test_email: testEmail,
      classification: result
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Classification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
