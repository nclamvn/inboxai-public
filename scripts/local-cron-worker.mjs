import { setTimeout as delay } from 'node:timers/promises'

const jobs = {
  sync: { path: '/api/cron/sync-emails', variable: 'INBOXAI_GMAIL_SYNC_URL', interval: 60_000, timeout: 290_000,
    summary: body => ({ processed: body.results?.processed ?? 0, synced: body.results?.synced ?? 0, errors: body.results?.errors ?? 0 }) },
  send: { path: '/api/cron/send-scheduled', variable: 'INBOXAI_SCHEDULED_SEND_URL', interval: 10_000, timeout: 65_000,
    summary: body => ({ claimed: body.claimed, unrecorded: body.unrecorded }) },
}

export async function runLocalWorker(job, env = process.env, args = process.argv) {
  const { path, variable, interval, timeout, summary } = jobs[job]
  const endpoint = new URL(path, env[variable] || 'http://127.0.0.1:3000')
  const secret = env.CRON_SECRET
  const once = args.includes('--once')

  if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
      endpoint.username || endpoint.password || !secret?.trim()) {
    console.error(`Set a loopback ${variable} and CRON_SECRET.`)
    process.exitCode = 1
    return
  }

  const stop = new AbortController()
  const stopWorker = () => stop.abort()
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stopWorker)
  do {
    try {
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(timeout)]),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const counts = summary(await response.json())
      if (once || counts.claimed || counts.synced || counts.errors) console.log(JSON.stringify(counts))
    } catch (error) {
      if (stop.signal.aborted) break
      console.error(`Local ${job} worker tick failed.`, error instanceof Error ? error.name : 'Error')
      if (once) process.exitCode = 1
    }
    if (!once && !stop.signal.aborted) await delay(interval, undefined, { signal: stop.signal }).catch(() => {})
  } while (!once && !stop.signal.aborted)
  for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, stopWorker)
}
