import 'server-only'
import { z } from 'zod'
import { CommitmentRequestError, ledgerRpc, type LedgerSession } from './http'
import { purchaseCsvService, readPurchaseCsv } from './purchase-csv-server'
import type { PaymentPreview } from './purchase-payment'
import type { SupplementScan } from './purchase-supplement'

const candidates = z.array(z.object({
  caseId: z.uuid(), truncated: z.boolean(),
  sources: z.array(z.object({ emailId: z.uuid(), fileId: z.uuid(), filename: z.string(), subject: z.string(),
    binding: z.string().regex(/^[a-f0-9]{64}$/) })).max(6),
})).max(4)

type Verdict = { status: 'match'; preview: PaymentPreview } | { status: 'ignore' | 'duplicate' } |
  { status: SupplementScan['checks'][number]['code'] }

export async function inspectSupplement(service: LedgerSession, actor: string, caseId: string, emailId: string,
  fileId: string, binding: string, csv: string, signal?: AbortSignal): Promise<Verdict> {
  return ledgerRpc(service, 'inspect_purchase_supplement', {
    p_actor: actor, p_case: caseId, p_email: emailId, p_attachment: fileId, p_binding: binding, p_text: csv,
  }, signal)
}

export async function scanSupplements(client: LedgerSession, actor: string, cases: string[], requestSignal: AbortSignal) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8_000)])
  const rows = candidates.parse(await ledgerRpc(client, 'list_purchase_supplement_sources', { p_cases: cases }, signal))
  if (!rows.some(row => row.sources.length)) {
    return rows.map(row => ({ caseId: row.caseId, incomplete: row.truncated, matches: [], checks: [] }))
  }
  const service = purchaseCsvService()
  const downloads = new Map<string, ReturnType<typeof readPurchaseCsv>>()
  const jobs = rows.flatMap((row, rowIndex) => row.sources.map((source, index) => ({ row, rowIndex, index, source })))
  const results: ({ verdict: Verdict; digest: string } | null)[][] = rows.map(row => row.sources.map(() => null))

  async function inspect(job: typeof jobs[number]) {
    const { row, rowIndex, index, source } = job
    try {
      const key = source.emailId + ':' + source.fileId
      let download = downloads.get(key)
      if (!download) {
        download = readPurchaseCsv(client, actor, source.emailId, source.fileId, { signal, maxGmailEnvelope: 1024 * 1024 })
        downloads.set(key, download)
      }
      const file = await download
      const verdict = await inspectSupplement(service, actor, row.caseId, source.emailId, source.fileId, source.binding, file.source, signal)
      if (verdict.status === 'match' && verdict.preview.command.digest !== file.digest) {
        throw new CommitmentRequestError(409, 'Tệp nguồn đã đổi.')
      }
      results[rowIndex][index] = { verdict, digest: file.digest }
    } catch (error) {
      if (error instanceof CommitmentRequestError && !signal.aborted && error.status === 422) {
        results[rowIndex][index] = { verdict: { status: 'invalid' }, digest: source.fileId }
      }
      // A timeout or disappeared source does not mean the file was ruled out.
    }
  }

  // Interleave cases and keep the number of in-flight provider reads bounded.
  jobs.sort((a, b) => a.index - b.index || a.rowIndex - b.rowIndex)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(jobs.length, 3) }, async () => {
    while (!signal.aborted && cursor < jobs.length) await inspect(jobs[cursor++])
  }))

  return rows.map((row, rowIndex): SupplementScan => {
    const result: SupplementScan = { caseId: row.caseId, incomplete: row.truncated, matches: [], checks: [] }
    const seen = new Set<string>()
    for (const [index, outcome] of results[rowIndex].entries()) {
      if (!outcome) {
        result.incomplete = true
        continue
      }
      const { verdict, digest } = outcome
      if (seen.has(digest)) continue
      seen.add(digest)
      const { emailId, fileId, filename, subject } = row.sources[index]
      const source = { emailId, fileId, filename, subject }
      if (verdict.status === 'match') {
        const { number, replaces, lines } = verdict.preview
        if (replaces) result.matches.push({ ...source, digest, invoice: number, replaces, deadline: lines[0]?.paymentDue ?? null })
      } else if (verdict.status !== 'ignore' && verdict.status !== 'duplicate') result.checks.push({ ...source, code: verdict.status })
    }
    return result
  })
}
