import { Inbox, ClipboardCheck, MessageSquare, ListChecks, Send, CalendarClock, FileText, Star, Archive, Trash2, Clock, Search, Bell, Newspaper, ListTodo, BarChart3, Settings } from 'lucide-react'

export const primaryDestinations = [
  { href: '/inbox', icon: Inbox, label: 'Hộp thư đến', description: 'Điều quan trọng trước', tone: 'work' },
  { href: '/commitments', icon: ClipboardCheck, label: 'Cam kết', description: 'Trách nhiệm và tiến độ', tone: 'personal' },
  { href: '/search', icon: MessageSquare, label: 'Ask Inbox', description: 'Câu trả lời có nguồn', tone: 'transaction' },
  { href: '/operator', icon: ListChecks, label: 'AI Operator', description: 'Bạn duyệt, AI thực hiện', tone: 'work' },
]
export const mailDestinations = [
  { href: '/snoozed', icon: Clock, label: 'Đã hẹn' },
  { href: '/drafts', icon: FileText, label: 'Bản nháp' },
  { href: '/outbox', icon: CalendarClock, label: 'Chờ gửi' },
  { href: '/sent', icon: Send, label: 'Đã gửi' },
  { href: '/starred', icon: Star, label: 'Gắn sao' },
  { href: '/archive', icon: Archive, label: 'Lưu trữ' },
  { href: '/trash', icon: Trash2, label: 'Thùng rác' },
]
export const toolDestinations = [
  { href: '/search/mail', icon: Search, label: 'Tìm thư và tệp' },
  { href: '/follow-ups', icon: Bell, label: 'Theo dõi' },
  { href: '/subscriptions', icon: Newspaper, label: 'Bản tin' },
  { href: '/actions', icon: ListTodo, label: 'Việc cần làm' },
  { href: '/insights', icon: BarChart3, label: 'Phân tích' },
  { href: '/settings', icon: Settings, label: 'Cài đặt' },
]
export const isDestinationActive = (pathname: string, href: string) =>
  href === '/search' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
