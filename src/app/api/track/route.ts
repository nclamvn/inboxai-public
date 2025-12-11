import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trackBehavior, BehaviorAction } from '@/lib/ai/behavior-tracker'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId, action, readDuration } = await request.json()

  if (!emailId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate action
  const validActions: BehaviorAction[] = ['open', 'read', 'reply', 'archive', 'delete', 'star', 'unstar']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    await trackBehavior({
      userId: user.id,
      emailId,
      action,
      readDuration
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Track behavior error:', error)
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 })
  }
}
