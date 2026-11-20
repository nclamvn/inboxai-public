import { describe, expect, it } from 'vitest'
import { bundles, corpusId, decisionFields, loadLabels } from '../eval/purchase-value/corpus.mjs'
import { evaluateParticipants } from '../eval/purchase-value/participants.mjs'

function reports() {
  const labels = loadLabels()
  return [false, true].map(reverse => {
    const entries = reverse ? [['B', 'inbox'], ['A', 'manual']] : [['B', 'manual'], ['A', 'inbox']]
    return {
      id: reverse ? 'fixture-b' : 'fixture-a',
      schema: 2, version: 'unit-fixture', input: 'synthetic', corpusId, session: 'participant-session', completed: true,
      order: reverse ? 'product-first' : 'manual-first',
      team: { code: reverse ? 'TEST-B' : 'TEST-A', tools: 'Fixture' },
      feedback: { willing: 'yes' },
      rows: entries.flatMap(([bundle, mode]) => bundles[bundle as 'A' | 'B'].map(({ po, kind }: { po: string; kind: string }) => {
        const result = decisionFields(labels[po])
        const approved = result.decision === 'approve'
        return {
          po, kind, bundle, mode, activeMs: mode === 'inbox' ? 7000 : 10000,
          counts: { source: 1, help: 0, revision: 0 },
          outcome: { action: approved ? 'finish' : 'hold', result: {
            ...result, ...(approved && mode === 'inbox' ? { decisionId: po, emailId: po, attachmentId: po } : {}),
          }},
        }
      })),
    }
  })
}
const evaluate = (input: ReturnType<typeof reports>) => evaluateParticipants(input, { corpusId, bundles, labels: loadLabels() })

describe('paired local purchase pilot', () => {
  it('scores both orders and recognizes correct holds without approval', () => {
    const result = evaluate(reports())
    expect(result.stats.inbox.correct).toBe(6)
    expect(result.stats.inbox.counts.source).toBe(6)
    expect(result.savedRatio).toBe(0.3)
    expect(result.gate).toEqual({ safety: true, timing: true, willing: true, go: true })
  })
  it('rejects browser automation and reuse of a team or order', () => {
    const input = reports()
    expect(() => evaluate([input[0], input[0]])).toThrow('thứ tự')
    input[0].session = 'chrome-automation'
    expect(() => evaluate(input)).toThrow('tự động')
    input[0].session = 'participant-session'
    input[1].team.code = input[0].team.code
    expect(() => evaluate(input)).toThrow('mã riêng')
  })
  it('recalculates wrong approvals, refuses a timing claim for abandoned cases and requires feedback', () => {
    const input = reports()
    const wrongApproval = input[0].rows.find(row => row.mode === 'inbox' && row.outcome.action === 'finish')!
    wrongApproval.outcome.result.part = 'wrong-source'
    expect(evaluate(input).stats.inbox.wrongApprovals).toBe(1)
    expect(evaluate(input).gate.go).toBe(false)
    expect(evaluate(input).savedRatio).toBeNull()
    input[0].rows[0].outcome.action = 'abandon'
    expect(evaluate(input).savedRatio).toBeNull()
    input[0].feedback.willing = 'no'
    expect(evaluate(input).gate.willing).toBe(false)
  })
})
