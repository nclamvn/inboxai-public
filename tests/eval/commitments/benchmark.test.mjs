import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cases, corpusDigest, evaluateCase, labelsForScoring, summarize } from './benchmark.mjs'

const row = cases.find(item => item.id === 'PO-4812')
const labels = labelsForScoring()[row.id]
function candidate(label) {
  const event = { ...label }
  delete event.important
  return event
}

test('a duplicate and a literal quote for the wrong due date cannot increase exact recall', () => {
  const first = candidate(labels[0])
  const result = evaluateCase(row, labels, [first, first, { ...candidate(labels[1]), due: '2026-10-14' }])
  assert.equal(result.exact, 1)
  assert.equal(result.structuredExact, 1)
  assert.equal(result.cited, 3)
  assert.equal(result.importantMisses, 1)
  assert.deepEqual(result.corrections, { approve: 1, edit: 1, discard: 1, add: 1, checkSources: 3 })
})

test('a truncated or invented quote is distinguishable from a correct structured event', () => {
  const first = candidate(labels[0])
  const result = evaluateCase(row, [labels[0]], [{ ...first, quote: '40 bộ gioăng' }])
  assert.equal(result.structuredExact, 1)
  assert.equal(result.cited, 1)
  assert.equal(result.exact, 0)
  assert.equal(evaluateCase(row, [labels[0]], [{ ...first, quote: '50 bộ gioăng' }]).cited, 0)
})

test('the scorer rejects mismatched corpus hashes and duplicated case results', () => {
  const allLabels = labelsForScoring()
  const sample = { id: row.id, events: [], elapsedMs: 25 }
  assert.throws(() => summarize({ method: 'manual', corpusDigest: 'other', cases: [sample] }, allLabels), /Mismatched/)
  assert.throws(() => summarize({ method: 'manual', corpusDigest, cases: [sample, sample] }, allLabels))
  assert.equal(summarize({ method: 'manual', corpusDigest, cases: [sample] }, allLabels).precision, null)
})

test('empty confirmations must agree with the submitted events', () => {
  const allLabels = labelsForScoring()
  const sample = { id: row.id, events: [], elapsedMs: 25 }
  const score = record => summarize({ method: 'manual', corpusDigest, cases: [record] }, allLabels)
  assert.equal(score({ ...sample, confirmedNoEvents: true }).byCase[0].confirmedNoEvents, true)
  assert.throws(() => score({ ...sample, confirmedNoEvents: false }), /Empty-event confirmation/)
  assert.throws(() => score({ ...sample, confirmedNoEvents: true, events: [candidate(labels[0])] }), /Empty-event confirmation/)
})
