import type { PurchaseLine } from '@/lib/commitments/purchase-order'

const format = new Intl.NumberFormat('vi-VN')
export function PurchaseLines({ lines }: { lines: PurchaseLine[] }) {
  return <table aria-label="Đối soát theo dòng hàng" className="w-full table-fixed border-y border-[var(--border)] text-start text-xs sm:text-sm">
    <thead className="bg-[var(--canvas)] text-[var(--foreground-secondary)]">
      <tr>
        {['Dòng', 'Đặt', 'Báo giao', 'Thực nhận', 'Chênh lệch'].map(label =>
          <th key={label} scope="col" className="break-words px-1.5 py-2 text-start font-medium sm:px-2">{label}</th>)}
      </tr>
    </thead>
    <tbody className="divide-y divide-[var(--border)]">
      {lines.map(line => {
        const difference = line.received - line.ordered
        return <tr key={line.code}>
          <th scope="row" className="break-words px-1.5 py-2 text-start font-semibold sm:px-2">{line.code}</th>
          {[line.ordered,line.reported,line.received].map((value,index) =>
            <td key={index} className="break-words px-1.5 py-2 tabular-nums sm:px-2">{format.format(value)} {line.unit}</td>)}
          <td className="break-words px-1.5 py-2 font-medium tabular-nums sm:px-2">
            <span className={difference !== 0 ? 'text-[var(--warning)]' : undefined}>
              {difference < 0 ? 'Thiếu ' + format.format(-difference) + ' ' + line.unit :
                difference > 0 ? 'Thừa ' + format.format(difference) + ' ' + line.unit : 'Khớp số đặt'}
            </span>
          </td>
        </tr>
      })}
    </tbody>
  </table>
}
