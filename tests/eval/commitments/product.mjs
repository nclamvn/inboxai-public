import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cases, event, labelsForScoring, matchesEvent, writeReport } from './benchmark.mjs'

const collection = '/api/commitments'
const detection = collection + '/detections'

export async function runProduct({ admin, appFetch, userId, ownEmailId, record }) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  git('diff', '--quiet', 'HEAD', '--', 'src', 'supabase', 'next.config.ts', 'package-lock.json')
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', 'src', 'supabase'), '', 'Uncommitted product sources')
  const labels = labelsForScoring()
  assert.equal((await admin.from('emails').delete().eq('id', ownEmailId).eq('user_id', userId)).error, null)
  const accounts = new Map(['mua-hang', 'ky-thuat'].map(name => [name, randomUUID()]))
  const accountRows = [...accounts].map(([name, id]) => ({ id, user_id: userId, email_address: `${name}@inbox.example.test`, provider: 'custom' }))
  assert.equal((await admin.from('source_accounts').insert(accountRows)).error, null)

  async function request(path, init, expected = 200) {
    const response = await appFetch(path, init)
    assert.equal(response.status, expected, path)
    return response.json()
  }

  const outcome = []
  const targets = new Map()
  const expectedLedger = new Map()
  let arrivals = 0
  for (const row of cases) {
    const result = { id: row.id, events: [], scanMs: 0, confirmMs: 0, requests: 0, blocked: [], committed: 0 }
    const approvedLabels = new Set()
    for (const mail of row.emails) {
      const id = randomUUID()
      assert.equal((await admin.from('emails').insert({
        id, user_id: userId, source_account_id: accounts.get(mail.account), from_address: mail.sender,
        subject: mail.subject, body_text: mail.body, received_at: mail.at,
        created_at: new Date(Date.UTC(2026, 10, 1, 0, arrivals++)).toISOString(),
        body_fetched: true, direction: 'inbound',
      })).error, null)
      let cursor = null, proposals = []
      const start = performance.now()
      for (let page = 0; page < 4; page++) {
        const response = await request(cursor ? `${detection}?beforeId=${cursor}` : detection)
        result.requests++
        proposals = response.proposals.filter(item => item.emailId === id)
        cursor = response.nextBeforeId
        if (proposals.length || !cursor) break
      }
      result.scanMs += performance.now() - start
      const ledger = await request(collection)
      assert.deepEqual(Object.fromEntries(ledger.items.map(item => [item.id, item.version])), Object.fromEntries(expectedLedger))
      for (const proposal of proposals) {
        if (proposal.blocked) result.blocked.push({ source: mail.id, reason: proposal.blocked, kind: proposal.kind })
        if (!proposal.review) continue
        const command = proposal.review.command
        const { state } = command
        const candidate = event.parse({
          source: mail.id, target: command.operation === 'create' ? mail.id : targets.get(command.id),
          kind: proposal.kind, owner: ['create', 'owner'].includes(proposal.kind) ? state.ownerEmail : null,
          due: ['create', 'deadline'].includes(proposal.kind) ? state.dueOn : null, quote: command.evidence.quote,
        })
        result.events.push(candidate)
        // Accept a correctly sourced event once and leave mistakes unrepaired.
        const label = labels[row.id].find(item => !approvedLabels.has(item) && matchesEvent(candidate, item, row.emails))
        if (!label) continue
        approvedLabels.add(label)
        const startWrite = performance.now()
        const receipt = await request(detection, { method: 'POST', body: JSON.stringify(command),
          headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() } }, command.operation === 'create' ? 201 : 200)
        result.confirmMs += performance.now() - startWrite
        result.committed++
        assert.equal(receipt.version, (expectedLedger.get(receipt.id) ?? 0) + 1)
        expectedLedger.set(receipt.id, receipt.version)
        targets.set(receipt.id, candidate.target)
        const saved = await request(`${collection}/${receipt.id}`)
        assert.equal(saved.version, receipt.version)
        for (const key of ['title', 'ownerEmail', 'dueOn', 'status']) assert.equal(saved.state[key], state[key])
        assert.deepEqual(saved.history[0].sources.map(source => [source.emailId, source.quote]), [[id, candidate.quote]])
      }
    }
    outcome.push({ ...result, elapsedMs: result.scanMs + result.confirmMs })
  }
  const final = await request(collection)
  record('benchmark scanning leaves the ledger unchanged until approval and accepted revisions retain literal evidence',
    final.items.length === expectedLedger.size && final.items.every(item => item.version === expectedLedger.get(item.id)))
  writeReport('product', { method: 'product', sourceCommit: git('rev-parse', 'HEAD'),
    sourceTree: git('rev-parse', 'HEAD:src'), migrationsTree: git('rev-parse', 'HEAD:supabase'),
    reviewPolicy: 'Accept exact candidates only; no synthetic human review duration or repair. Elapsed time includes detection scans and accepted POSTs.',
    arrivals, cases: outcome })
}
