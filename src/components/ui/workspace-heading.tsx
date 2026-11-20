import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function WorkspaceHeading({ title, description, icon: Icon, tone = 'work', children }: {
  title: string; description: string; icon: LucideIcon; tone?: string; children?: ReactNode;
}) {
  return <div className="neo-workspace-heading" data-mail-tone={tone}>
    <span className="neo-workspace-emblem" aria-hidden="true"><Icon size={22} strokeWidth={1.6} /></span>
    <div className="min-w-0"><h1 className="neo-title">{title}</h1><p>{description}</p>{children}</div>
  </div>
}
