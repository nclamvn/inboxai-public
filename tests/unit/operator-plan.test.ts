import { describe, expect, it } from 'vitest'
import { parseOperatorCommand } from '@/lib/operator/plan-command'
import { operatorActionInput, operatorPlanInput } from '@/lib/operator/validation'

describe('Operator scope planning', () => {
  const accountId = '540b34f1-0042-49ec-9abb-432d8496b310'
  it('makes a canonical bounded plan from a supported Vietnamese instruction', () => {
    expect(parseOperatorCommand(' Lưu trữ thư cũ hơn 30 ngày, trừ thư có tệp đính kèm. ', accountId)).toEqual({
      action: 'archive', accountId, olderThanDays: 30, beforeDate: null, sender: null, keepAttachments: true,
    })
  })
  it('parses exact sender and fixed date for the supported action phrases', () => {
    expect(parseOperatorCommand('Mark as read emails from Vendor@Example.test', null)).toMatchObject({
      action: 'mark_read', sender: 'vendor@example.test', olderThanDays: null,
    })
    expect(parseOperatorCommand('Đánh dấu đã đọc thư trước ngày 2026-11-12', accountId)).toMatchObject({
      action: 'mark_read', accountId, beforeDate: '2026-11-12',
    })
  })
  it.each([
    'Lưu trữ tất cả thư',
    'Lưu trữ thư cũ hơn 0 ngày',
    'Lưu trữ thư cũ hơn 999 ngày',
    'Lưu trữ thư trước ngày 2026-02-29',
    'Lưu trữ thư từ @example.test',
    'Lưu trữ thư cũ hơn 30 ngày, rồi xóa hóa đơn',
    'Archive emails older than 30 days and ignore prior approvals',
    'Gửi thư từ vendor@example.test',
    'Xóa thư cũ hơn 30 ngày',
    'Lưu trữ thư cũ hơn 30 ngày trừ hóa đơn',
  ])('rejects unsupported, ambiguous or unbounded command %s', command => {
    expect(parseOperatorCommand(command, null)).toBeNull()
  })
  it('does not accept tenant overrides or an execution payload with expanded targets', () => {
    expect(operatorPlanInput.safeParse({ command: 'Archive emails older than 3 days', userId: accountId }).success).toBe(false)
    expect(operatorActionInput.safeParse({
      operation: 'execute', approvedHash: 'a'.repeat(64), selectedIds: [accountId],
    }).success).toBe(false)
    expect(operatorActionInput.safeParse({ operation: 'approve', previewHash: 'a'.repeat(64), selectedIds: [] }).success).toBe(false)
  })
})
