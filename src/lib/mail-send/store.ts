import 'server-only'
import { receiptSchema, SendError, type MailPayload, type SendScope, type SendOutcome, type SendReceipt } from './contracts'

type Client = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }

export type SendApproval = { commitmentId: string; version: number }

export class MailSendStore {
  constructor(private readonly client: Client, private readonly approval?: SendApproval) {}

  private async rpc(name: string, args: Record<string, unknown>): Promise<SendReceipt | null> {
    const result = await this.client.rpc(name, args)
    if (result.error?.code === 'PT409') throw new SendError(409, this.approval
      ? 'Cam kết hoặc email nguồn đã thay đổi. Hãy kiểm tra lại trước khi gửi lời nhắc.'
      : 'Mã gửi đã được dùng cho nội dung khác.')
    if (result.error?.code === '42501') throw new SendError(404, 'Không tìm thấy tài khoản gửi.')
    if (result.error) throw new SendError(503, 'Chưa thể kiểm tra trạng thái gửi.')
    if (result.data === null) return null
    return receiptSchema.parse(result.data)
  }

  begin(scope: SendScope, payload?: MailPayload) {
    if (payload && this.approval) {
      return this.rpc('begin_commitment_reminder', {
        p_user_id: scope.userId, p_account_id: scope.accountId, p_commitment_id: this.approval.commitmentId,
        p_version: this.approval.version, p_proof: scope.hash, p_payload: payload,
      })
    }
    return this.rpc('begin_mail_send', {
      p_user_id: scope.userId, p_account_id: scope.accountId,
      p_request_key: scope.key, p_request_hash: scope.hash, p_payload: payload ?? null,
    })
  }

  async finish(scope: SendScope, receipt: SendReceipt, outcome: SendOutcome) {
    const result = await this.rpc('finish_mail_send', {
      p_user_id: scope.userId, p_account_id: scope.accountId, p_operation_id: receipt.id,
      p_state: outcome.state, p_provider_id: 'providerId' in outcome ? outcome.providerId ?? null : null,
    })
    if (!result) throw new SendError(503, 'Chưa thể kiểm tra trạng thái gửi.')
    return result
  }
}
