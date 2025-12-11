import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET recent searches
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get from user preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('recent_searches, saved_searches')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    recent: prefs?.recent_searches || [],
    saved: prefs?.saved_searches || []
  })
}

// POST add to recent searches
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, save } = await request.json()

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  // Get current preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('recent_searches, saved_searches')
    .eq('user_id', user.id)
    .single()

  if (save) {
    // Add to saved searches
    const savedSearches: string[] = prefs?.saved_searches || []
    if (!savedSearches.includes(query)) {
      savedSearches.unshift(query)
      // Keep max 20 saved searches
      const updated = savedSearches.slice(0, 20)

      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          saved_searches: updated,
          updated_at: new Date().toISOString()
        })
    }
  } else {
    // Add to recent searches
    const recentSearches: string[] = prefs?.recent_searches || []
    // Remove if exists, then add to front
    const filtered = recentSearches.filter((s: string) => s !== query)
    filtered.unshift(query)
    // Keep max 10 recent searches
    const updated = filtered.slice(0, 10)

    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        recent_searches: updated,
        updated_at: new Date().toISOString()
      })
  }

  return NextResponse.json({ success: true })
}

// DELETE remove from saved searches
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query } = await request.json()

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('saved_searches')
    .eq('user_id', user.id)
    .single()

  const savedSearches: string[] = prefs?.saved_searches || []
  const updated = savedSearches.filter((s: string) => s !== query)

  await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      saved_searches: updated,
      updated_at: new Date().toISOString()
    })

  return NextResponse.json({ success: true })
}
