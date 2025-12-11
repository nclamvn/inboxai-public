import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BulkAction = 'archive' | 'delete' | 'markRead' | 'markUnread' | 'restore'

interface BulkActionRequest {
  action: BulkAction
  emailIds?: string[]
  filter?: {
    category?: string
    olderThanDays?: number
    isRead?: boolean
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: BulkActionRequest = await request.json()
    const { action, emailIds, filter } = body

    // Validate action
    const validActions: BulkAction[] = ['archive', 'delete', 'markRead', 'markUnread', 'restore']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Build query
    let query = supabase
      .from('emails')
      .select('id')
      .eq('user_id', user.id)

    // If specific IDs provided
    if (emailIds && emailIds.length > 0) {
      // Rate limit: max 100 emails per request
      if (emailIds.length > 100) {
        return NextResponse.json({
          error: 'Too many emails. Maximum 100 per request.'
        }, { status: 400 })
      }
      query = query.in('id', emailIds)
    }

    // If filter provided
    if (filter) {
      if (filter.category) {
        query = query.eq('category', filter.category)
      }
      if (filter.isRead !== undefined) {
        query = query.eq('is_read', filter.isRead)
      }
      if (filter.olderThanDays) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - filter.olderThanDays)
        query = query.lt('received_at', cutoffDate.toISOString())
      }
    }

    // Get matching emails
    const { data: matchingEmails, error: selectError } = await query

    if (selectError) {
      console.error('Select error:', selectError)
      return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
    }

    if (!matchingEmails || matchingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        affected: 0,
        message: 'Không có email nào phù hợp'
      })
    }

    const idsToUpdate = matchingEmails.map(e => e.id)

    // Apply rate limit for filter-based queries
    if (!emailIds && idsToUpdate.length > 100) {
      return NextResponse.json({
        error: `Tìm thấy ${idsToUpdate.length} email. Vui lòng thu hẹp bộ lọc (tối đa 100).`
      }, { status: 400 })
    }

    // Execute action
    let updateData: Record<string, unknown> = {}
    let actionMessage = ''

    switch (action) {
      case 'archive':
        updateData = { is_archived: true }
        actionMessage = `Đã archive ${idsToUpdate.length} email`
        break
      case 'delete':
        updateData = { is_deleted: true }
        actionMessage = `Đã xóa ${idsToUpdate.length} email`
        break
      case 'markRead':
        updateData = { is_read: true }
        actionMessage = `Đã đánh dấu đã đọc ${idsToUpdate.length} email`
        break
      case 'markUnread':
        updateData = { is_read: false }
        actionMessage = `Đã đánh dấu chưa đọc ${idsToUpdate.length} email`
        break
      case 'restore':
        updateData = { is_deleted: false, is_archived: false }
        actionMessage = `Đã khôi phục ${idsToUpdate.length} email`
        break
    }

    const { error: updateError } = await supabase
      .from('emails')
      .update(updateData)
      .in('id', idsToUpdate)
      .eq('user_id', user.id) // Extra safety check

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update emails' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      affected: idsToUpdate.length,
      message: actionMessage,
      emailIds: idsToUpdate
    })

  } catch (err) {
    console.error('Bulk action error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
