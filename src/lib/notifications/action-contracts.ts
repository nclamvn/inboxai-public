export type ActionNotification = {
  id: string
  kind: 'reconnect' | 'commitment-change' | 'commitment-due' | 'reply' | 'followup'
  title: string
  account: string | null
  detail?: string
  sourceId?: string
  href?: string
  accountId?: string
  followupId?: string
  seenAt: string | null
}

export const actionNotificationsKey = ['action-notifications'] as const
