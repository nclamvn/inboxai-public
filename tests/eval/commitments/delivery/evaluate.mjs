import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

export const output = 'test-results/delivery-commitments'
const fixture = name => readFileSync(new URL(name, import.meta.url))
const digests = Object.fromEntries(fixture('SHA256SUMS').toString().trim().split('\n').map(line => {
  const [hash, path] = line.split(/\s+/u)
  return [path.split('/').at(-1), hash]
}))
for (const [name, hash] of Object.entries(digests)) assert.equal(createHash('sha256').update(fixture(name)).digest('hex'), hash)
export const cases = JSON.parse(fixture('cases.json'))
const labels = JSON.parse(fixture('labels.json'))
const review = z.strictObject({
  source: z.string(), target: z.string(),
  kind: z.enum(['create', 'review', 'progress', 'deadline', 'completed']),
  owner: z.string().nullable(), due: z.string().nullable(), received: z.number().int().nullable(), quote: z.string(),
})
const extraction = z.strictObject({ events: z.array(review).max(10) })

export function modelExtraction(ids) {
  const email = z.enum(ids)
  const base = { source: email, target: email, quote: z.string() }
  const nil = z.null()
  const date = z.string()
  const count = z.number().int().min(0)
  const kinds = [
    z.strictObject({ ...base, kind: z.literal('create'), owner: z.string(), due: date, received: z.literal(0) }),
    z.strictObject({ ...base, kind: z.literal('review'), owner: nil, due: nil, received: nil }),
    z.strictObject({ ...base, kind: z.literal('deadline'), owner: nil, due: date, received: nil }),
    z.strictObject({ ...base, kind: z.enum(['progress', 'completed']), owner: nil, due: nil, received: count }),
  ]
  return z.strictObject({ events: z.array(z.union(kinds)).max(10) })
}

const match = (value, target) => Object.entries(value).every(([key, actual]) => key === 'quote'
  ? actual.trim().replace(/[.!]$/u, '') === target.quote.trim().replace(/[.!]$/u, '') : actual === target[key])

export function scoreCase(row, submitted) {
  const expected = labels[row.id]
  const available = new Set(expected)
  const extra = []
  const invalidSources = []
  const exact = []
  for (const event of extraction.parse({ events: submitted }).events) {
    const valid = event.quote.length > 0 && row.emails.some(mail => mail.id === event.source && mail.body.includes(event.quote))
    const target = valid && [...available].find(label => match(event, label))
    if (!valid) invalidSources.push(event.source)
    if (!target) extra.push(event)
    else {
      available.delete(target)
      exact.push(event)
    }
  }
  return { correct: exact.length, expected: expected.length, missing: [...available], extra, invalidSources }
}

export function writeResult(name, data) {
  writeFileSync(output + '/' + name + '.json', JSON.stringify({ digests, ...data }, null, 2) + '\n')
}

export function compare() {
  const methods = ['product', 'manual-simulated', 'direct', 'agent'].map(name => {
    const raw = JSON.parse(readFileSync(output + '/' + name + '.json'))
    assert.deepEqual(raw.digests, digests)
    assert.deepEqual(raw.cases.map(row => row.id).sort(), cases.map(row => row.id).sort())
    const byCase = raw.cases.map(run => ({ ...run, ...scoreCase(cases.find(row => row.id === run.id), run.events) }))
    const sum = field => byCase.reduce((total, row) => total + (row[field] ?? 0), 0)
    return { method: name, correct: sum('correct'), expected: sum('expected'),
      proposed: byCase.reduce((total, row) => total + row.events.length, 0),
      computeOrObservedMs: sum('elapsedMs'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'),
      extra: byCase.reduce((total, row) => total + row.extra.length, 0),
      missing: byCase.reduce((total, row) => total + row.missing.length, 0),
      failedCases: byCase.filter(row => row.error).length, byCase }
  })
  writeResult('comparison', { methods })
  for (const { method, correct, expected, proposed, computeOrObservedMs, failedCases } of methods) {
    console.log(method, { correct, expected, proposed, computeOrObservedMs: Math.round(computeOrObservedMs), failedCases })
  }
}
