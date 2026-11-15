/** Authorization comes only from server-managed auth metadata, never an email suffix. */
export function hasAdminRole(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin'
}
