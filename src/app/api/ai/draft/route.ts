import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDraft, improveExistingDraft, type DraftOptions } from '@/lib/ai/draft-generator'
import type { EmailAnalysis } from '@/lib/ai/email-analyzer'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { emailId, analysis, options, relatedEmails, action, draft, instructions } = body

    // Handle improvement of existing draft
    if (action === 'improve' && draft && instructions) {
      const improvedDraft = await improveExistingDraft(draft, instructions)
      return NextResponse.json({ body: improvedDraft })
    }

    // Generate new draft
    if (!emailId || !analysis) {
      return NextResponse.json(
        { error: 'Email ID and analysis are required' },
        { status: 400 }
      )
    }

    // Get the email
    const { data: email, error } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single()

    if (error || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    // Get user profile for sender name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const draftOptions: DraftOptions = {
      tone: options?.tone || analysis.responseStrategy.suggestedTone || 'neutral',
      length: options?.length || analysis.responseStrategy.suggestedLength || 'medium',
      includeGreeting: options?.includeGreeting ?? true,
      includeSignature: options?.includeSignature ?? true,
      customInstructions: options?.customInstructions,
      senderName: profile?.display_name || user.email?.split('@')[0]
    }

    const generatedDraft = await generateDraft(
      email,
      analysis as EmailAnalysis,
      draftOptions,
      relatedEmails
    )

    return NextResponse.json(generatedDraft)
  } catch (error) {
    console.error('Error generating draft:', error)
    return NextResponse.json(
      { error: 'Failed to generate draft' },
      { status: 500 }
    )
  }
}
