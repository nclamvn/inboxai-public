export type AskHit = {
  id: string
  subject: string | null
  sender: string
  senderName: string | null
  accountId: string | null
  account: string | null
  at: string | null
  keyword: boolean
  semantic: boolean
  citation: { field: 'subject' | 'body_text' | 'snippet' | 'from_address' | 'from_name'; quote: string | null }
}

export type AskResults = {
  hits: AskHit[]
  coverage: { eligible: number; indexed: number; capped: boolean } | null
  semantic: 'active' | 'unavailable' | 'busy' | 'off'
}
