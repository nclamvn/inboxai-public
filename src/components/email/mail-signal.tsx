import { BriefcaseBusiness, CircleAlert, Flag, Mail, MessagesSquare, Newspaper, ReceiptText, ShieldAlert, Tag, UserRound } from 'lucide-react'

const categories = {
  work: BriefcaseBusiness, personal: UserRound, transaction: ReceiptText,
  newsletter: Newspaper, promotion: Tag, social: MessagesSquare, spam: ShieldAlert,
}

export function mailSignal(category: string | null, priority?: 'urgent' | 'important') {
  if (priority) return { tone: priority, Icon: priority === 'urgent' ? CircleAlert : Flag }
  if (category && Object.hasOwn(categories, category)) return { tone: category, Icon: categories[category as keyof typeof categories] }
  return { tone: 'neutral', Icon: Mail }
}

/** The enclosing mail opener supplies the accessible category and priority text. */
export function MailSignal({ category, priority }: { category: string | null; priority?: 'urgent' | 'important' }) {
  const { tone, Icon } = mailSignal(category, priority)
  return <span aria-hidden="true" data-mail-tone={tone} className="neo-signal-tile mt-1">
    <Icon size={17} strokeWidth={1.8} />
  </span>
}
