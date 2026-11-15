import { execFileSync, spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each([
  { NEXT_PUBLIC_APP_URL: '', CRON_SECRET: 'synthetic' },
  { NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:9', CRON_SECRET: '' },
])('worker rejects missing configuration without scheduling network work %j', config => {
  const result = spawnSync(process.execPath, ['scripts/sync-worker.js'], {
    env: { ...process.env, ...config }, timeout: 2000, encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('must be configured')
  expect(result.stdout).not.toContain('Starting first sync')
})
it.each(['scripts/sync-worker.js', 'scripts/cron-sync.js'])('scheduler script parses: %s', path => {
  expect(() => execFileSync(process.execPath, ['--check', path])).not.toThrow()
})
