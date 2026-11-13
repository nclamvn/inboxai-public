import 'server-only'
import { createHash } from 'node:crypto'
import { scanCatchupProposals } from '@/lib/commitments/detection-server'
import { CommitmentRequestError, type LedgerSession } from '@/lib/commitments/http'
import { catchupHref } from '@/lib/commitments/catchup'
import { commitmentsHref, formatCommitmentDue } from '@/lib/commitments/view'
import type { AttentionItem } from '@/lib/commitments/attention'
import type { ReplyWork } from '@/lib/replies/contracts'
import type { ActionNotification } from './action-contracts'

type FeedContext = {
  reconnect: { id: string; email: string; eventId: string }[]
  replyWork: ReplyWork[]
  commitments: Omit<AttentionItem, 'reply'>[]
}
type Event = Omit<ActionNotification, 'id' | 'seenAt'>

function event(item: Event, ...identity: (string | number | null)[]) {
  const id = createHash('sha256').update(JSON.stringify([item.kind, ...identity])).digest('hex')
  return { ...item, id, seenAt: null }
}

export async function readNotificationRpc(client: LedgerSession, name: 'read_action_notification_context' | 'read_action_notification_seen' | 'read_action_notification_sources',
  args?: { p_keys: string[] } | { p_emails: string[] }) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8_000))
  if (error || data == null) throw new CommitmentRequestError(503, 'Chưa tải được thông báo. Hãy thử lại.')
  return data
}

export async function readActionNotifications(client: LedgerSession) {
  const [context, changes] = await Promise.all([
    readNotificationRpc(client, 'read_action_notification_context') as Promise<FeedContext>,
    scanCatchupProposals(client, [], null, null, true),
  ])
  const proposals = changes.proposals.filter(proposal => proposal.commitmentId && proposal.kind !== 'create'
    && (proposal.review || proposal.blocked === 'uncertain' || proposal.blocked === 'conflicting'))
  const due = context.commitments.filter(item => !proposals.some(proposal => proposal.commitmentId === item.id))
  const sourceIds = [...new Set([...proposals.map(item => item.emailId), ...due.map(item => item.source.emailId)])]
  const sources: Record<string, string | null> = sourceIds.length
    ? await readNotificationRpc(client, 'read_action_notification_sources', { p_emails: sourceIds })
    : {}
  const items: ActionNotification[] = context.reconnect.map(account => event({
    kind: 'reconnect', title: 'Cần kết nối lại Gmail', account: account.email, accountId: account.id,
  }, account.id, account.eventId))

  for (const proposal of proposals) {
    if (!Object.hasOwn(sources, proposal.emailId)) continue
    items.push(event({
      kind: 'commitment-change', title: proposal.subject || proposal.previous?.title || 'Cam kết cần xem xét',
      account: sources[proposal.emailId], detail: proposal.quote,
      sourceId: proposal.emailId,
      href: catchupHref('waiting', proposal.accountId ? [proposal.accountId] : [], proposal.emailId),
    }, proposal.commitmentId, proposal.proposalId))
  }

  for (const work of context.replyWork) {
    if (work.status === 'reply' && work.replyId) {
      items.push(event({
        kind: 'reply', title: work.subject, account: work.account, detail: work.quote ?? undefined,
        sourceId: work.replyId, href: '/inbox?email=' + work.replyId, followupId: work.id,
      }, work.id, work.replyId))
    } else if (work.status === 'due' && work.followupKey) {
      items.push(event({
        kind: 'followup', title: work.subject, account: work.account,
        detail: formatCommitmentDue({ dueOn: work.followupOn, dueAt: null }),
        sourceId: work.sourceId, href: '/inbox?followup=' + work.id + '#followup-' + work.id,
      }, work.id, work.followupKey))
    }
  }

  for (const item of due) {
    if (!Object.hasOwn(sources, item.source.emailId)) continue
    items.push(event({
      kind: 'commitment-due', title: item.state.title, account: sources[item.source.emailId],
      detail: item.reason === 'review' ? item.state.review?.note : formatCommitmentDue(item.state),
      sourceId: item.source.emailId, href: commitmentsHref(item.group, item.id),
    }, item.id, item.version, item.source.emailId))
  }
  return [...new Map(items.map(item => [item.id, item])).values()].slice(0, 200)
}
