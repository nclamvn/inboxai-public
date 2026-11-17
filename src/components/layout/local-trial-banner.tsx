import Link from 'next/link'

/** Only the loopback fixture supervisor supplies this environment. No auth bypass. */
export function LocalTrialBanner() {
  if (process.env.INBOXAI_TEST_LOCAL_PILOT !== '1') return null
  const app = process.env.NEXT_PUBLIC_APP_URL
  const guide = process.env.INBOXAI_LOCAL_PILOT_GUIDE
  if (!['http://127.0.0.1:55300','http://127.0.0.1:57300'].includes(app ?? '') || guide !== 'http://127.0.0.1:57343') return null
  let version: { commit?: string; fingerprint?: string }
  try { version = JSON.parse(process.env.INBOXAI_LOCAL_PILOT_VERSION ?? '{}') } catch { return null }
  if (!version || typeof version !== 'object') return null
  if (!/^[a-f0-9]{7,40}$/.test(version.commit ?? '') || !/^[a-f0-9]{12}$/.test(version.fingerprint ?? '')) return null
  return <aside aria-label="Bản dùng thử local" data-pilot-version={version.fingerprint}
    className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border)] border-s-2 border-s-[var(--accent)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--foreground-secondary)]">
    <span>Dữ liệu giả lập · {version.commit} / {version.fingerprint}</span>
    <Link href={guide} className="neo-target inline-flex min-h-11 items-center text-[var(--accent-foreground)] underline underline-offset-4">Hướng dẫn và chuyển vai</Link>
  </aside>
}
