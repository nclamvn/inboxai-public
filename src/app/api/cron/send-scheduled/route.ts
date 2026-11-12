import { requireCronAuthorization } from '@/lib/security/cron'
import { runScheduledMail } from '@/lib/scheduled-mail/server'

export const maxDuration = 60

export async function POST(request: Request) {
  const denied = requireCronAuthorization(request)
  if (denied) return denied
  try {
    const report = await runScheduledMail()
    return Response.json(report, { status: report.unrecorded ? 503 : 200 })
  } catch {
    return Response.json({ error: 'Scheduled mail worker unavailable' }, { status: 503 })
  }
}
