export type ScheduledMail = {
  id: string
  draftId: string | null
  sourceId: string | null
  sendAt: string
  version: number
  account: string
  subject: string
  to: string[]
  cc: string[]
  state: 'scheduled' | 'dispatching' | 'unknown' | 'accepted' | 'rejected' | 'partial' | 'failed' | 'canceled'
  sentId: string | null
}
