import type { Category } from '@/types'

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

export function MailCategoryLabel({ category }: { category: string | null }) {
  const label = getMailCategoryLabel(category)
  if (!label) return null

  return <span className="neo-mail-label" data-category={category}>{label}</span>
}
