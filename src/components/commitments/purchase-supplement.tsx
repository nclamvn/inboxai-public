import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { SupplementScan } from '@/lib/commitments/purchase-supplement'

const link = 'neo-target inline-flex min-h-11 min-w-0 items-center break-words text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const reasons: Record<SupplementScan['checks'][number]['code'], string> = {
  old: 'Bản cũ hoặc đến sai thứ tự',
  wrong_po: 'Mã PO trong tệp không khớp',
  invalid: 'Có chi tiết trong tệp cần kiểm tra',
  unlinked: 'Chưa rõ hóa đơn cần thay thế',
  missing_due: 'Tệp chưa có hạn thanh toán được yêu cầu',
  number_conflict: 'Trùng mã hóa đơn nhưng nội dung khác',
}

function previewHref(caseId: string, match: SupplementScan['matches'][number]) {
  return '/commitments/payment?' + new URLSearchParams({
    email: match.emailId, file: match.fileId, supplement: caseId, digest: match.digest,
  })
}

export function PurchaseSupplement({ scan, unavailable }: { scan?: SupplementScan; unavailable: boolean }) {
  if (unavailable) return <p className="mt-3 text-xs text-[var(--foreground-muted)]">Chưa kiểm tra được thư bổ sung. Có thể mở hồ sơ để đối chiếu.</p>
  if (!scan || (!scan.incomplete && !scan.matches.length && !scan.checks.length)) return null
  const conflicting = scan.matches.length > 1
  const confident = scan.matches.length === 1 && !scan.incomplete

  return <section aria-label="Chứng từ bổ sung từ email" className="mt-3 space-y-2 border-s-2 border-[var(--selection-line)] ps-3">
    {conflicting ? <Badge variant="warning">Có nhiều bản cần đối chiếu</Badge> : confident
      ? <Badge variant="info">Có chứng từ mới để kiểm tra</Badge>
      : scan.matches.length > 0 ? <Badge variant="secondary">Có ứng viên để kiểm tra</Badge> : null}
    {scan.incomplete && <p className="text-xs text-[var(--foreground-muted)]">Chưa kiểm tra hết thư bổ sung.</p>}
    {scan.matches.map(match => <div key={match.fileId}>
      <p className="break-words text-sm"><strong>{match.invoice}</strong> thay {match.replaces} · {match.filename}</p>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
        Khớp PO, người gửi, hộp thư và hóa đơn đang hiệu lực.
        {match.deadline && <> Hạn trên tệp <time dateTime={match.deadline}>{match.deadline.split('-').reverse().join('/')}</time>.</>}
      </p>
      <div className="flex flex-wrap gap-x-4">
        <Link href={previewHref(scan.caseId,match)} prefetch={false} className={link}>
          {confident ? 'Xem trước chứng từ mới' : 'Xem trước ' + match.invoice}
        </Link>
        <Link href={'/inbox?email='+match.emailId} prefetch={false} className={link}>Email nguồn · {match.invoice}</Link>
      </div>
    </div>)}
    {scan.checks.length > 0 && <details className="text-sm">
      <summary className="neo-target min-h-11 cursor-pointer py-3 text-[var(--foreground-secondary)]">
        {scan.checks.length} tệp cần đối chiếu
      </summary>
      <ul>
        {scan.checks.map(check => <li key={check.fileId} className="break-words">
          <span>{reasons[check.code]} · {check.filename}</span>
          <div><Link href={'/inbox?email='+check.emailId} prefetch={false} className={link}>Mở email để kiểm tra</Link></div>
        </li>)}
      </ul>
    </details>}
  </section>
}
