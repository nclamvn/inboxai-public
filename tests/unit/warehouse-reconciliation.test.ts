import { describe, expect, it } from 'vitest'
import type { CommitmentState } from '@/lib/commitments/contracts'
import { detectCommitments, proposedState } from '@/lib/commitments/detect'
import { receivingTotals } from '@/lib/commitments/receiving'
import { planAskAnswer } from '@/lib/search/ask-answer'

describe('warehouse reconciliation', () => {
  const purchaseOrder = 'PO-7122'
  const postedAt = '2026-11-14T03:00:00Z'
  const quote = 'Biên nhận pn-6801 – thực nhập 96 hộp.'
  const detect = (body: string, reference = purchaseOrder) => detectCommitments(body, postedAt, reference)

  it('keeps the exact receipt line and normalizes the receipt number', () => {
    expect(detect('Kho Bắc gửi Mua hàng\r\n' + quote + '\r\nTrân trọng.')).toMatchObject([
      { kind: 'receipt', quote, receipt: { number: 'PN-6801', amount: 96, unit: 'hộp' } },
    ])
  })

  it('rejects quoted, conditional, unnumbered and multiple receipts', () => {
    for (const body of [
      '> ' + quote, 'On Wednesday, Kho wrote:\n' + quote, 'Nếu xe đến, ' + quote,
      'Kho nhận 96 hộp.', quote + '\nPhiếu nhập PN-6803: kho nhận 4 hộp.',
    ]) expect(detect(body)).toEqual([])
    expect(detect(quote, 'QA-7122')).toEqual([])
  })

  it('keeps a fully reported shipment open while reconciling warehouse receipts', () => {
    const prior: CommitmentState = {
      title: 'Giao 100 hộp', ownerEmail: 'supplier@example.test', ownerName: null,
      dueOn: '2026-11-17', dueAt: null, status: 'open',
      delivery: { ordered: 100, delivered: 0, unit: 'hộp' },
      receiving: { accountId: '938891f6-3546-4e7a-bf3f-6e1efbdfad0e', sender: 'warehouse@example.test', received: 96 },
    }
    const [signal] = detect('Bên tôi đã giao đủ 100/100 hộp.')
    const updated = proposedState(signal, 'supplier@example.test', null, prior)
    expect(updated).toMatchObject({ status: 'open', delivery: { delivered: 100 }, receiving: prior.receiving })
    expect(receivingTotals(updated!)).toMatchObject({ ordered: 100, reported: 100, received: 96, short: 4, discrepancy: 4 })
  })

  it('routes warehouse questions to approved ledger evidence and preserves ordinary delivery date questions', () => {
    expect(planAskAnswer('Kho thực nhận bao nhiêu ' + purchaseOrder)).toEqual({
      plan: { reference: purchaseOrder, fields: [], warehouse: true },
    })
    expect(planAskAnswer('Ngày giao ' + purchaseOrder)).toEqual({
      plan: { reference: purchaseOrder, fields: ['deliveryDate'] },
    })
  })
})
