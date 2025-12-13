import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UnsubscribeService } from '@/lib/email/unsubscribe-service'

// GET - List unsubscribed senders
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const unsubscribeService = new UnsubscribeService(supabase)
  const list = await unsubscribeService.getUnsubscribedList(user.id)

  return NextResponse.json({ unsubscribed: list })
}

// POST - Unsubscribe from sender
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email_address, sender_name, unsubscribe_domain, delete_existing } = await request.json()

  if (!email_address) {
    return NextResponse.json({ error: 'email_address required' }, { status: 400 })
  }

  const unsubscribeService = new UnsubscribeService(supabase)

  await unsubscribeService.unsubscribe(
    user.id,
    email_address,
    sender_name,
    unsubscribe_domain
  )

  let deletedCount = 0

  // Optionally delete existing emails from this sender
  if (delete_existing) {
    if (unsubscribe_domain) {
      const domain = email_address.split('@')[1]
      const { error, count } = await supabase
        .from('emails')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .ilike('from_address', `%@${domain}`)

      if (!error) deletedCount = count || 0
    } else {
      const { error, count } = await supabase
        .from('emails')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .eq('from_address', email_address.toLowerCase())

      if (!error) deletedCount = count || 0
    }
  }

  return NextResponse.json({
    success: true,
    deleted: deletedCount,
    blocked: unsubscribe_domain
      ? `@${email_address.split('@')[1]}`
      : email_address
  })
}

// DELETE - Resubscribe (remove from block list)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const emailOrDomain = searchParams.get('email')

  if (!emailOrDomain) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const unsubscribeService = new UnsubscribeService(supabase)
  await unsubscribeService.resubscribe(user.id, emailOrDomain)

  return NextResponse.json({ success: true })
}
