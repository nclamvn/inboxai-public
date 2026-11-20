import assert from 'node:assert/strict'
import { differences, fields } from './corpus.mjs'

const counterNames=['source','help','revision']
const median=values=>{
  const sorted=[...values].sort((a,b)=>a-b)
  const i=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2
}
function protocol(order,bundles) {
  const productFirst=order==='product-first'
  const manual=productFirst?'A':'B', inbox=productFirst?'B':'A'
  const describe=(group,mode)=>bundles[group].map(({po,kind})=>({po,kind,bundle:group,mode}))
  return productFirst?[...describe(inbox,'inbox'),...describe(manual,'manual')]:[...describe(manual,'manual'),...describe(inbox,'inbox')]
}
export function evaluateParticipants(reports,{corpusId,bundles,labels}) {
  assert.equal(reports.length,2,'Cần hai báo cáo nhóm tham gia.')
  assert.deepEqual(reports.map(report=>report.order).sort(),['manual-first','product-first'],'Cần hai thứ tự đối chứng.')
  assert.equal(new Set(reports.map(report=>report.id)).size,2,'Hai phiên phải có ID riêng.')
  assert.equal(new Set(reports.map(report=>report.team?.code)).size,2,'Hai nhóm phải có mã riêng.')
  assert.equal(new Set(reports.map(report=>report.version)).size,1,'Hai nhóm cần cùng phiên bản ứng dụng.')
  const scores=reports.map(report=>{
    assert.equal(report.corpusId,corpusId,'Sai bộ hồ sơ.')
    assert.equal(report.session,'participant-session','Lượt tự động không được chấm như phiên người tham gia.')
    assert.equal(report.input,'synthetic')
    assert.equal(report.schema,2,'Phiên bản báo cáo chưa được hỗ trợ.')
    assert.ok(typeof report.version==='string'&&report.version,'Thiếu mã phiên bản.')
    assert.equal(report.completed,true)
    assert.ok(/^[A-Z0-9-]{2,20}$/.test(report.team?.code??'')&&report.team?.tools?.trim(),'Cần mã nhóm và công cụ đối chứng.')
    assert.ok(['yes','no','unsure'].includes(report.feedback?.willing),'Cần phản hồi cuối phiên.')
    const expected=protocol(report.order,bundles)
    assert.equal(report.rows.length,expected.length)
    const cases=report.rows.map((row,index)=>{
      const item=expected[index]
      assert.deepEqual([row.po,row.kind,row.bundle,row.mode], [item.po,item.kind,item.bundle,item.mode])
      assert.ok(Number.isSafeInteger(row.activeMs)&&row.activeMs>=0,'Thời gian không hợp lệ.')
      assert.ok(counterNames.every(key=>Number.isSafeInteger(row.counts?.[key])&&row.counts[key]>=0),'Bộ đếm không hợp lệ.')
      const {action,result}=row.outcome
      if(action==='finish') assert.equal(result?.decision,'approve')
      else if(action==='hold') {
        assert.equal(result?.decision,'hold')
        assert.ok(fields.slice(1).every(key=>result[key]===null))
      } else assert.equal(action,'abandon')
      if(row.mode==='inbox'&&result?.decision==='approve') {
        assert.ok(result.decisionId&&result.emailId&&result.attachmentId,'Thiếu khóa kết quả InboxAI.')
      }
      const matches=!!result&&differences(labels[row.po],result).length===0
      return {...item,activeMs:row.activeMs,counts:row.counts,action,correct:action!=='abandon'&&matches,
        wrongApproval:result?.decision==='approve'&&!matches}
    })
    return {group:report.team.code,tools:report.team.tools,willing:report.feedback.willing,cases}
  })
  const stats=Object.fromEntries(['manual','inbox'].map(mode=>{
    const rows=scores.flatMap(group=>group.cases).filter(row=>row.mode===mode)
    const completed=rows.filter(row=>row.action!=='abandon')
    return [mode,{
      cases:rows.length,correct:rows.filter(row=>row.correct).length,wrongApprovals:rows.filter(row=>row.wrongApproval).length,
      abandoned:rows.length-completed.length,medianActiveMs:completed.length?median(completed.map(row=>row.activeMs)):null,
      counts:Object.fromEntries(counterNames.map(key=>[key,rows.reduce((n,row)=>n+row.counts[key],0)])),
    }]
  }))
  const safety=stats.inbox.wrongApprovals===0&&stats.inbox.correct===stats.inbox.cases
  const timingsValid=[stats.manual,stats.inbox].every(method=>method.correct===method.cases&&method.medianActiveMs>0)
  const savedRatio=timingsValid?(stats.manual.medianActiveMs-stats.inbox.medianActiveMs)/stats.manual.medianActiveMs:null
  const willing=scores.filter(group=>group.willing==='yes').length
  return {provenance:'Participant exports submitted by facilitator; synthetic documents; not market validation',
    groups:scores,stats,savedRatio,willing,gate:{safety,timing:savedRatio!==null&&savedRatio>=0.25,willing:willing===2,
      go:safety&&savedRatio!==null&&savedRatio>=0.25&&willing===2}}
}
