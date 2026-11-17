import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
export const output='test-results/living-commitments'
export const cases=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url)))
export const labels=JSON.parse(readFileSync(new URL('./labels.json',import.meta.url)))
export const frozen=JSON.parse(readFileSync(new URL('./FROZEN.json',import.meta.url)))
assert.equal(createHash('sha256').update(JSON.stringify({cases,labels})).digest('hex'),frozen.digest,'Corpus/labels changed after freeze')
export function score(row,candidates) {
  const expected=labels.find(item=>item.id===row.id).events
  const used=new Set(),wrong=[],correct=[]
  const fields=item=>[item.source,item.origin,item.item,item.kind,
    ['create','owner'].includes(item.kind)?item.owner:null,['create','deadline'].includes(item.kind)?item.due:null]
  for(const candidate of candidates) {
    const source=row.emails.find(mail=>mail.id===candidate.source)
    const index=expected.findIndex((item,i)=>!used.has(i)&&JSON.stringify(fields(item))===JSON.stringify(fields(candidate)))
    if(index>=0&&source&&candidate.quote&&source.body.includes(candidate.quote)) {used.add(index);correct.push(candidate)}
    else wrong.push(candidate)
  }
  const missing=expected.filter((_,i)=>!used.has(i))
  return {correct:correct.length,predicted:candidates.length,expected:expected.length,wrong,missing,
    reviewEffort:{approve:correct.length,discard:wrong.length,createMissing:missing.length,sourceChecks:candidates.length}}
}
export function write(name,result){mkdirSync(output,{recursive:true});writeFileSync(output+'/'+name+'.json',JSON.stringify({digest:frozen.digest,...result},null,2)+'\n')}
export function compare() {
  const methods=['rules','product','direct','agent'].map(name=>{
    const report=JSON.parse(readFileSync(output+'/'+name+'.json'));assert.equal(report.digest,frozen.digest)
    assert.deepEqual([...report.cases.map(row=>row.id)].sort(),cases.map(row=>row.id).sort())
    const sum={name,conversations:40,correct:0,predicted:0,expected:0,elapsedMs:0,modelMs:0,calls:0,inputTokens:0,outputTokens:0,errors:0}
    for(const result of report.cases) {
      const grade=score(cases.find(row=>row.id===result.id),result.events)
      Object.assign(result,{grade})
      for(const key of ['correct','predicted','expected'])sum[key]+=grade[key]
      for(const key of ['elapsedMs','calls','inputTokens','outputTokens'])sum[key]+=result[key]??0
      sum.modelMs+=result.modelMs??result.elapsedMs??0
      if(result.error)sum.errors++
    }
    const precision=sum.predicted?sum.correct/sum.predicted:null,recall=sum.correct/sum.expected
    write(name,{...report,cases:report.cases})
    return {...sum,precision,recall,falseProposals:sum.predicted-sum.correct,missed:sum.expected-sum.correct,
      estimatedReviewActions:sum.predicted+(sum.expected-sum.correct),
      caveat:'Estimated approval/discard/missing tasks from synthetic labels, not measured human effort. Titles not scored; exact source/origin/slot/kind/applicable owner/due and verbatim evidence are required.'}
  })
  write('comparison',{methods,provenance:frozen.provenance,limitations:'Same single local 4B model. No paid API, independent human review or real mailbox. Model load and seed/build excluded. Product uses deterministic guards and a persisted ledger; direct/agent propose only.'})
  console.log(JSON.stringify(methods,null,2))
}
