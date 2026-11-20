'use client'

import { Inbox, Flag, ReceiptText, Tag, Newspaper, AlignJustify, Rows3 } from 'lucide-react'

const lanes = [
  { id: 'all', label: 'Tất cả', Icon: Inbox, tone: 'work' },
  { id: 'needs_action', label: 'Cần xử lý', Icon: Flag, tone: 'important' },
  { id: 'transaction', label: 'Giao dịch', Icon: ReceiptText, tone: 'transaction' },
  { id: 'promotion', label: 'Quảng cáo', Icon: Tag, tone: 'promotion' },
  { id: 'newsletter', label: 'Bản tin', Icon: Newspaper, tone: 'newsletter' },
]
export function InboxLanes({ current, counts, onChange, dense, onDensityChange, hasMore }: {
  current: string; counts: Record<string, number>; onChange: (filter: string) => void;
  dense: boolean; onDensityChange: (dense: boolean) => void; hasMore: boolean;
}) {
  return <div className="neo-inbox-controls">
    <div role="group" aria-label="Luồng thư" className="neo-inbox-lanes">
      {lanes.map(({ id, label, Icon, tone }) => <button key={id} type="button" data-mail-tone={tone}
        aria-pressed={current === id} onClick={() => onChange(id)} className="neo-lane neo-target">
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
        <span className="neo-lane-count" aria-label={`${counts[id] ?? 0} thư đã tải${hasMore ? ', còn trang chưa tải' : ''}`}>{counts[id] ?? 0}{hasMore ? '+' : ''}</span>
      </button>)}
    </div>
    <div role="group" aria-label="Mật độ danh sách" className="neo-density">
      <button type="button" aria-label="Hiển thị thoáng" title="Hiển thị thoáng" aria-pressed={!dense} className="neo-icon-button" onClick={() => onDensityChange(false)}><Rows3 size={17} aria-hidden="true" /></button>
      <button type="button" aria-label="Hiển thị gọn" title="Hiển thị gọn" aria-pressed={dense} className="neo-icon-button" onClick={() => onDensityChange(true)}><AlignJustify size={17} aria-hidden="true" /></button>
    </div>
  </div>
}
