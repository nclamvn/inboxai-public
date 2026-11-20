import 'server-only'
import { z } from 'zod'
import { getValidAccessToken } from '@/lib/gmail/sync'
import { gmailReader } from '@/lib/sync/gmail-reader'
import { CommitmentRequestError, PurchaseReviewChangedError, ledgerRpc, type LedgerSession } from './http'
import { purchaseCsvService, readPurchaseCsv } from './purchase-csv-server'
import type { PaymentPreview } from './purchase-payment'
import { supplementCheck, supplementMatch, type SupplementScan } from './purchase-supplement'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const sourceList = z.object({
  caseId: z.uuid(), invoice: z.string(), ownerId: z.uuid(), hasReplacement: z.boolean(),
  sources: z.array(z.object({ emailId: z.uuid(), fileId: z.uuid(), filename: z.string(), subject: z.string(),
    binding: digest })).max(6),
})
const reviewState = sourceList.extend({
  invoiceId: z.uuid(), unavailable: z.boolean(), total: z.number().int().nonnegative(),
  checked: z.number().int().nonnegative(), matches: z.array(supplementMatch).max(6), checks: z.array(supplementCheck).max(6),
})
const historyId = z.string().regex(/^[0-9]{1,30}$/)
const approvalScan = z.union([
  z.object({ scope: z.null(), token: z.null() }),
  z.object({ scope: sourceList.extend({ truncated: z.boolean(), accountId: z.uuid().nullable(), syncHistoryId: historyId.nullable() }), token: digest }),
])
type ReviewState = z.infer<typeof reviewState>
type Source = z.infer<typeof sourceList>['sources'][number]
type Check = SupplementScan['checks'][number]['code']
type Verdict = { status: 'match'; preview: PaymentPreview } | { status: 'ignore' | 'duplicate' | Check }
type Outcome = { status: 'match'; digest: string; invoice: string; replaces: string; deadline: string | null }
  | { status: 'ignore' | 'duplicate' | Check; digest: string }

const incompleteReview = 'Chưa kiểm tra hết chứng từ bổ sung. Mua hàng có thể tiếp tục rà soát từ Hộp thư.'
const syncPending = 'Hộp thư Gmail nguồn chưa đồng bộ xong. Mua hàng cần đồng bộ trước khi Kế toán thử lại.'
const sourceUnavailable = 'Chưa kiểm tra được Gmail nguồn. Mua hàng cần kiểm tra kết nối rồi đồng bộ lại.'
const corrected = 'Có chứng từ đính chính mới. Mua hàng cần kiểm tra và bàn giao lại trước khi duyệt.'

export async function inspectSupplement(service: LedgerSession, actor: string, caseId: string, emailId: string,
  fileId: string, binding: string, csv: string, signal?: AbortSignal): Promise<Verdict> {
  return ledgerRpc(service, 'inspect_purchase_supplement', {
    p_actor: actor, p_case: caseId, p_email: emailId, p_attachment: fileId, p_binding: binding, p_text: csv,
  }, signal)
}

async function inspectSource(service: LedgerSession, scope: z.infer<typeof sourceList>, source: Source,
  signal: AbortSignal): Promise<Outcome | null> {
  const { emailId, fileId, binding } = source
  try {
    const file = await readPurchaseCsv(service, scope.ownerId, emailId, fileId, { signal, maxGmailEnvelope: 1024 * 1024 })
    const verdict = await inspectSupplement(service, scope.ownerId, scope.caseId, emailId, fileId, binding, file.source, signal)
    if (verdict.status !== 'match') return { status: verdict.status, digest: file.digest }
    const { number, replaces, lines, command } = verdict.preview
    if (command.digest !== file.digest || !replaces) return null
    return { status: 'match', digest: file.digest, invoice: number, replaces, deadline: lines[0]?.paymentDue ?? null }
  } catch (error) {
    if (error instanceof CommitmentRequestError && error.status === 422 && !signal.aborted) {
      return { status: 'invalid', digest: binding }
    }
    // A timed-out or disappeared attachment remains pending.
    return null
  }
}

async function inspectPage(service: LedgerSession, scope: z.infer<typeof sourceList>, signal: AbortSignal) {
  const results: { source: Source; outcome: Outcome | null }[] = []
  for (let offset = 0; offset < scope.sources.length && !signal.aborted; offset += 3) {
    results.push(...await Promise.all(scope.sources.slice(offset, offset + 3).map(async source => ({
      source, outcome: await inspectSource(service, scope, source, signal),
    }))))
  }
  return results
}

export async function verifyPurchaseApproval(service: LedgerSession, actor: string, handoffId: string,
  requestSignal: AbortSignal) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8_000)])
  const readScan = async () => approvalScan.parse(await ledgerRpc(service, 'read_purchase_approval_scan', {
    p_actor: actor, p_handoff: handoffId,
  }, signal))
  const { scope, token } = await readScan()
  if (!scope) return { token: null, verifiedHistoryId: null }
  if (scope.hasReplacement) throw new CommitmentRequestError(409, corrected)
  if (scope.truncated) throw new CommitmentRequestError(409, incompleteReview)
  if (!scope.accountId || !scope.syncHistoryId) throw new CommitmentRequestError(409, syncPending)
  const results = await inspectPage(service, scope, signal)
  if (results.some(({ outcome }) => outcome?.status === 'match' && outcome.replaces === scope.invoice)) {
    throw new CommitmentRequestError(409, corrected)
  }
  if (results.some(({ outcome }) => !outcome) || signal.aborted) throw new CommitmentRequestError(409, incompleteReview)
  let observedHistoryId: string
  try {
    const access = await getValidAccessToken(scope.ownerId, scope.accountId, signal)
    if (!access) throw new Error('Gmail source is unavailable')
    const profile = await gmailReader(access).profile(signal)
    observedHistoryId = historyId.parse(profile.historyId)
  } catch {
    throw new CommitmentRequestError(409, sourceUnavailable)
  }
  if (observedHistoryId !== scope.syncHistoryId) {
    const current = await readScan()
    // A page can commit during file inspection. Retry the verification once
    // against the new shortlist only if that page caught up to this observation.
    if (current.scope?.syncHistoryId === observedHistoryId) throw new PurchaseReviewChangedError(syncPending)
    throw new CommitmentRequestError(409, syncPending)
  }
  return { token, verifiedHistoryId: observedHistoryId }
}

async function readProgress(service: LedgerSession, actor: string, cases: string[], signal: AbortSignal) {
  return z.array(reviewState).max(4).parse(await ledgerRpc(service, 'read_purchase_supplement_progress', {
    p_actor: actor, p_cases: cases,
  }, signal))
}

function asProgress(state: ReviewState): SupplementScan {
  return {
    caseId: state.caseId, incomplete: state.unavailable || state.checked < state.total,
    matches: state.matches, checks: state.checks,
    progress: { invoiceId: state.invoiceId, checked: state.checked, total: state.total, unavailable: state.unavailable },
  }
}

export async function scanSupplements(actor: string, cases: string[], requestSignal: AbortSignal) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8_000)])
  const service = purchaseCsvService()
  const rows = await readProgress(service, actor, cases, signal)
  // Keep short read-only previews quick and bound the total provider concurrency across Inbox cards.
  const scans: SupplementScan[] = []
  for (const state of rows) {
    if (state.total > 6 || state.checked > 0 || state.unavailable) {
      scans.push(asProgress(state))
      continue
    }
    const scan: SupplementScan = { caseId: state.caseId, incomplete: false, matches: [], checks: [] }
    const seen = new Set<string>()
    const results = await inspectPage(service, state, signal)
    scan.incomplete = results.length < state.total
    for (const { source, outcome } of results) {
      if (!outcome) { scan.incomplete = true; continue }
      if (seen.has(outcome.digest)) continue
      seen.add(outcome.digest)
      const { emailId, fileId, filename, subject } = source
      if (outcome.status === 'match') {
        scan.matches.push({ emailId, fileId, filename, subject, ...outcome })
      } else if (outcome.status !== 'ignore' && outcome.status !== 'duplicate') {
        scan.checks.push({ emailId, fileId, filename, subject, code: outcome.status })
      }
    }
    if (scan.incomplete) scan.progress = { invoiceId: state.invoiceId, total: state.total, checked: 0, unavailable: false }
    scans.push(scan)
  }
  return scans
}

export async function advanceSupplementReview(actor: string, caseId: string, invoiceId: string, requestSignal: AbortSignal) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8_000)])
  const service = purchaseCsvService()
  const [state] = await readProgress(service, actor, [caseId], signal)
  if (!state) throw new CommitmentRequestError(404, 'Không tìm thấy hồ sơ cần rà soát.')
  if (state.invoiceId !== invoiceId) throw new CommitmentRequestError(409, 'Phiên bản hồ sơ đã đổi. Hãy tải lại để tiếp tục.')
  const checked = await inspectPage(service, state, signal)
  const completed = checked.flatMap(({ source, outcome }) => outcome ? [{ fileId: source.fileId, binding: source.binding, outcome }] : [])
  if (!completed.length) {
    if (state.sources.length) throw new CommitmentRequestError(503, 'Chưa đọc được tệp đang chờ. Tiến độ đã lưu vẫn được giữ.')
    return asProgress(state)
  }
  // Save verified results even if the browser disconnects before receiving this page.
  return asProgress(reviewState.parse(await ledgerRpc(service, 'save_purchase_supplement_progress', {
    p_actor: actor, p_case: caseId, p_invoice: invoiceId, p_results: completed,
  })))
}
