import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

export const output = 'test-results/m6g'
export const casesFile = new URL('./cases.json', import.meta.url)
const labelsFile = new URL('./labels.json', import.meta.url)
export const cases = JSON.parse(readFileSync(casesFile, 'utf8'))
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex')
export const corpusDigest = digest(casesFile)
export const event = z.strictObject({
  source: z.string().min(1).max(12), target: z.string().min(1).max(12),
  kind: z.enum(['create', 'deadline', 'owner', 'completed', 'cancelled']),
  owner: z.email().nullable(), due: z.iso.date().nullable(), quote: z.string().trim().min(1).max(480),
})
const eventFields = ['source', 'target', 'kind', 'owner', 'due']
const sameFields = (actual, expected) => eventFields.every(key => actual[key] === expected[key])
const claimText = quote => quote.trim().replace(/[.!]$/u, '')

export function labelsForScoring() {
  const labels = JSON.parse(readFileSync(labelsFile, 'utf8'))
  assert.deepEqual(Object.keys(labels).sort(), cases.map(row => row.id).sort())
  for (const row of cases) {
    const mail = new Map(row.emails.map(message => [message.id, message.body]))
    assert.equal(mail.size, row.emails.length)
    const expected = labels[row.id]
    assert.equal(new Set(expected.map(e => JSON.stringify(e))).size, expected.length)
    for (const { important, ...label } of expected) {
      event.parse(label)
      assert.equal(typeof important, 'boolean')
      assert.ok(mail.get(label.source)?.includes(label.quote) && mail.has(label.target), `Invalid evidence for ${row.id}`)
      assert.ok(expected.some(item => item.kind === 'create' && item.source === label.target))
    }
  }
  return labels
}

export function matchesEvent(actual, expected, messages) {
  return sameFields(actual, expected) && messages.some(mail => mail.id === actual.source && mail.body.includes(actual.quote)) &&
    claimText(actual.quote) === claimText(expected.quote)
}

export function evaluateCase(row, expected, candidates) {
  const remaining = [...expected]
  const remainingStructured = [...expected]
  const unmatched = []
  let exact = 0, cited = 0
  for (const candidate of candidates) {
    const structured = remainingStructured.findIndex(label => sameFields(candidate, label))
    if (structured >= 0) remainingStructured.splice(structured, 1)
    if (row.emails.some(mail => mail.id === candidate.source && mail.body.includes(candidate.quote))) cited++
    const match = remaining.findIndex(label => matchesEvent(candidate, label, row.emails))
    if (match < 0) unmatched.push(candidate)
    else { remaining.splice(match, 1); exact++ }
  }
  const missing = [...remaining]
  let edit = 0, discard = 0
  for (const candidate of unmatched) {
    const correction = remaining.findIndex(label => label.source === candidate.source && label.kind === candidate.kind)
    if (correction < 0) discard++
    else { edit++; remaining.splice(correction, 1) }
  }
  return {
    exact, structuredExact: expected.length - remainingStructured.length, candidates: candidates.length, expected: expected.length, cited,
    importantMisses: missing.filter(label => label.important).length,
    corrections: { approve: exact, edit, discard, add: remaining.length, checkSources: candidates.length },
    missing, unmatched,
  }
}

export function writeReport(name, data) {
  mkdirSync(output, { recursive: true })
  writeFileSync(`${output}/${name}.json`, JSON.stringify({ corpusDigest, ...data }, null, 2) + '\n')
}

const duration = z.number().finite().min(0)
const activityCount = z.number().int().min(0).optional()
const observation = z.object({
  id: z.string(), events: z.array(event).max(16), elapsedMs: duration, error: z.string().optional(),
  openedEmails: activityCount, fieldChanges: activityCount, rowsAdded: activityCount, rowsRemoved: activityCount,
})

export function summarize(report, labels) {
  assert.equal(report.corpusDigest, corpusDigest, 'Mismatched email corpus')
  const observed = z.array(observation).parse(report.cases)
  assert.equal(new Set(observed.map(row => row.id)).size, observed.length)
  assert.ok(observed.length > 0 && observed.every(row => cases.some(sample => sample.id === row.id)))
  const byCase = observed.map(run => ({ ...run, ...evaluateCase(cases.find(row => row.id === run.id), labels[run.id], run.events) }))
  const total = key => byCase.reduce((sum, row) => sum + row[key], 0)
  const median = byCase.map(row => row.elapsedMs).sort((a, b) => a - b)
  const middle = Math.floor(median.length / 2)
  return {
    method: report.method, cases: byCase.length, exact: total('exact'), structuredExact: total('structuredExact'),
    candidates: total('candidates'), expected: total('expected'),
    precision: total('candidates') ? total('exact') / total('candidates') : null,
    recall: total('expected') ? total('exact') / total('expected') : null,
    importantMisses: total('importantMisses'), literalCitations: total('cited'), failures: byCase.filter(row => row.error).length,
    medianMs: median.length % 2 ? median[middle] : (median[middle - 1] + median[middle]) / 2,
    totalMs: total('elapsedMs'),
    corrections: Object.fromEntries(Object.keys(byCase[0].corrections).map(key => [key, byCase.reduce((sum, row) => sum + row.corrections[key], 0)])),
    ...(report.method === 'manual' && { manualActivity: Object.fromEntries(['openedEmails', 'fieldChanges', 'rowsAdded', 'rowsRemoved']
      .map(key => [key, byCase.every(row => row[key] !== undefined) ? total(key) : null])) }),
    byCase,
  }
}

export function compare(manualPath) {
  const labels = labelsForScoring()
  const reports = ['product', 'direct', 'agent'].map(name => {
    const report = JSON.parse(readFileSync(`${output}/${name}.json`, 'utf8'))
    assert.equal(report.method, name)
    return report
  })
  const methods = reports.map(report => {
    assert.deepEqual(report.cases.map(row => row.id).sort(), cases.map(row => row.id).sort(), 'Incomplete automated evaluation')
    return summarize(report, labels)
  })
  const manualReport = manualPath ? JSON.parse(readFileSync(manualPath, 'utf8')) : null
  if (manualReport) assert.equal(manualReport.method, 'manual')
  const manual = manualReport ? summarize(manualReport, labels) : null
  const matchingSubset = manual ? reports.map(report => summarize({ ...report, cases: report.cases.filter(row =>
    manual.byCase.some(manualCase => manualCase.id === row.id)) }, labels)) : []
  writeReport('comparison', { labelDigest: digest(labelsFile), methods, manual, matchingSubset,
    notes: 'Synthetic labels authored for M6-G; source + creation target + kind + owner/date and full decisive literal quote must match. Correction counts model explicit review actions, not human time.' })
  console.table(methods.map(({ method, exact, candidates, expected, importantMisses, medianMs, failures, corrections }) =>
    ({ method, exact, candidates, expected, importantMisses, medianMs: Math.round(medianMs), failures, ...corrections })))
  console.log(manual ? `Manual participant results: ${manual.cases} cases.` : 'Manual participant results: pending.')
}
