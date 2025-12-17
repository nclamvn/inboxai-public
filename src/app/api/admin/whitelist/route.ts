import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { sendWaitlistApproval } from '@/lib/resend/waitlist-emails'

// Admin emails that can manage whitelist
const ADMIN_EMAILS = ['nclamvn@gmail.com']

let adminInstance: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!adminInstance) {
    adminInstance = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return adminInstance
}

async function isAdmin(request: NextRequest): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  console.log(`[ADMIN] Auth check - user: ${user?.email}, error: ${error?.message}`)

  if (!user?.email) return false
  return ADMIN_EMAILS.includes(user.email.toLowerCase())
}

// GET - List whitelist and access requests
export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'whitelist' // 'whitelist' | 'requests'

  if (type === 'requests') {
    const { data: requests, error } = await getSupabaseAdmin()
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ requests: requests || [] })
  }

  // Get whitelist
  const { data: whitelist, error } = await getSupabaseAdmin()
    .from('whitelist')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ whitelist: whitelist || [] })
}

// POST - Add to whitelist
export async function POST(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { email, notes } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const normalizedEmail = email.toLowerCase().trim()

  // Check if already exists
  const { data: existing } = await getSupabaseAdmin()
    .from('whitelist')
    .select('id, is_active')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existing) {
    if (existing.is_active) {
      return NextResponse.json({ error: 'Email đã tồn tại trong whitelist' }, { status: 400 })
    }

    // Reactivate
    const { error } = await getSupabaseAdmin()
      .from('whitelist')
      .update({ is_active: true, notes, added_by: user?.id })
      .eq('id', existing.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Đã kích hoạt lại' })
  }

  // Create new
  const { error } = await getSupabaseAdmin()
    .from('whitelist')
    .insert({
      email: normalizedEmail,
      notes,
      added_by: user?.id
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// PATCH - Update whitelist entry or approve/reject request
export async function PATCH(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id, action, type, notes } = await request.json()

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Handle access request approval/rejection
  if (type === 'request') {
    if (action === 'approve') {
      // Get request details
      console.log(`[ADMIN] Approving request ID: ${id}`)

      const { data: requestData, error: fetchError } = await getSupabaseAdmin()
        .from('access_requests')
        .select('email, full_name, name')
        .eq('id', id)
        .single()

      console.log(`[ADMIN] Query result:`, { requestData, fetchError })

      if (fetchError) {
        console.error(`[ADMIN] Fetch error:`, fetchError)
        return NextResponse.json({ error: `Database error: ${fetchError.message}` }, { status: 500 })
      }

      if (!requestData) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 })
      }

      // Add to whitelist
      await getSupabaseAdmin()
        .from('whitelist')
        .insert({
          email: requestData.email,
          notes: `Auto-approved from request. Name: ${requestData.full_name || requestData.name}`,
          added_by: user?.id
        })

      // Update request status
      await getSupabaseAdmin()
        .from('access_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', id)

      // Send approval email notification
      const userName = requestData.full_name || requestData.name
      const emailResult = await sendWaitlistApproval(requestData.email, userName)

      console.log(`[ADMIN] Approved ${requestData.email}, email sent: ${emailResult.success}`)

      return NextResponse.json({
        success: true,
        message: 'Đã phê duyệt và gửi email thông báo',
        emailSent: emailResult.success
      })
    }

    if (action === 'reject') {
      await getSupabaseAdmin()
        .from('access_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', id)

      return NextResponse.json({ success: true, message: 'Đã từ chối' })
    }
  }

  // Handle whitelist toggle
  if (action === 'toggle') {
    const { data: entry } = await getSupabaseAdmin()
      .from('whitelist')
      .select('is_active')
      .eq('id', id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await getSupabaseAdmin()
      .from('whitelist')
      .update({ is_active: !entry.is_active })
      .eq('id', id)

    return NextResponse.json({ success: true })
  }

  // Handle update notes
  if (action === 'update') {
    await getSupabaseAdmin()
      .from('whitelist')
      .update({ notes })
      .eq('id', id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// OPTIONS - Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

// DELETE - Remove from whitelist
export async function DELETE(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('whitelist')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
