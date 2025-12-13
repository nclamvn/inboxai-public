import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, emailIds, data } = await request.json()

  if (!action || !emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  console.log(`[BULK] Action: ${action} on ${emailIds.length} emails`)

  try {
    let updateData: Record<string, unknown> = {}

    switch (action) {
      case 'archive':
        updateData = { is_archived: true }
        break

      case 'unarchive':
        updateData = { is_archived: false }
        break

      case 'delete':
        updateData = { is_deleted: true }
        break

      case 'restore':
        updateData = { is_deleted: false }
        break

      case 'mark-read':
        updateData = { is_read: true }
        break

      case 'mark-unread':
        updateData = { is_read: false }
        break

      case 'star':
        updateData = { is_starred: true }
        break

      case 'unstar':
        updateData = { is_starred: false }
        break

      case 'mark-spam':
        updateData = { category: 'spam' }
        break

      case 'change-category':
        if (!data?.category) {
          return NextResponse.json({ error: 'Category required' }, { status: 400 })
        }
        updateData = { category: data.category }
        break

      case 'update':
        // Generic update with provided data
        if (!data || typeof data !== 'object') {
          return NextResponse.json({ error: 'Data required for update' }, { status: 400 })
        }
        // Only allow specific fields to be updated
        const allowedFields = ['is_read', 'is_starred', 'is_archived', 'is_deleted', 'category']
        for (const key of Object.keys(data)) {
          if (allowedFields.includes(key)) {
            updateData[key] = data[key]
          }
        }
        break

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Perform bulk update
    const { error } = await supabase
      .from('emails')
      .update(updateData)
      .eq('user_id', user.id)
      .in('id', emailIds)

    if (error) {
      console.error('[BULK] Update error:', error)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    console.log(`[BULK] Updated ${emailIds.length} emails with:`, updateData)

    return NextResponse.json({
      success: true,
      action,
      count: emailIds.length
    })

  } catch (error) {
    console.error('[BULK] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
