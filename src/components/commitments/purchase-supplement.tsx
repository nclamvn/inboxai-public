import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

export function PurchaseSupplement({ scan, unavailable, refresh }: {
  scan?: SupplementScan; unavailable: boolean; refresh: () => Promise<unknown>
}) {
  const advance = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (scope: { caseId: string; invoiceId: string }) => {
      const response = await fetch('/api/commitments/supplements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scope),
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : 'Chưa thể rà soát. Hãy thử lại.')
      }
    },
    onSuccess: () => refresh(),
  })
  if (unavailable) return <p className="mt-3 text-xs text-[var(--foreground-muted)]">Chưa kiểm tra được thư bổ sung. Có thể mở hồ sơ để đối chiếu.</p>
  if (!scan || (!scan.incomplete && !scan.matches.length && !scan.checks.length && !scan.progress)) return null
  const conflicting = scan.matches.length > 1
  const confident = scan.matches.length === 1 && !scan.incomplete
  const progress = scan.progress

  return <section aria-label="Chứng từ bổ sung từ email" className="mt-3 space-y-2 border-s-2 border-[var(--selection-line)] ps-3">
    {conflicting ? <Badge variant="warning">Có nhiều bản cần đối chiếu</Badge> : confident
      ? <Badge variant="info">Có chứng từ mới để kiểm tra</Badge>
      : scan.matches.length > 0 ? <Badge variant="secondary">Có ứng viên để kiểm tra</Badge> : null}
    {progress
      ? <p role="status" className="text-sm text-[var(--foreground-secondary)]">
        {progress.unavailable ? 'Chưa đọc được nguồn của hồ sơ.' : `Đã rà ${progress.checked}/${progress.total} tệp`}
      </p>
      : scan.incomplete && <p className="text-xs text-[var(--foreground-muted)]">Chưa kiểm tra hết thư bổ sung.</p>}
    {progress && !progress.unavailable && progress.checked < progress.total && <Button
      type="button" variant="outline" loading={advance.isPending}
      onClick={() => advance.mutate({ caseId: scan.caseId, invoiceId: progress.invoiceId })}>
      {progress.checked ? 'Rà tiếp chứng từ' : 'Rà soát chứng từ'}
    </Button>}
    {advance.isError && <p role="alert" className="text-sm text-[var(--foreground-secondary)]">
      {advance.error.message === 'Failed to fetch'
        ? 'Mất kết nối khi rà soát. Hãy thử lại khi có mạng.' : advance.error.message}
    </p>}
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
