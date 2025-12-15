import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { generateSmartReplies, composeFromBullets, ReplyTone } from '@/lib/ai/smart-reply'

export const maxDuration = 30

// GET - Generate smart reply suggestions (supports mobile + web auth)
export async function GET(request: NextRequest) {
  const supabase = await createClientForRequest(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const emailId = searchParams.get('emailId')
  const tone = (searchParams.get('tone') || 'auto') as ReplyTone

  if (!emailId) {
    return NextResponse.json({ error: 'emailId required' }, { status: 400 })
  }

  // Fetch email
  const { data: email, error } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject, body_text, received_at, category')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Get user profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Generate suggestions
  const result = await generateSmartReplies(
    {
      originalEmail: {
        from_name: email.from_name,
        from_address: email.from_address,
        subject: email.subject,
        body_text: email.body_text,
        received_at: email.received_at
      },
      userEmail: user.email || '',
      userName: profile?.full_name,
      category: email.category
    },
    tone
  )

  return NextResponse.json(result)
}

// POST - Compose from bullets (supports mobile + web auth)
export async function POST(request: NextRequest) {
  const supabase = await createClientForRequest(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailId, bullets, tone = 'formal' } = await request.json()

  if (!emailId || !bullets) {
    return NextResponse.json({ error: 'emailId and bullets required' }, { status: 400 })
  }

  // Fetch email
  const { data: email, error } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject, body_text, received_at, category')
    .eq('id', emailId)
    .eq('user_id', user.id)
    .single()

  if (error || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Compose email
  const result = await composeFromBullets(
    {
      originalEmail: {
        from_name: email.from_name,
        from_address: email.from_address,
        subject: email.subject,
        body_text: email.body_text,
        received_at: email.received_at
      },
      userEmail: user.email || '',
      userName: profile?.full_name,
      category: email.category
    },
    bullets,
    tone
  )

  return NextResponse.json(result)
}
