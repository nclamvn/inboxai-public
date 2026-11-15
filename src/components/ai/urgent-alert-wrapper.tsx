'use client'

import { usePathname, useRouter } from 'next/navigation'
import { UrgentAlert } from './urgent-alert'

export function UrgentAlertWrapper() {
  const router = useRouter()
  const pathname = usePathname()

  const handleSelectEmail = (id: string) => {
    router.push(`/inbox?email=${id}`)
  }

  return <UrgentAlert onSelectEmail={handleSelectEmail} hidden={pathname === '/compose'} />
}
