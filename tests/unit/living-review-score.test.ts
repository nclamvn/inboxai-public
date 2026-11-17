import {expect,it} from 'vitest'
import {cases,labels,protocol,score} from '../eval/living-review/evaluation.mjs'
it('keeps the predeclared 60-case / 52-event protocol separate from earlier corpora',()=>{
 expect(cases).toHaveLength(60);expect(labels.reduce((n:number,row:{events:unknown[]})=>n+row.events.length,0)).toBe(52)
 expect(new Set(cases.map((row:{id:string})=>row.id)).size).toBe(60)
 expect(protocol).toMatchObject({precisionTarget:.98,recallTarget:.9})
})
it('does not credit a wrong event kind or an ungrounded quote as extraction correctness',()=>{
 const row=cases.find((row:{id:string})=>row.id==='RV-31')
 const original=labels.find((label:{id:string})=>label.id===row.id).events[0]
 const create={...original,quote:row.emails[0].body}
 expect(score(row,[create]).correct).toBe(1)
 const falseClose={...original,source:'m2',kind:'cancelled',owner:null,due:null,quote:row.emails[1].body}
 const result=score(row,[create,falseClose])
 expect(result.correct).toBe(1);expect(result.predicted).toBe(2);expect(result.wrong).toHaveLength(1)
 expect(score(row,[{...create,quote:'Không nằm trong thư.'}]).correct).toBe(0)
})
it('does not turn hiding a candidate into a correct extraction',()=>{
 const row=cases[0],gold=labels[0].events[0],create={...gold,quote:row.emails[0].body}
 const graded=score(row,[create,{...create,kind:'cancelled'}])
 expect(graded.correct).toBe(1);expect(graded.predicted).toBe(2)
 expect(score(row,[]).missing).toHaveLength(1)
})
