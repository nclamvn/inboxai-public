import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { AttentionItem } from '@/lib/commitments/attention'
import type { CommitmentProposal } from '@/lib/commitments/detection'
import { scanCatchupProposals } from '@/lib/commitments/detection-server'
import { ledgerJson, ledgerRpc, withLedgerSession } from '@/lib/commitments/http'

const accountFilter = z.array(z.uuid().transform(id => id.toLowerCase())).max(50)
type AttentionPage = { tracking: boolean; items: Omit<AttentionItem, 'reply'>[] }

export async function GET(request: NextRequest) {
  return withLedgerSession(request, async client => {
    const accounts = accountFilter.safeParse(request.nextUrl.searchParams.getAll('account'))
    if (!accounts.success) return ledgerJson({ error: 'Bộ lọc tài khoản không hợp lệ.' }, 400)
    const read = async (ids: string[]): Promise<AttentionPage> =>
      ledgerRpc(client, 'list_commitment_attention', { p_accounts: accounts.data, p_reply_ids: ids })

    const [initial, status] = await Promise.all([read([]),
      ledgerRpc(client, 'read_commitment_catchup_status', { p_accounts: accounts.data }),
    ])
    const replies = new Map<string, CommitmentProposal>()
    if (initial.tracking) {
      const { proposals } = await scanCatchupProposals(client, accounts.data, null, null, true)
      for (const proposal of proposals) {
        if (!proposal.commitmentId || (!proposal.review && proposal.blocked !== 'uncertain' && proposal.blocked !== 'conflicting' && proposal.blocked !== 'quantity')) continue
        if (proposal.kind === 'correction' && !proposal.review) continue
        if (accounts.data.length && (!proposal.accountId || !accounts.data.includes(proposal.accountId))) continue
        const previous = replies.get(proposal.commitmentId)
        if (!previous || Date.parse(proposal.at ?? '') > Date.parse(previous.at ?? '')) replies.set(proposal.commitmentId, proposal)
      }
    }
    const page = replies.size ? await read([...replies.keys()]) : initial
    return ledgerJson({ accounts: status, items: page.items.map(item => {
      const proposal = item.reason === 'reply' ? replies.get(item.id) : null
      return { ...item, reply: proposal ? {
        emailId: proposal.emailId, subject: proposal.subject, quote: proposal.quote, needsReview: !proposal.review, correction: proposal.kind === 'correction',
      } : null }
    }) })
  })
}
