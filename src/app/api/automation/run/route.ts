import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAllRules, runRule, Rule } from '@/lib/ai/rules-engine'

// POST - Run automation
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { ruleId } = body  // Optional - run specific rule

  try {
    if (ruleId) {
      // Run specific rule
      const { data: rule } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('id', ruleId)
        .eq('user_id', user.id)
        .single()

      if (!rule) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
      }

      const result = await runRule(rule as Rule)

      // Update rule stats
      await supabase
        .from('automation_rules')
        .update({
          last_run_at: new Date().toISOString(),
          total_runs: (rule.total_runs || 0) + 1,
          total_affected: (rule.total_affected || 0) + result.emailsAffected
        })
        .eq('id', rule.id)

      return NextResponse.json({
        success: true,
        result
      })

    } else {
      // Run all active rules
      const result = await runAllRules(user.id)
      return NextResponse.json({
        success: true,
        ...result
      })
    }
  } catch (error) {
    console.error('Automation run error:', error)
    return NextResponse.json({ error: 'Automation failed' }, { status: 500 })
  }
}
