import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js'
import { recordFeedback, getAccuracyStats } from '@/lib/ai/feedback-learner'
import { markSenderAsTrusted, markSenderAsUntrusted } from '@/lib/ai/sender-trust'
import type { Category } from '@/types'

let serviceInstance: SupabaseClient | null = null

function getServiceClient(): SupabaseClient {
  if (!serviceInstance) {
    serviceInstance = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return serviceInstance
}

/**
 * POST /api/ai/feedback
 * Record user correction of email classification
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailId, correctedCategory } = await request.json()

    if (!emailId || !correctedCategory) {
      return NextResponse.json({ error: 'Missing emailId or correctedCategory' }, { status: 400 })
    }

    // Validate category
    const validCategories: Category[] = [
      'work', 'personal', 'newsletter', 'promotion',
      'transaction', 'social', 'spam', 'uncategorized'
    ]
    if (!validCategories.includes(correctedCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    // Get email data
    const { data: email, error: fetchError } = await getServiceClient()
      .from('emails')
      .select('id, from_address, subject, category')
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const originalCategory = email.category as Category

    // Only record if category actually changed
    if (originalCategory !== correctedCategory) {
      // Record feedback for learning
      await recordFeedback(
        user.id,
        emailId,
        email.from_address,
        email.subject || '',
        originalCategory,
        correctedCategory
      )

      // Update sender trust based on correction
      if (originalCategory === 'spam' && correctedCategory !== 'spam') {
        // User marked "not spam" → Trust this sender
        await markSenderAsTrusted(user.id, email.from_address, 'marked_not_spam')
      } else if (correctedCategory === 'spam' && originalCategory !== 'spam') {
        // User marked as spam → Untrust this sender
        await markSenderAsUntrusted(user.id, email.from_address)
      }

      // Update email with corrected category
      await getServiceClient()
        .from('emails')
        .update({
          category: correctedCategory,
          // Mark as user-corrected
          ai_suggestions: {
            user_corrected: true,
            original_category: originalCategory,
            corrected_at: new Date().toISOString(),
          }
        })
        .eq('id', emailId)

      console.log(`[FEEDBACK] User ${user.id} corrected ${emailId}: ${originalCategory} → ${correctedCategory}`)
    }

    return NextResponse.json({
      success: true,
      emailId,
      originalCategory,
      correctedCategory,
      feedbackRecorded: originalCategory !== correctedCategory,
    })

  } catch (error) {
    console.error('Feedback error:', error)
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 })
  }
}

/**
 * GET /api/ai/feedback
 * Get user's classification accuracy stats
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await getAccuracyStats(user.id)

    // Convert Map to object for JSON response
    const categoryAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {}
    for (const [category, data] of stats.categoryAccuracy) {
      categoryAccuracy[category] = {
        ...data,
        accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      }
    }

    return NextResponse.json({
      totalFeedback: stats.totalFeedback,
      categoryAccuracy,
    })

  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 })
  }
}
