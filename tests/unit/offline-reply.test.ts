import { describe, expect, it } from 'vitest'
import { compareOfflineReply, offlineReplyFor } from '@/lib/offline/contracts'
import type { ReplyDraft, ReplyWorkbench } from '@/lib/replies/contracts'

const saved: ReplyDraft = {
  id: 'draft', sourceId: 'source', revision: 3, subject: 'Source', to: 'supplier@example.test',
  cc: '', body: 'Server baseline', state: 'draft', tracking: false, files: [], sentId: null,
}
const current: ReplyWorkbench = {
  sourceId: 'source', accountId: 'buying', account: 'buying@example.test', fingerprint: 'original',
  subject: 'Source', to: saved.to, draft: saved, stale: false, thread: [],
}
const local = offlineReplyFor(current, { to: saved.to, cc: '', body: 'Changed on device' })

describe('offline reply comparison', () => {
  it('recovers only against the same server revision and source', () => {
    expect(compareOfflineReply(local, current)).toBe('recoverable')
    expect(compareOfflineReply(local, { ...current, draft: { ...saved, revision: 4, body: 'Changed online' } })).toBe('conflict')
    expect(compareOfflineReply(local, { ...current, draft: null })).toBe('conflict')
  })

  it('recognizes an already saved copy after a response was lost', () => {
    expect(compareOfflineReply(local, { ...current, draft: { ...saved, revision: 4, body: local.fields.body } })).toBe('saved')
  })

  it('requires source review even when text already agrees', () => {
    expect(compareOfflineReply(local, { ...current, fingerprint: 'new-source', draft: { ...saved, body: local.fields.body } })).toBe('source')
    expect(compareOfflineReply(local, { ...current, stale: true })).toBe('source')
  })

  it('blocks an obsolete device draft after approval or an account change', () => {
    expect(compareOfflineReply(local, { ...current, accountId: 'finance' })).toBe('blocked')
    expect(compareOfflineReply(local, { ...current, draft: { ...saved, state: 'prepared' } })).toBe('blocked')
  })
})
