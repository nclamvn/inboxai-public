import { setTimeout as delay } from 'node:timers/promises'

const endpoint = new URL('/api/cron/send-scheduled', process.env.INBOXAI_SCHEDULED_SEND_URL || 'http://127.0.0.1:3000')
const secret = process.env.CRON_SECRET
const once = process.argv.includes('--once')

if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username || endpoint.password || !secret?.trim()) {
  console.error('Set a loopback INBOXAI_SCHEDULED_SEND_URL and CRON_SECRET.')
  process.exit(1)
}

const stop = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop.abort())
do {
  try {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(65_000)]),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { claimed, unrecorded } = await response.json()
    if (once || claimed) console.log(JSON.stringify({ claimed, unrecorded }))
  } catch (error) {
    if (stop.signal.aborted) break
    console.error('Scheduled send tick failed.', error instanceof Error ? error.name : 'Error')
    if (once) process.exitCode = 1
  }
  if (!once && !stop.signal.aborted) await delay(10_000, undefined, { signal: stop.signal }).catch(() => {})
} while (!once && !stop.signal.aborted)
