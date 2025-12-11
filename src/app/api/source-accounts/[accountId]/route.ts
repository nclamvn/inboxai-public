import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get single account details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: account, error } = await supabase
    .from('source_accounts')
    .select('id, email_address, display_name, provider, is_active, last_sync_at, sync_error, total_emails_synced, created_at')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json({ account })
}

// PATCH - Update account
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { display_name, is_active } = body

  const updateData: Record<string, unknown> = {}
  if (display_name !== undefined) updateData.display_name = display_name
  if (is_active !== undefined) updateData.is_active = is_active

  const { data: account, error } = await supabase
    .from('source_accounts')
    .update(updateData)
    .eq('id', accountId)
    .eq('user_id', user.id)
    .select('id, email_address, display_name, provider, is_active')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ account })
}

// DELETE - Remove account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // First, optionally delete emails from this account
  // await supabase.from('emails').delete().eq('source_account_id', accountId)

  const { error } = await supabase
    .from('source_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
