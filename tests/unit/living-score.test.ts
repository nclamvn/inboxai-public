import {expect,it} from 'vitest'
import {cases,labels,score} from '../eval/living/benchmark.mjs'

const row=cases.find((item:{id:string})=>labels.find((label:{id:string})=>label.id===item.id).events.length>0)
const expected=labels.find((label:{id:string})=>label.id===row.id).events[0]
const candidate={...expected,quote:row.emails.find((mail:{id:string;body:string})=>mail.id===expected.source).body}
it('counts a source-bound event only once and preserves the duplicate as review work',()=>{
  const grade=score(row,[candidate,candidate])
  expect(grade.correct).toBe(1)
  expect(grade.predicted).toBe(2)
  expect(grade.wrong).toHaveLength(1)
  expect(grade.reviewEffort.discard).toBe(1)
})
it('does not grant correctness to the right fields with fabricated evidence or account-external source',()=>{
  expect(score(row,[{...candidate,quote:'Fabricated evidence not in the source.'}]).correct).toBe(0)
  expect(score(row,[{...candidate,source:'another-account'}]).correct).toBe(0)
})
it('includes missing events and field errors in the estimated repair effort',()=>{
  const grade=score(row,[{...candidate,owner:'wrong@example.test'}])
  expect(grade.correct).toBe(0)
  expect(grade.missing).toHaveLength(grade.expected)
  expect(grade.reviewEffort.createMissing).toBe(grade.expected)
})
