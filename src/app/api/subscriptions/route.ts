import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: List all newsletter/subscription senders
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get emails grouped by sender, filtering for likely newsletters/subscriptions
  const { data: emails, error } = await supabase
    .from('emails')
    .select('from_address, from_name, category')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .in('category', ['newsletter', 'promotion', 'spam'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by sender email address
  const senderMap = new Map<string, {
    email: string
    name: string
    count: number
    category: string
  }>()

  emails?.forEach(email => {
    const existing = senderMap.get(email.from_address)
    if (existing) {
      existing.count++
    } else {
      senderMap.set(email.from_address, {
        email: email.from_address,
        name: email.from_name || email.from_address.split('@')[0],
        count: 1,
        category: email.category || 'newsletter'
      })
    }
  })

  // Convert to array and sort by count
  const subscriptions = Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ subscriptions })
}
