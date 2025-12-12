import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { markSenderAsTrusted, markSenderAsUntrusted, blockSender } from '@/lib/ai/sender-trust'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type FeedbackAction = 'not_spam' | 'is_spam' | 'block_sender' | 'recategorize'

interface FeedbackRequest {
  action: FeedbackAction
  newCategory?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: FeedbackRequest = await request.json()
  const { action, newCategory } = body

  if (!action) {
    return NextResponse.json({ error: 'Action required' }, { status: 400 })
  }

  // Get email
  const { data: email, error } = await supabaseAdmin
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  const originalCategory = email.category

  try {
    switch (action) {
      case 'not_spam':
        // User says this is NOT spam → trust sender
        await markSenderAsTrusted(user.id, email.from_address, 'marked_not_spam')

        // Move to personal (or keep original if was something else)
        const targetCategory = originalCategory === 'spam' ? 'personal' : originalCategory
        await supabaseAdmin
          .from('emails')
          .update({ category: targetCategory })
          .eq('id', emailId)

        // Log feedback
        await logFeedback(user.id, emailId, originalCategory, targetCategory, 'not_spam')

        return NextResponse.json({
          success: true,
          message: 'Đã đánh dấu không phải spam',
          newCategory: targetCategory
        })

      case 'is_spam':
        // User says this IS spam → untrust sender
        await markSenderAsUntrusted(user.id, email.from_address)

        // Move to spam
        await supabaseAdmin
          .from('emails')
          .update({ category: 'spam' })
          .eq('id', emailId)

        // Log feedback
        await logFeedback(user.id, emailId, originalCategory, 'spam', 'is_spam')

        return NextResponse.json({
          success: true,
          message: 'Đã đánh dấu là spam',
          newCategory: 'spam'
        })

      case 'block_sender':
        // Block sender completely
        await blockSender(user.id, email.from_address)

        // Move current email to spam
        await supabaseAdmin
          .from('emails')
          .update({ category: 'spam', is_deleted: true })
          .eq('id', emailId)

        // Also move all other emails from this sender to spam
        await supabaseAdmin
          .from('emails')
          .update({ category: 'spam' })
          .eq('user_id', user.id)
          .eq('from_address', email.from_address)

        return NextResponse.json({
          success: true,
          message: `Đã chặn ${email.from_address}`,
          blocked: true
        })

      case 'recategorize':
        if (!newCategory) {
          return NextResponse.json({ error: 'newCategory required' }, { status: 400 })
        }

        // Update category
        await supabaseAdmin
          .from('emails')
          .update({ category: newCategory })
          .eq('id', emailId)

        // Update sender trust based on transition
        if (originalCategory === 'spam' && newCategory !== 'spam') {
          // Moving FROM spam = trust sender
          await markSenderAsTrusted(user.id, email.from_address, 'marked_not_spam')
        } else if (newCategory === 'spam' && originalCategory !== 'spam') {
          // Moving TO spam = untrust sender
          await markSenderAsUntrusted(user.id, email.from_address)
        }

        // Log feedback
        await logFeedback(user.id, emailId, originalCategory, newCategory, 'recategorize')

        return NextResponse.json({
          success: true,
          message: `Đã chuyển sang ${newCategory}`,
          newCategory
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    console.error('Feedback error:', err)
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

/**
 * Log classification feedback for future ML training
 */
async function logFeedback(
  userId: string,
  emailId: string,
  originalCategory: string | null,
  correctedCategory: string,
  feedbackType: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('classification_feedback')
      .insert({
        user_id: userId,
        email_id: emailId,
        original_category: originalCategory,
        corrected_category: correctedCategory,
        feedback_type: feedbackType
      })
  } catch (e) {
    // Don't fail the request if logging fails
    console.error('Failed to log feedback:', e)
  }
}
