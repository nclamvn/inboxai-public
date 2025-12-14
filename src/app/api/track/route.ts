import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { trackBehavior, BehaviorAction } from '@/lib/ai/behavior-tracker'
import { logEmailAction, type ActionType } from '@/lib/ai/domain-reputation'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map behavior actions to domain reputation actions
const actionMap: Record<string, ActionType | null> = {
  open: 'open',
  reply: 'reply',
  archive: 'archive',
  delete: 'delete',
  read: null, // Don't track read separately
  star: null, // Don't track star
  unstar: null // Don't track unstar
}

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
    // Track behavior for ML
    await trackBehavior({
      userId: user.id,
      emailId,
      action,
      readDuration
    })

    // Log action for domain reputation (async, don't block)
    const domainAction = actionMap[action]
    if (domainAction) {
      // Get sender email from the email record
      ;(async () => {
        try {
          const { data: email } = await supabaseAdmin
            .from('emails')
            .select('from_address')
            .eq('id', emailId)
            .single()
          if (email?.from_address) {
            await logEmailAction(user.id, emailId, email.from_address, domainAction)
          }
        } catch (err) {
          console.error('Failed to log domain action:', err)
        }
      })()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Track behavior error:', error)
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 })
  }
}
