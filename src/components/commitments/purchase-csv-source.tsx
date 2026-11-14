import { Download } from 'lucide-react'
import type { CsvSourceReference } from '@/lib/commitments/purchase-csv'

export function PurchaseCsvSource({ source }: { source: CsvSourceReference }) {
  return <a href={'/api/commitments/purchase-csv?proof=' + encodeURIComponent(source.proofId)}
    className="neo-target inline-flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
    <Download size={16} aria-hidden="true" className="shrink-0" />
    <span className="[overflow-wrap:anywhere]">{source.filename} · dòng {source.row}</span>
  </a>
}
