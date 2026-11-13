import type { CommitmentState } from './contracts'
import type { DetectionSignal } from './detect'

const unit = '(bộ|chiếc|kiện|cuộn|hộp|cái)'
const quantity = '([1-9][0-9]{0,6})'
const date = '([0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})'
const supplier = '(?:chúng tôi|bên tôi|bên em|tôi)'
const initial = new RegExp('^' + supplier + ' xác nhận giao ' + quantity + ' ' + unit + ' (.{1,145}?) (?:vào ngày|chậm nhất ngày|ngày) ' + date + '$', 'iu')
const schedule = new RegExp('^' + supplier + ' xác nhận (?:dời|đổi) lịch giao từ ' + date + ' sang ' + date + '$', 'iu')
const offer = new RegExp('^' + supplier + ' (?:đề nghị|xin) (?:dời|đổi) lịch giao sang ' + date + '(?: và giao trước ' + quantity + ' ' + unit + ')?$', 'iu')
const shipment = new RegExp('^' + supplier + ' đã giao (lũy kế|đủ) ' + quantity + '/' + quantity + ' ' + unit + '$', 'iu')
const incremental = new RegExp('^' + supplier + ' đã giao ' + quantity + ' ' + unit + ' trong đợt này$', 'iu')

export function detectDeliveryLine(line: string, quote: string, calendarDate: (value: string) => string | null): DetectionSignal | null {
  const start = initial.exec(line)
  if (start) {
    const dueOn = calendarDate(start[4])
    return dueOn ? { kind: 'create', quote, title: 'giao ' + start[1] + ' ' + start[2] + ' ' + start[3], dueOn,
      delivery: { ordered: Number(start[1]), delivered: 0, unit: start[2].toLowerCase() as DeliveryProgress['unit'] } } : null
  }
  const moved = schedule.exec(line)
  if (moved) {
    const priorDueOn = calendarDate(moved[1]), dueOn = calendarDate(moved[2])
    return dueOn && priorDueOn ? { kind: 'deadline', quote, title: null, dueOn, priorDueOn } : null
  }
  const proposed = offer.exec(line)
  if (proposed) return { kind: 'review', quote, title: null, dueOn: calendarDate(proposed[1]),
    ...(proposed[2] && { proposedBatch: { quantity: Number(proposed[2]), unit: proposed[3].toLowerCase() as DeliveryProgress['unit'] } }) }
  const update = shipment.exec(line)
  if (update) {
    const delivered = Number(update[2]), ordered = Number(update[3])
    if ((update[1].toLowerCase() === 'đủ') !== (delivered === ordered) || delivered > ordered) {
      return { kind: 'review', quote, title: null, dueOn: null }
    }
    return { kind: delivered === ordered ? 'completed' : 'progress', quote, title: null, dueOn: null,
      delivery: { delivered, ordered, unit: update[4].toLowerCase() as DeliveryProgress['unit'] } }
  }
  if (incremental.test(line)) return { kind: 'review', quote, title: null, dueOn: null }
  return null
}

export type DeliveryProgress = NonNullable<CommitmentState['delivery']>

export function deliveryLabel(delivery: DeliveryProgress) {
  const count = new Intl.NumberFormat('vi-VN')
  return count.format(delivery.delivered) + ' / ' + count.format(delivery.ordered) + ' ' + delivery.unit
}
