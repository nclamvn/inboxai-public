import type { ReplyFields, ReplyWorkbench } from '@/lib/replies/contracts'

export type OfflineReplyBase = {
  id: string | null
  revision: number | null
  fingerprint: string
  fields: ReplyFields
}

export type OfflineReply = {
  accountId: string
  account: string
  subject: string
  base: OfflineReplyBase
  fields: ReplyFields
}

export type OfflineMail = {
  subject: string
  sender: string
  at: string | null
  text: string
  reply: OfflineReply | null
}

export function sameReply(a: ReplyFields, b: ReplyFields) {
  return a.to === b.to && a.cc === b.cc && a.body === b.body
}

export function offlineReplyFor(context: ReplyWorkbench, fields: ReplyFields): OfflineReply {
  const base = {
    id: context.draft?.id ?? null,
    revision: context.draft?.revision ?? null,
    fingerprint: context.fingerprint,
    fields: { to: context.draft?.to ?? context.to ?? '', cc: context.draft?.cc ?? '', body: context.draft?.body ?? '' },
  }
  return { accountId: context.accountId, account: context.account, subject: context.subject ?? '(Không có tiêu đề)', base, fields }
}

export function compareOfflineReply(local: OfflineReply, context: ReplyWorkbench) {
  if (local.accountId !== context.accountId || (context.draft && context.draft.state !== 'draft')) return 'blocked'
  const server = offlineReplyFor(context, local.fields).base
  if (context.stale || local.base.fingerprint !== server.fingerprint) return 'source'
  if (sameReply(local.fields, server.fields)) return 'saved'
  if (local.base.id !== server.id || local.base.revision !== server.revision || !sameReply(local.base.fields, server.fields)) {
    return 'conflict'
  }
  return 'recoverable'
}
