import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeEmail } from '@/lib/ai/email-analyzer'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailId } = await request.json()

    if (!emailId) {
      return NextResponse.json({ error: 'Email ID is required' }, { status: 400 })
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

    // Analyze the email
    const analysis = await analyzeEmail(email)

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error analyzing email:', error)
    return NextResponse.json(
      { error: 'Failed to analyze email' },
      { status: 500 }
    )
  }
}
