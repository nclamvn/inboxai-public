export type Priority = 1 | 2 | 3 | 4 | 5

export type Category =
  | 'work'
  | 'personal'
  | 'newsletter'
  | 'promotion'
  | 'transaction'
  | 'social'
  | 'spam'
  | 'uncategorized'

export type EmailDirection = 'inbound' | 'outbound'

export type SendStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'

export interface Email {
  id: string
  user_id: string
  message_id: string | null
  thread_id: string | null

  from_address: string
  from_name: string | null
  to_addresses: { email: string; name?: string }[]
  cc_addresses: { email: string; name?: string }[]
  reply_to: string | null

  subject: string | null
  body_text: string | null
  body_html: string | null
  snippet: string | null

  received_at: string | null
  source_account_id: string | null
  direction: EmailDirection

  priority: Priority
  category: Category
  summary: string | null
  detected_deadline: string | null
  needs_reply: boolean
  ai_confidence: number | null
  ai_suggestions: Record<string, unknown>

  is_read: boolean
  is_starred: boolean
  is_archived: boolean
  is_deleted: boolean
  snoozed_until: string | null
  user_notes: string | null
  attachment_count: number | null

  send_status: SendStatus | null
  sent_at: string | null

  // Phishing detection
  phishing_score: number | null
  phishing_risk: 'safe' | 'low' | 'medium' | 'high' | 'critical' | null
  phishing_reasons: unknown[] | null
  is_phishing_reviewed: boolean | null

  created_at: string
  updated_at: string
}

export interface Label {
  id: string
  user_id: string
  name: string
  color: string
  icon: string | null
  is_system: boolean
  is_ai_generated: boolean
  sort_order: number
  created_at: string
}

export interface Profile {
  id: string
  email: string
  mailbox_address: string | null
  display_name: string | null
  avatar_url: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SourceAccount {
  id: string
  user_id: string
  email_address: string
  provider: string | null
  display_name: string | null
  is_verified: boolean
  created_at: string
}

export interface AIClassification {
  priority: Priority
  category: Category
  needs_reply: boolean
  deadline: string | null
  summary: string
  suggested_labels: string[]
  suggested_action: 'reply' | 'archive' | 'delete' | 'read_later' | 'none'
  confidence: number
  key_entities: {
    people: string[]
    dates: string[]
    amounts: string[]
    tasks: string[]
  }
  // Phishing detection
  phishing?: {
    score: number
    risk: 'safe' | 'low' | 'medium' | 'high' | 'critical'
    reasons: Array<{
      type: string
      pattern: string
      severity: number
      description: string
    }>
    isPhishing: boolean
    requiresReview: boolean
  }
}
