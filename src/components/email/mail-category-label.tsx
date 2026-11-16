import type { Category } from '@/types'
import { mailSignal } from './mail-signal'

export const mailCategoryLabels: Record<Category, string> = {
  work: 'Công việc',
  personal: 'Cá nhân',
  transaction: 'Giao dịch',
  newsletter: 'Bản tin',
  promotion: 'Quảng cáo',
  social: 'Mạng xã hội',
  spam: 'Spam',
  uncategorized: 'Chưa phân loại',
}

export function getMailCategoryLabel(category: string | null) {
  return category && Object.hasOwn(mailCategoryLabels, category)
    ? mailCategoryLabels[category as Category]
    : undefined
}

export function MailCategoryLabel({ category, id }: { category: string | null; id?: string }) {
  const label = getMailCategoryLabel(category)
  if (!label) return null

  const { Icon } = mailSignal(category)
  return <span id={id} className="neo-mail-label" data-category={category}><Icon size={12} strokeWidth={1.8} aria-hidden="true" />{label}</span>
}
