import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { studyBundle } from './study-cases.mjs'

export function studyProtocol({reverse=false,automation=false}) {
  const due = new Date(Date.now()+6*86_400_000).toISOString().slice(0,10)
  const inbox = reverse ? 'B' : 'A'
  const comparison = reverse ? 'A' : 'B'
  const productCases = studyBundle(inbox,due)
  const manualCases = studyBundle(comparison,due)
  const tasks = reverse
    ? [...productCases.map(item=>({mode:'inbox',bundle:inbox,item})),...manualCases.map(item=>({mode:'manual',bundle:comparison,item}))]
    : [...manualCases.map(item=>({mode:'manual',bundle:comparison,item})),...productCases.map(item=>({mode:'inbox',bundle:inbox,item}))]
  return {productCases,tasks,automation,due}
}

export function startStudy(protocol,seed,{version,output,restartNext}) {
  const {tasks,automation} = protocol
  const report = {
    schema:1, id:randomUUID(), version:version.fingerprint,
    input:'synthetic', session:automation?'chrome-automation':'participant-session',
    startedAt:new Date().toISOString(), completed:false,
    sequence:tasks.map(({bundle,mode,item})=>({bundle,mode,po:item.po})), rows:[],
  }
  const file = output+'/session-'+report.id+'.json'
  const sources = new Map()
  const handoffs = new Map()
  let revision = 0
  let checkpoint = null

  function save() {
    writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600})
    renameSync(file+'.tmp',file)
  }
  function activeMs(row) {
    return row.activeMs+(checkpoint===null?0:Math.round(performance.now()-checkpoint))
  }
  function pause(row) {
    row.activeMs=activeMs(row)
    checkpoint=null
  }
  function resume() {
    checkpoint=performance.now()
  }
  function current() {
    const row=report.rows.at(-1)
    return row&&!row.outcome?row:null
  }
  function roleLinks(row) {
    return {
      buyer:seed.app+'/inbox',
      reviewer:seed.app+'/commitments/handoffs?id='+(handoffs.get(row.po)??seed.studySetups.get(row.po).handoffId),
    }
  }
  async function productState(item) {
    return seed.caseState(seed.studySetups.get(item.po))
  }
  async function deliver(item,message) {
    const emailId=await seed.deliver(message.id,'mua-hang',item.supplier,message.age,message.subject,
      'Xin kiểm tra các chứng từ đính kèm trước khi duyệt.',message.parts.map(part=>({
        filename:part.name,contentType:'text/csv',data:Buffer.from(part.contents).toString('base64'),
      })),item.po)
    const {attachments}=await seed.request('/api/emails/'+emailId+'/attachments')
    assert.equal(attachments.length,message.parts.length)
    message.parts.forEach((part,index)=>{
      assert.equal(attachments[index].filename,part.name)
      assert.equal(attachments[index].sync_part_key,String(index+1))
      sources.set(part.id,{emailId,attachmentId:attachments[index].id})
    })
  }
  function authorizedResult({evidence,payment}) {
    if (evidence.stage!=='closed' || !payment.decisionId) return null
    const {invoice}=payment
    const part=[...sources].find(([,source])=>
      source.emailId===invoice.evidence.emailId && source.attachmentId===invoice.evidence.attachmentId)?.[0]??null
    return {number:invoice.number,due:invoice.lines[0]?.paymentDue??null,part,
      decision:payment.decisionId,emailId:invoice.evidence.emailId,attachmentId:invoice.evidence.attachmentId}
  }
  function view() {
    const row=current(), task=tasks[row?row.index:report.rows.length]
    return {
      revision, session:report.session, initialOrder:report.sequence, ready:!!task&&!row, completed:report.completed,
      progress:report.rows.filter(item=>item.outcome).length,
      report:report.completed?report:null,
      task:task?{mode:task.mode,po:task.item.po,original:task.item.original,supplier:task.item.supplier}:null,
      active:row?{index:row.index,running:checkpoint!==null,activeMs:activeMs(row),counts:row.counts,
        latePending:!!task.item.late&&!row.lateReleased,lateReleased:row.lateReleased,
        ...(row.mode==='manual'
          ? {messages:[...task.item.messages,...(row.lateReleased?[task.item.late]:[])]}
          : {links:roleLinks(row)}),
      }:null,
    }
  }
  async function refresh() {
    const row=current()
    if(row?.mode==='inbox') {
      const product=await productState(tasks[row.index].item)
      handoffs.set(row.po,product.handoff)
    }
    return view()
  }
  async function event(data) {
    assert.equal(data?.revision,revision,'Trạng thái đã đổi. Kiểm tra kết quả trước khi thao tác lại.')
    const row=current(), task=tasks[row?row.index:report.rows.length]
    const previous={rows:structuredClone(report.rows),completed:report.completed,checkpoint}
    const {action}=data
    if (action==='start') {
      assert.ok(task&&!row,'Hồ sơ đang chạy hoặc phiên đã kết thúc.')
      if(task.mode==='inbox') for(const message of task.item.messages) await deliver(task.item,message)
      report.rows.push({index:report.rows.length,mode:task.mode,bundle:task.bundle,po:task.item.po,
        activeMs:0,lateReleased:false,counts:{source:0,help:0,revision:0}})
      resume()
    } else {
      assert.ok(row && data.index===row.index,'Hồ sơ này đã thay đổi. Tải lại trước khi thao tác.')
      if (action==='pause') pause(row)
      else if (action==='resume') {
        if(checkpoint===null) resume()
      } else if (action==='restart') {
        assert.equal(row.mode,'inbox','Khởi động lại chỉ áp dụng khi dùng InboxAI.')
        await restartNext()
      } else if (action==='release') {
        assert.ok(task.item.late&&!row.lateReleased,'Không có thư mới để nạp.')
        if (row.mode==='inbox') {
          const product=await productState(task.item)
          assert.equal(product.evidence.stage,'reviewer','Nạp thư sau khi Mua hàng đã bàn giao.')
          assert.equal(product.payment.invoice.number,task.item.candidate,'Cần bàn giao bản hóa đơn đầu tiên.')
          await deliver(task.item,task.item.late)
        }
        row.lateReleased=true
      } else if (Object.hasOwn(row.counts,action)) {
        assert.ok(checkpoint!==null,'Tiếp tục đo trước khi ghi thao tác.')
        row.counts[action]++
      } else if (action==='finish' || action==='abandon') {
        if(action==='finish' && task.item.late) assert.ok(row.lateReleased,'Cần nạp thư mới trước khi ghi kết quả.')
        const result=row.mode==='inbox'
          ? authorizedResult(await productState(task.item))
          : action==='finish'?{number:String(data.number??'').trim(),due:data.due,part:data.part}:null
        if(action==='finish') {
          assert.ok(result,'Chưa có phê duyệt mới trong hồ sơ.')
          if(row.mode==='manual') {
            assert.ok(result.number && result.due && result.part,'Nhập đủ mã hóa đơn, hạn và chứng từ.')
            const visible=[...task.item.messages,...(row.lateReleased?[task.item.late]:[])].flatMap(message=>message.parts)
            assert.ok(visible.some(part=>part.id===result.part),'Chọn tệp từ hồ sơ đang mở.')
            assert.match(result.due,/^\d{4}-\d{2}-\d{2}$/,'Nhập ngày trên hóa đơn.')
          }
        }
        pause(row)
        const expected=task.item.expected
        const correct=!!result&&result.number===expected.number&&result.due===expected.due&&result.part===expected.part
        row.outcome={action,correct,wrongApproval:!!result&&!correct,expected,result}
        report.completed=report.rows.length===tasks.length
      } else throw new Error('Thao tác không hợp lệ.')
    }
    try {
      save()
    } catch(error) {
      report.rows=previous.rows
      report.completed=previous.completed
      checkpoint=previous.checkpoint
      throw error
    }
    revision++
    return view()
  }
  save()
  return {refresh,event}
}
