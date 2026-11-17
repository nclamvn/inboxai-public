import Link from 'next/link'
import type {LedgerDetail} from '@/lib/commitments/view'
import {statusLabels} from '@/lib/commitments/view'

/** Deterministic answer from an authenticated ledger, never an LLM assertion. */
export function ConfirmedCommitmentAnswer({detail}:{detail:LedgerDetail}) {
  const facts=[['ownerEmail','Ai chịu trách nhiệm?',detail.state.ownerEmail??'Chưa xác định email người phụ trách'],
    ['dueOn','Hạn nào đang được xác nhận?',detail.state.dueOn??detail.state.dueAt??'Chưa có hạn được xác nhận'],
    ['status','Trạng thái đã ghi nhận?',statusLabels[detail.state.status]]] as const
  return <section aria-label="Trạng thái cam kết đã xác nhận" className="mx-auto max-w-3xl p-4 sm:p-6">
    <Link href="/search" className="neo-target inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline">Ask Inbox · Tìm trong email</Link>
    <h1 className="mt-3 text-2xl font-semibold">Cam kết này hiện thế nào?</h1>
    <h2 className="mt-3 text-base font-semibold">{detail.state.title}</h2>
    <p className="mt-2 text-xs text-[var(--foreground-muted)]">Trạng thái trong sổ đã được người dùng xác nhận · Phiên bản {detail.version}. Không phải xác minh lại kết quả thực tế bên ngoài.</p>
    {facts.map(([field,label,value])=>{
      const revision=detail.history.find(item=>item.changedFields.includes(field))
      return <div key={field} className="mt-4 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-medium">{label}</h3><p className="mt-1 break-words text-base">{value}</p>
        {revision?<ul aria-label={'Nguồn cho '+label}>{revision.sources.map((source,index)=><li className="mt-2 border-s-2 border-[var(--accent)] ps-3" key={source.emailId+':'+index}>
          {source.availability==='available'?<>
            <blockquote className="break-words text-sm">{source.quote}</blockquote>
            <Link href={'/inbox?email='+source.emailId} className="neo-target inline-flex min-h-11 items-center break-words text-sm text-[var(--accent-foreground)] underline">Mở nguồn · {source.subject??'Không có tiêu đề'}</Link>
          </>:<p className="text-sm text-[var(--warning)]">Email nguồn đã thay đổi hoặc không còn khả dụng; chưa thể đối chiếu lại nguyên văn.</p>}
          <p className="text-xs text-[var(--foreground-muted)]">Bản ghi xác nhận {revision.version}</p>
        </li>)}</ul>:<p className="mt-2 text-sm">Chưa có nguồn cho trường này trong phần lịch sử đã tải. Mở sổ để kiểm tra thêm.</p>}
      </div>
    })}
    <Link href={'/commitments?group='+(detail.state.status==='open'?'waiting':'closed')+'&id='+detail.id}
      className="neo-target mt-4 inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline">Mở đầy đủ lịch sử cam kết</Link>
  </section>
}
