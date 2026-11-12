import 'server-only'
import { z } from 'zod'

const scopeError = z.object({ error: z.object({
  errors: z.array(z.object({ reason: z.string() })).optional(),
  details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
}) })

export async function isGmailScopeDenial(response: Response) {
  if (/\berror\s*=\s*"insufficient_scope"/i.test(response.headers.get('www-authenticate') ?? '')) return true
  const result = scopeError.safeParse(await response.json().catch(() => null))
  return result.success && (result.data.error.errors?.some(error => error.reason === 'insufficientPermissions') ||
    result.data.error.details?.some(detail => detail.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'))
}
