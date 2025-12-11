import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Types
interface Condition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than'
  value: string | number | boolean
}

interface ConditionGroup {
  match: 'all' | 'any'
  rules: Condition[]
}

interface Action {
  type: 'archive' | 'delete' | 'add_label' | 'remove_label' | 'mark_read' | 'mark_unread' | 'set_priority' | 'set_category'
  label?: string
  priority?: number
  category?: string
}

export interface Rule {
  id: string
  user_id: string
  name: string
  conditions: ConditionGroup
  actions: Action[]
  is_active: boolean
}

interface Email {
  id: string
  user_id: string
  from_address: string
  from_name: string | null
  subject: string | null
  category: string | null
  priority: number
  is_read: boolean
  is_starred: boolean
  is_archived: boolean
  is_deleted: boolean
  received_at: string
  created_at: string
}

// Check if email matches conditions
function emailMatchesConditions(email: Email, conditions: ConditionGroup): boolean {
  const results = conditions.rules.map(rule => {
    const fieldValue = getFieldValue(email, rule.field)
    return evaluateCondition(fieldValue, rule.operator, rule.value)
  })

  if (conditions.match === 'all') {
    return results.every(r => r)
  } else {
    return results.some(r => r)
  }
}

function getFieldValue(email: Email, field: string): string | number | boolean {
  switch (field) {
    case 'sender':
    case 'from_address':
      return email.from_address?.toLowerCase() || ''
    case 'from_name':
      return email.from_name?.toLowerCase() || ''
    case 'subject':
      return email.subject?.toLowerCase() || ''
    case 'category':
      return email.category || ''
    case 'priority':
      return email.priority
    case 'is_read':
      return email.is_read
    case 'is_starred':
      return email.is_starred
    case 'age_days':
      const received = new Date(email.received_at)
      const now = new Date()
      return Math.floor((now.getTime() - received.getTime()) / (1000 * 60 * 60 * 24))
    default:
      return (email as unknown as Record<string, unknown>)[field] as string | number | boolean
  }
}

function evaluateCondition(fieldValue: string | number | boolean, operator: string, targetValue: string | number | boolean): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === targetValue
    case 'not_equals':
      return fieldValue !== targetValue
    case 'contains':
      return String(fieldValue).includes(String(targetValue).toLowerCase())
    case 'not_contains':
      return !String(fieldValue).includes(String(targetValue).toLowerCase())
    case 'greater_than':
      return Number(fieldValue) > Number(targetValue)
    case 'less_than':
      return Number(fieldValue) < Number(targetValue)
    default:
      return false
  }
}

// Execute actions on email
async function executeActions(email: Email, actions: Action[]): Promise<{ success: boolean; action: string }[]> {
  const results: { success: boolean; action: string }[] = []

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'archive':
          await supabase
            .from('emails')
            .update({ is_archived: true, updated_at: new Date().toISOString() })
            .eq('id', email.id)
          results.push({ success: true, action: 'archive' })
          break

        case 'delete':
          await supabase
            .from('emails')
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq('id', email.id)
          results.push({ success: true, action: 'delete' })
          break

        case 'mark_read':
          await supabase
            .from('emails')
            .update({ is_read: true, updated_at: new Date().toISOString() })
            .eq('id', email.id)
          results.push({ success: true, action: 'mark_read' })
          break

        case 'mark_unread':
          await supabase
            .from('emails')
            .update({ is_read: false, updated_at: new Date().toISOString() })
            .eq('id', email.id)
          results.push({ success: true, action: 'mark_unread' })
          break

        case 'set_priority':
          if (action.priority !== undefined) {
            await supabase
              .from('emails')
              .update({ priority: action.priority, updated_at: new Date().toISOString() })
              .eq('id', email.id)
            results.push({ success: true, action: `set_priority_${action.priority}` })
          }
          break

        case 'set_category':
          if (action.category) {
            await supabase
              .from('emails')
              .update({ category: action.category, updated_at: new Date().toISOString() })
              .eq('id', email.id)
            results.push({ success: true, action: `set_category_${action.category}` })
          }
          break

        case 'add_label':
          if (action.label) {
            // Get or create label
            let { data: label } = await supabase
              .from('labels')
              .select('id')
              .eq('user_id', email.user_id)
              .eq('name', action.label)
              .single()

            if (!label) {
              const { data: newLabel } = await supabase
                .from('labels')
                .insert({ user_id: email.user_id, name: action.label })
                .select('id')
                .single()
              label = newLabel
            }

            if (label) {
              await supabase
                .from('email_labels')
                .upsert({ email_id: email.id, label_id: label.id })
              results.push({ success: true, action: `add_label_${action.label}` })
            }
          }
          break
      }
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error)
      results.push({ success: false, action: action.type })
    }
  }

  return results
}

// Run a single rule for a user
export async function runRule(rule: Rule): Promise<{
  emailsScanned: number
  emailsAffected: number
  actionsTaken: { email_id: string; subject: string | null; results: { success: boolean; action: string }[] }[]
}> {
  // Fetch user's emails that haven't been processed recently
  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', rule.user_id)
    .eq('is_deleted', false)
    .order('received_at', { ascending: false })
    .limit(500)

  if (!emails) {
    return { emailsScanned: 0, emailsAffected: 0, actionsTaken: [] }
  }

  const actionsTaken: { email_id: string; subject: string | null; results: { success: boolean; action: string }[] }[] = []
  let emailsAffected = 0

  for (const email of emails) {
    if (emailMatchesConditions(email as Email, rule.conditions)) {
      const results = await executeActions(email as Email, rule.actions)
      actionsTaken.push({
        email_id: email.id,
        subject: email.subject,
        results
      })
      emailsAffected++
    }
  }

  return {
    emailsScanned: emails.length,
    emailsAffected,
    actionsTaken
  }
}

// Run all active rules for a user
export async function runAllRules(userId: string): Promise<{
  rulesRun: number
  totalAffected: number
  logs: { rule: string; emailsScanned?: number; emailsAffected?: number; error?: string }[]
}> {
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!rules || rules.length === 0) {
    return { rulesRun: 0, totalAffected: 0, logs: [] }
  }

  const logs: { rule: string; emailsScanned?: number; emailsAffected?: number; error?: string }[] = []
  let totalAffected = 0

  for (const rule of rules) {
    // Create log entry
    const { data: logEntry } = await supabase
      .from('automation_logs')
      .insert({
        user_id: userId,
        rule_id: rule.id,
        status: 'running'
      })
      .select('id')
      .single()

    try {
      const result = await runRule(rule as Rule)

      // Update log
      await supabase
        .from('automation_logs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'completed',
          emails_scanned: result.emailsScanned,
          emails_affected: result.emailsAffected,
          actions_taken: result.actionsTaken
        })
        .eq('id', logEntry?.id)

      // Update rule stats
      await supabase
        .from('automation_rules')
        .update({
          last_run_at: new Date().toISOString(),
          total_runs: rule.total_runs + 1,
          total_affected: rule.total_affected + result.emailsAffected
        })
        .eq('id', rule.id)

      totalAffected += result.emailsAffected
      logs.push({ rule: rule.name, ...result })

    } catch (error) {
      await supabase
        .from('automation_logs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          error_message: String(error)
        })
        .eq('id', logEntry?.id)

      logs.push({ rule: rule.name, error: String(error) })
    }
  }

  return { rulesRun: rules.length, totalAffected, logs }
}

// Create default rules for new users
export async function createDefaultRules(userId: string) {
  const defaultRules = [
    {
      user_id: userId,
      name: 'Archive newsletter cũ',
      description: 'Tự động archive newsletter đã đọc quá 7 ngày',
      is_system: true,
      is_active: false,
      conditions: {
        match: 'all',
        rules: [
          { field: 'category', operator: 'equals', value: 'newsletter' },
          { field: 'is_read', operator: 'equals', value: true },
          { field: 'age_days', operator: 'greater_than', value: 7 }
        ]
      },
      actions: [{ type: 'archive' }],
      run_frequency: 'daily'
    },
    {
      user_id: userId,
      name: 'Xóa promotion cũ',
      description: 'Tự động xóa email khuyến mãi quá 30 ngày không mở',
      is_system: true,
      is_active: false,
      conditions: {
        match: 'all',
        rules: [
          { field: 'category', operator: 'equals', value: 'promotion' },
          { field: 'is_read', operator: 'equals', value: false },
          { field: 'age_days', operator: 'greater_than', value: 30 }
        ]
      },
      actions: [{ type: 'delete' }],
      run_frequency: 'daily'
    },
    {
      user_id: userId,
      name: 'Label hóa đơn',
      description: 'Tự động gắn label "Hóa đơn" cho email có từ invoice',
      is_system: true,
      is_active: false,
      conditions: {
        match: 'any',
        rules: [
          { field: 'subject', operator: 'contains', value: 'invoice' },
          { field: 'subject', operator: 'contains', value: 'hóa đơn' },
          { field: 'subject', operator: 'contains', value: 'billing' }
        ]
      },
      actions: [{ type: 'add_label', label: 'Hóa đơn' }],
      run_frequency: 'realtime'
    }
  ]

  await supabase.from('automation_rules').insert(defaultRules)
}
