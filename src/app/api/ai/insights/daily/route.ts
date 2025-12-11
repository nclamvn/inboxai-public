import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDailyDigest } from '@/lib/ai/insights-service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const digest = await generateDailyDigest(user.id)
    return NextResponse.json(digest)
  } catch (error) {
    console.error('Failed to generate daily digest:', error)
    return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 })
  }
}
