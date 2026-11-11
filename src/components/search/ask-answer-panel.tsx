import Link from 'next/link'
import { FileText } from 'lucide-react'
import { answerFields, formatAnswerValue, type AnswerCitation, type AskAnswer } from '@/lib/search/ask-answer-contracts'

const reasonCopy: Record<NonNullable<AskAnswer['reason']>, string> = {
  reference_required: 'Thêm một mã hồ sơ cụ thể, ví dụ INV-1042, để đối chiếu đúng các thư liên quan.',
  multiple_references: 'Hỏi từng mã hồ sơ để xác định rõ ngày và số tiền của mỗi hồ sơ.',
  unsupported_question: 'Hãy hỏi ngày giao hàng, ngày hóa đơn, hạn thanh toán hoặc một khoản tiền của mã hồ sơ.',
  no_matching_mail: 'Chưa tìm được thư mang đúng mã này trong phạm vi đã chọn.',
}
const outcomeCopy = {
  answered: 'Giá trị ghi trong email',
  conflicting: 'Có mâu thuẫn giữa các email',
  insufficient: 'Chưa đủ bằng chứng',
  partial: 'Đối chiếu được một phần',
}

const claimCopy = {
  supported: '',
  conflicting: 'Các thư ghi giá trị khác nhau. Chưa xác định được giá trị áp dụng.',
  missing: 'Chưa tìm thấy giá trị được nêu rõ cho mục này.',
  unclear: 'Có đề cập nhưng cách diễn đạt hoặc định dạng chưa đủ rõ để chốt giá trị.',
  partial: 'Giá trị thấy trong phần email đã kiểm tra.',
}
const receivedDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' })

function Sources({ citations }: { citations: AnswerCitation[] }) {
  return (
    <ul className="mt-2 space-y-2" aria-label="Bằng chứng email">
      {citations.map(source => (
        <li key={source.emailId + ':' + source.field + ':' + source.quote}
          className="min-w-0 border-s-2 border-[var(--accent)] ps-3">
          <blockquote className="whitespace-pre-line break-words text-sm leading-6 [overflow-wrap:anywhere]">{source.quote}</blockquote>
          <Link prefetch={false} href={'/search/source?' + new URLSearchParams({ email: source.emailId, v: source.version })}
            className="neo-target inline-flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
            <FileText size={16} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">Mở nguồn · {source.subject?.trim() || 'Email không có tiêu đề'}</span>
          </Link>
          <p className="break-words text-xs text-[var(--foreground-muted)] [overflow-wrap:anywhere]">
            {source.sender}{source.account ? ' · ' + source.account : ''}
            {source.at && Number.isFinite(Date.parse(source.at)) &&
              <> · <time dateTime={source.at}>{receivedDate.format(Date.parse(source.at))}</time></>}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function AskAnswerPanel({ answer }: { answer: AskAnswer }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-1 border-s-2 border-[var(--accent)] ps-3">
        <p role="status" className="text-sm font-semibold">{outcomeCopy[answer.status]}</p>
        {answer.reference && <p className="text-sm text-[var(--foreground-secondary)]">
          {answer.reference} · Đã kiểm tra {answer.examined} email khớp mã
        </p>}
        {answer.reason && <p className="text-sm text-[var(--foreground-secondary)]">{reasonCopy[answer.reason]}</p>}
        {!answer.reason && !answer.claims.length && <p className="text-sm text-[var(--foreground-secondary)]">
          Chưa tìm thấy ngày hoặc khoản tiền được nêu rõ trong các email đã kiểm tra.
        </p>}
        {answer.limited && <p className="text-sm text-[var(--foreground-secondary)]">
          Phạm vi kiểm tra đã chạm giới hạn. Các giá trị dưới đây chỉ phản ánh phần đã đọc.
        </p>}
      </div>
      {answer.claims.length > 0 && <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface)]">
        {answer.claims.map(claim => (
          <li key={claim.field} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{answerFields[claim.field]}</h3>
              {claimCopy[claim.status] && <p className="text-sm text-[var(--foreground-secondary)]">{claimCopy[claim.status]}</p>}
            </div>
            {claim.observations.map(observation => (
              <div key={formatAnswerValue(observation.value)} className="min-w-0">
                <p className="break-words text-lg font-semibold tabular-nums">{formatAnswerValue(observation.value)}</p>
                <Sources citations={observation.citations} />
              </div>
            ))}
            {claim.moreValues > 0 && <p className="text-sm text-[var(--foreground-secondary)]">Còn {claim.moreValues} giá trị khác trong phạm vi đã đọc.</p>}
            {claim.unclear.length > 0 && <div>
              <p className="text-xs font-medium text-[var(--foreground-secondary)]">Nguồn cần đối chiếu thêm</p>
              <Sources citations={claim.unclear} />
            </div>}
          </li>
        ))}
      </ul>}
    </div>
  )
}
