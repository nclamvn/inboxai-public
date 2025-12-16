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
    .select(`
      id,
      email_address,
      display_name,
      provider,
      avatar_url,
      is_primary,
      color,
      is_active,
      last_sync_at,
      sync_status,
      sync_error,
      total_emails_synced,
      auth_type,
      created_at
    `)
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Get email counts
  const { count: totalCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .eq('source_account_id', accountId)

  const { count: unreadCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .eq('source_account_id', accountId)
    .eq('is_read', false)

  return NextResponse.json({
    account: {
      ...account,
      email_count: totalCount || 0,
      unread_count: unreadCount || 0,
    }
  })
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
  const { display_name, color, is_primary, is_active } = body

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {}
  if (display_name !== undefined) updateData.display_name = display_name
  if (color !== undefined) updateData.color = color
  if (is_active !== undefined) updateData.is_active = is_active

  // Handle is_primary separately (need to unset other accounts)
  if (is_primary === true) {
    // First, unset all other accounts as primary
    await supabase
      .from('source_accounts')
      .update({ is_primary: false })
      .eq('user_id', user.id)
      .neq('id', accountId)

    updateData.is_primary = true
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: account, error } = await supabase
    .from('source_accounts')
    .update(updateData)
    .eq('id', accountId)
    .eq('user_id', user.id)
    .select('id, email_address, display_name, provider, avatar_url, is_primary, color, is_active')
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

  // Check if account exists and belongs to user
  const { data: account, error: fetchError } = await supabase
    .from('source_accounts')
    .select('id, is_primary')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Delete associated emails first (cascade)
  await supabase
    .from('emails')
    .delete()
    .eq('source_account_id', accountId)

  // Delete the account
  const { error } = await supabase
    .from('source_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If deleted account was primary, set another as primary
  if (account.is_primary) {
    const { data: remainingAccounts } = await supabase
      .from('source_accounts')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)

    if (remainingAccounts && remainingAccounts.length > 0) {
      await supabase
        .from('source_accounts')
        .update({ is_primary: true })
        .eq('id', remainingAccounts[0].id)
    }
  }

  return NextResponse.json({ success: true, message: 'Account deleted' })
}
