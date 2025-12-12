import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Unsubscribe from senders (delete their emails)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { emailAddresses, all } = await request.json()

  try {
    let affected = 0

    if (all) {
      // Unsubscribe from ALL newsletter/promotion/spam senders
      const { data, error } = await supabase
        .from('emails')
        .update({ is_deleted: true })
        .eq('user_id', user.id)
        .in('category', ['newsletter', 'promotion', 'spam'])
        .eq('is_deleted', false)
        .select('id')

      if (error) throw error
      affected = data?.length || 0

    } else if (emailAddresses && emailAddresses.length > 0) {
      // Unsubscribe from specific senders
      const { data, error } = await supabase
        .from('emails')
        .update({ is_deleted: true })
        .eq('user_id', user.id)
        .in('from_address', emailAddresses)
        .eq('is_deleted', false)
        .select('id')

      if (error) throw error
      affected = data?.length || 0
    } else {
      return NextResponse.json({ error: 'No addresses specified' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      affected,
      message: `Đã xóa ${affected} email`
    })

  } catch (error) {
    console.error('Unsubscribe error:', error)
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
  }
}
