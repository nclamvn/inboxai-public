import type { CommitmentState } from './contracts'

const receipt = /^(?:phiếu nhập|biên nhận) (PN-[0-9]{1,12})[ ]{0,3}[:–-] (?:kho (?:đã )?nhận|thực nhập|thực nhận) ([1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$/iu
const correction = /^đính chính (DC-[0-9]{1,12}) cho (PN-[0-9]{1,12})[ ]{0,3}[:–-] (?:kho thực nhận|thực nhận) (0|[1-9][0-9]{0,6}) (bộ|chiếc|kiện|cuộn|hộp|cái)[.!]?$/iu

export function readWarehouseCorrection(quote: string) {
  const match = correction.exec(quote)
  if (!match) return null
  return { number: match[1].toUpperCase(), receiptNumber: match[2].toUpperCase(), amount: Number(match[3]), unit: match[4].toLowerCase() }
}

export function readWarehouseReceipt(quote: string) {
  const match = receipt.exec(quote)
  if (!match) return null
  return { number: match[1].toUpperCase(), amount: Number(match[2]),
    unit: match[3].toLowerCase() as NonNullable<CommitmentState['delivery']>['unit'] }
}

export function receivingTotals(state: CommitmentState) {
  const { delivery, receiving } = state
  if (!delivery || !receiving) return null
  return { unit: delivery.unit, ordered: delivery.ordered, reported: delivery.delivered,
    received: receiving.received, short: delivery.ordered - receiving.received,
    discrepancy: delivery.delivered - receiving.received }
}

export function receivingValue(state: CommitmentState) {
  const totals = receivingTotals(state)
  if (!totals) return 'Chưa theo dõi thực nhận'
  return totals.received.toLocaleString('vi-VN') + ' / ' + totals.ordered.toLocaleString('vi-VN') + ' ' + totals.unit
}
