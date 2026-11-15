import 'server-only'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readMailAttachment, type AttachmentReadBudget } from '@/lib/compose/attachment-source'
import { SendError } from '@/lib/mail-send/contracts'
import { CommitmentRequestError, ledgerRpc, type LedgerSession } from './http'
import { isPurchaseCsv, purchaseCsvMaxSize } from './purchase-csv'

export function purchaseCsvService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function readPurchaseCsv(client: LedgerSession, actor: string, emailId: string, attachmentId: string, budget?: AttachmentReadBudget) {
  try {
    const file = await readMailAttachment(client, actor, attachmentId, emailId, purchaseCsvMaxSize, true, budget)
    if (!isPurchaseCsv(file.filename, file.contentType)) throw new CommitmentRequestError(422, 'Tệp nguồn phải là CSV.')
    let source: string
    try {
      // Preserve the BOM so the digest of the UTF-8 text still matches the provider bytes.
      source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.content)
    } catch {
      throw new CommitmentRequestError(422, 'Tệp CSV phải dùng mã hóa UTF-8.')
    }
    if (source.includes('\0')) throw new CommitmentRequestError(422, 'Tệp CSV chứa ký tự không hợp lệ.')
    return { ...file, source, digest: createHash('sha256').update(file.content).digest('hex') }
  } catch (error) {
    if (error instanceof SendError) throw new CommitmentRequestError(error.status, error.message)
    throw error
  }
}

export async function purchaseCsvProof(client: LedgerSession, id: string) {
  return ledgerRpc(client, 'read_purchase_csv_proof', { p_id: id }) as Promise<{
    emailId: string; attachmentId: string; filename: string; digest: string
  }>
}
