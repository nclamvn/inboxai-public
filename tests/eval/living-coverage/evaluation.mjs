import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs'
import {livingModelInput} from '../../../src/lib/commitments/living-extraction.ts'
const root=new URL('./',import.meta.url)
export const output='test-results/living-coverage'
export const cases=JSON.parse(readFileSync(new URL('cases.json',root)))
export const labels=JSON.parse(readFileSync(new URL('labels.json',root)))
export const protocol=JSON.parse(readFileSync(new URL('PROTOCOL.json',root)))
export const frozen=JSON.parse(readFileSync(new URL('FROZEN.json',root)))
assert.equal(createHash('sha256').update(JSON.stringify({cases,labels,protocol})).digest('hex'),frozen.digest,'Frozen corpus/protocol changed')
for(const [name,hash]of Object.entries(JSON.parse(readFileSync(new URL('legacy/FROZEN.json',root))).sha256))
  assert.equal(createHash('sha256').update(readFileSync(new URL('legacy/'+name,root))).digest('hex'),hash,'Legacy baseline changed')
const fold=text=>text.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/gu,' ').trim()
export function score(row,candidates) {
  const expected=labels.find(label=>label.id===row.id)?.events
  assert.ok(expected,'Unknown case '+row.id)
  const used=new Set(),detected=new Set(),wrong=[]
  const sameEvent=(a,b)=>['source','origin','item','kind'].every(key=>a[key]===b[key])
  const sameFacts=(a,b)=>(!['create','owner'].includes(a.kind)||a.owner===b.owner)&&(!['create','deadline'].includes(a.kind)||a.due===b.due)
  for(const candidate of candidates) {
    const source=row.emails.find(mail=>mail.id===candidate.source)
    const grounded=source&&typeof candidate.quote==='string'&&candidate.quote.trim()&&source.body.includes(candidate.quote)
    const supports=item=>grounded&&fold(candidate.quote).includes(fold(item.anchor))
    const found=expected.findIndex((item,i)=>!used.has(i)&&sameEvent(item,candidate)&&sameFacts(item,candidate)&&supports(item))
    if(found>=0)used.add(found);else wrong.push(candidate)
    const detection=expected.findIndex((item,i)=>!detected.has(i)&&sameEvent(item,candidate)&&supports(item))
    if(detection>=0)detected.add(detection)
  }
  const missing=expected.filter((_,i)=>!used.has(i))
  return {correct:used.size,predicted:candidates.length,expected:expected.length,detected:detected.size,wrong,missing,
    reviewEffort:{approve:used.size,discard:wrong.length,createOrRepair:missing.length,sourceChecks:candidates.length}}
}
export function write(name,value){mkdirSync(output,{recursive:true});const path=output+'/'+name+'.json';writeFileSync(path+'.pending',JSON.stringify({digest:frozen.digest,...value},null,2)+'\n');renameSync(path+'.pending',path)}
export function summarize(name,report) {
  assert.equal(report.digest,frozen.digest)
  assert.deepEqual(report.cases.map(r=>r.id).sort(),cases.map(r=>r.id).sort(),'Missing or duplicate case IDs')
  const total={name,correct:0,predicted:0,rawCandidates:0,otherCandidates:0,expected:0,detected:0,elapsedMs:0,calls:0,inputTokens:0,outputTokens:0,errors:0,negativeCases:0,negativeFalseAlarmCases:0,negativeAttentionCases:0,inputMismatches:0,groups:{}}
  for(const result of report.cases) {
    const row=cases.find(row=>row.id===result.id),grade=score(row,result.events);result.grade=grade
    if(name==='product'){
      const expectedInput=createHash('sha256').update(JSON.stringify(livingModelInput(row.emails.map(mail=>({...mail,subject:row.subject}))))).digest('hex')
      result.inputMatchesPipeline=result.inputDigest===expectedInput
      if(!result.inputMatchesPipeline)total.inputMismatches++
    }
    for(const key of ['correct','predicted','expected','detected'])total[key]+=grade[key]
    for(const key of ['elapsedMs','calls','inputTokens','outputTokens'])total[key]+=result[key]??0
    if(result.error)total.errors++
    const rawCount=result.analysis?.events?.length??result.raw?.length??result.events.length
    total.rawCandidates+=rawCount;total.otherCandidates+=Math.max(0,rawCount-result.events.length)
    if(!grade.expected){total.negativeCases++;if(grade.predicted)total.negativeFalseAlarmCases++;if(rawCount)total.negativeAttentionCases++}
    const group=total.groups[row.group]??={correct:0,predicted:0,expected:0}
    for(const key of ['correct','predicted','expected'])group[key]+=grade[key]
  }
  const latencies=report.cases.map(row=>row.elapsedMs??0).sort((a,b)=>a-b)
  return {...total,p50Ms:latencies[Math.ceil(latencies.length*.5)-1],p95Ms:latencies[Math.ceil(latencies.length*.95)-1],
    precision:total.predicted?total.correct/total.predicted:null,recall:total.correct/total.expected,
    detectionRecall:total.detected/total.expected,wrong:total.predicted-total.correct,missing:total.expected-total.correct,
    estimatedReview:{approve:total.correct,discard:total.predicted-total.correct,createOrRepair:total.expected-total.correct,
      otherCandidatesToInspect:total.otherCandidates,sourceChecks:total.rawCandidates}}
}
export function compare() {
  const methods=['v1','pipeline','direct','agent','product'].map(name=>{
    const report=JSON.parse(readFileSync(output+'/'+name+'.json')),summary=summarize(name,report);write(name,report);return summary
  })
  write('comparison',{methods,protocol,provenance:frozen.provenance,
    targetMet:methods.find(m=>m.name==='product').errors===0&&methods.find(m=>m.name==='product').precision>=protocol.precisionTarget&&methods.find(m=>m.name==='product').recall>=protocol.recallTarget,
    limitations:'Synthetic labels authored by the same assistant. Strict source/task-anchor fields scored, not independent semantic title or entailment review. Simulated review counts are not human timing. API and CLI timings have different boundaries; report separately.'})
  for(const method of methods)console.log(method.name,JSON.stringify({...method,groups:undefined}))
}
