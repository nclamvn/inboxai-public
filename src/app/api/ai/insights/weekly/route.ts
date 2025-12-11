import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWeeklyReport } from '@/lib/ai/insights-service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await generateWeeklyReport(user.id)
    return NextResponse.json(report)
  } catch (error) {
    console.error('Failed to generate weekly report:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
