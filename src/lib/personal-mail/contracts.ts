import type { Category } from '@/types'

export const ruleCategories = ['work', 'personal', 'transaction', 'promotion', 'newsletter', 'social'] as const
export type RuleCategory = typeof ruleCategories[number]

export interface MailRulePreview {
  account: string
  sender: string
  category: RuleCategory
  includeExisting: boolean
  token: string
  items: { id: string; subject: string | null; category: Category | null }[]
}

export interface MailRule {
  id: string
  account: string
  sender: string
  category: RuleCategory
  applied: number
  undone: boolean
  restored: number
  kept: number
}
