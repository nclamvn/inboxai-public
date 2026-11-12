import { createClient } from '@/lib/supabase/client'
import type { Email } from '@/types'

export const emailSnoozeChanged = 'email-snooze-changed'
export type SnoozeTarget = Pick<Email, 'id' | 'subject' | 'snoozed_until' | 'snooze_version'>

export class EmailSnoozeError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export async function changeEmailSnooze(target: SnoozeTarget, until: string | null, requestId: string) {
  const { error } = await createClient().rpc('change_email_snooze', {
    p_email: target.id, p_version: target.snooze_version ?? 0, p_until: until, p_request: requestId,
  }).abortSignal(AbortSignal.timeout(8000))

  if (error) {
    if (error.code === 'PT409') throw new EmailSnoozeError(error.code, 'Thư hoặc lịch hẹn đã thay đổi. Mở lại thư để kiểm tra.')
    if (error.code === 'PT404') throw new EmailSnoozeError(error.code, 'Thư không còn khả dụng.')
    if (error.code === '22023') throw new EmailSnoozeError(error.code, 'Chọn giờ hẹn trong tương lai.')
    throw new EmailSnoozeError(error.code, 'Chưa nhận được xác nhận lưu lịch. Hãy thử lại.')
  }
}
