import { expect, it } from 'vitest'
import { hasAdminRole } from '@/lib/security/admin'

it.each([null, undefined, {}, { app_metadata: {} }, { app_metadata: { role: 'user' } }])('denies missing/unprivileged auth metadata %j', user => {
  expect(hasAdminRole(user)).toBe(false)
})
it('accepts only the exact server-managed role', () => {
  expect(hasAdminRole({ app_metadata: { role: 'admin' } })).toBe(true)
})
it('email and user-controlled metadata cannot grant admin access', () => {
  const user = { email: 'nclamvn@gmail.com', user_metadata: { role: 'admin' }, app_metadata: {} }
  expect(hasAdminRole(user)).toBe(false)
  const suffixUser = { ...user, email: 'attacker@admin.inboxai.com' }
  expect(hasAdminRole(suffixUser)).toBe(false)
})
