import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDefaultRules } from '@/lib/ai/rules-engine'

// GET - List all rules
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch rules:', error)
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
  }

  // Create default rules if none exist
  if (!rules || rules.length === 0) {
    try {
      await createDefaultRules(user.id)
      const { data: newRules } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      return NextResponse.json({ rules: newRules || [] })
    } catch (e) {
      console.error('Failed to create default rules:', e)
      return NextResponse.json({ rules: [] })
    }
  }

  return NextResponse.json({ rules })
}

// POST - Create new rule
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, conditions, actions, run_frequency } = body

  if (!name || !conditions || !actions) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .insert({
      user_id: user.id,
      name,
      description,
      conditions,
      actions,
      run_frequency: run_frequency || 'daily',
      is_active: true,
      is_system: false
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create rule:', error)
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }

  return NextResponse.json({ rule })
}
