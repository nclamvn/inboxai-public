import {expect,it} from 'vitest'
import {cases,labels,score} from '../eval/living-coverage/evaluation.mjs'
const row=cases[0]
const gold=labels[0].events[0]
const candidate={...gold,quote:row.emails[0].body}
it('separates missing detection from a detected promise with an incorrect date',()=>{
  const graded=score(row,[{...candidate,due:null}])
  expect(graded.correct).toBe(0);expect(graded.detected).toBe(1);expect(graded.missing).toHaveLength(1)
})
it('does not accept a source substring that omits the actual task anchor',()=>{
  expect(score(row,[{...candidate,quote:row.emails[0].body.slice(-11)}]).correct).toBe(0)
})
it('counts duplicate proposals once and keeps false proposals in the work estimate',()=>{
  const graded=score(row,[candidate,candidate])
  expect(graded.correct).toBe(1);expect(graded.wrong).toHaveLength(1)
  expect(graded.reviewEffort).toMatchObject({approve:1,discard:1,sourceChecks:2})
})
