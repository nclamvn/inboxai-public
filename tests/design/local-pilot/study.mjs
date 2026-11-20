import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { studyBundle } from './study-cases.mjs'
import * as frozen from '../../eval/purchase-value/corpus.mjs'

export function studyProtocol({reverse=false,automation=false,value=false}) {
  const due = value ? frozen.due : new Date(Date.now()+6*86_400_000).toISOString().slice(0,10)
  const inbox = reverse ? 'B' : 'A'
  const comparison = reverse ? 'A' : 'B'
  const labels = value ? frozen.loadLabels() : {}
  const bundle = group => value
    ? frozen.bundles[group].map(item=>({...item,expected:labels[item.po]}))
    : studyBundle(group,due)
  const productCases = bundle(inbox)
  const manualCases = bundle(comparison)
  const productTasks=productCases.map(item=>({mode:'inbox',bundle:inbox,item}))
  const manualTasks=manualCases.map(item=>({mode:'manual',bundle:comparison,item}))
  const tasks = reverse ? [...productTasks,...manualTasks] : [...manualTasks,...productTasks]
  return {productCases,tasks,automation,due,value,reverse,...(value&&{corpusId:frozen.corpusId})}
}

export function startStudy(protocol,seed,{version,output,restartNext}) {
  const {tasks,automation,value,reverse,corpusId} = protocol
  const report = {
    schema:value?2:1, id:randomUUID(), version:version.fingerprint,
    input:'synthetic', session:automation?'chrome-automation':'participant-session',
    startedAt:new Date().toISOString(), completed:false,
    ...(value&&{corpusId,order:reverse?'product-first':'manual-first',team:null,feedback:null}),
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
    const emailId=await seed.deliver(message.id,'mua-hang',message.from??item.supplier,message.age,message.subject,
      message.body??'Xin kiểm tra các chứng từ đính kèm trước khi duyệt.',message.parts.map(part=>({
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
  function invoiceSelection(invoice) {
    const part=[...sources].find(([,source])=>
      source.emailId===invoice.evidence.emailId && source.attachmentId===invoice.evidence.attachmentId)?.[0]??null
    return {decision:'approve',source:part?.split('#')[0]??null,number:invoice.number,due:invoice.lines[0]?.paymentDue??null,part,
      emailId:invoice.evidence.emailId,attachmentId:invoice.evidence.attachmentId}
  }
  function authorizedResult({evidence,payment}) {
    if (evidence.stage!=='closed' || !payment.decisionId) return null
    return {...invoiceSelection(payment.invoice),decisionId:payment.decisionId}
  }
  function manualDecision(item,includeLate,data) {
    const visible=[...item.messages,...(includeLate?[item.late]:[])]
    const source=visible.find(message=>message.parts.some(part=>part.id===data.part))
    assert.ok(source,'Chọn tệp từ hồ sơ đang mở.')
    assert.ok(typeof data.number==='string'&&data.number.trim()&&data.number.length<=32,'Nhập mã hóa đơn.')
    assert.match(data.due,/^\d{4}-\d{2}-\d{2}$/,'Nhập ngày trên hóa đơn.')
    return {decision:'approve',source:source.id,number:data.number.trim(),due:data.due,part:data.part}
  }
  function view() {
    const row=current(), task=tasks[row?row.index:report.rows.length]
    return {
      revision, value, team:report.team, session:report.session, initialOrder:report.sequence, ready:!!task&&!row, completed:report.completed,
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
    const previous={report:structuredClone(report),checkpoint}
    const {action}=data
    if (action==='enroll') {
      assert.ok(value&&!report.rows.length,'Chỉ nhập thông tin nhóm trước khi bắt đầu.')
      assert.match(data.code??'',/^[A-Z0-9-]{2,20}$/,'Nhập mã nhóm ẩn danh bằng chữ hoa và số.')
      assert.ok(typeof data.tools==='string'&&data.tools.trim()&&data.tools.length<=120,'Nhập công cụ và phiên bản dùng để đối chứng.')
      report.team={code:data.code,tools:data.tools.trim()}
    } else if (action==='feedback') {
      assert.ok(value&&report.completed&&!report.feedback,'Chỉ ghi phản hồi một lần sau khi hoàn tất.')
      assert.ok(['yes','no','unsure'].includes(data.willing),'Chọn mức sẵn lòng dùng thử tiếp.')
      report.feedback={willing:data.willing}
    } else if (action==='start') {
      assert.ok(task&&!row,'Hồ sơ đang chạy hoặc phiên đã kết thúc.')
      assert.ok(!value||report.team,'Nhập thông tin nhóm trước khi bắt đầu đo.')
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
        const preliminaryMs=activeMs(row)
        if (row.mode==='inbox') {
          const product=await productState(task.item)
          assert.equal(product.evidence.stage,'reviewer','Nạp thư sau khi Mua hàng đã bàn giao.')
          assert.equal(product.payment.invoice.number,task.item.candidate,'Cần bàn giao bản hóa đơn đầu tiên.')
          await deliver(task.item,task.item.late)
          if(value) row.provisional=frozen.decisionFields(invoiceSelection(product.payment.invoice))
        } else if(value) row.provisional=manualDecision(task.item,false,data)
        if(value) row.preliminaryMs=preliminaryMs
        row.lateReleased=true
      } else if (Object.hasOwn(row.counts,action)) {
        assert.ok(checkpoint!==null,'Tiếp tục đo trước khi ghi thao tác.')
        row.counts[action]++
      } else if (['finish','hold','abandon'].includes(action)) {
        if(action!=='abandon' && task.item.late) assert.ok(row.lateReleased,'Cần nạp thư mới trước khi ghi kết quả.')
        assert.ok(action!=='hold'||value,'Phiên này chưa có ca giữ chờ.')
        const product=row.mode==='inbox'?await productState(task.item):null
        let result=product?authorizedResult(product):null
        if(action==='finish' && !product) result=manualDecision(task.item,row.lateReleased,data)
        if(action==='finish') assert.ok(result,'Chưa có phê duyệt mới trong hồ sơ.')
        if(action==='hold') {
          assert.ok(!product || (!result && product.evidence.stage==='buyer' && product.payment.invoice.number===task.item.original),
            'Giữ chờ cần hồ sơ còn ở Mua hàng và hóa đơn gốc còn nguyên.')
          result={decision:'hold',source:null,number:null,due:null,part:null}
        }
        pause(row)
        const expected=value?frozen.decisionFields(task.item.expected):{decision:'approve',...task.item.expected}
        const matches=!!result&&(value
          ? frozen.differences(expected,result).length===0
          : ['number','due','part'].every(key=>expected[key]===result[key]))
        const recorded=value||!result?result:{
          number:result.number,due:result.due,part:result.part,
          ...(product&&{decision:result.decisionId,emailId:result.emailId,attachmentId:result.attachmentId}),
        }
        row.outcome={action,correct:action!=='abandon'&&matches,wrongApproval:result?.decision==='approve'&&!matches,
          expected:value?expected:task.item.expected,result:recorded}
        if(value) row.kind=task.item.kind
        report.completed=report.rows.length===tasks.length
      } else throw new Error('Thao tác không hợp lệ.')
    }
    try {
      save()
    } catch(error) {
      Object.assign(report,previous.report)
      checkpoint=previous.checkpoint
      throw error
    }
    revision++
    return view()
  }
  save()
  return {refresh,event}
}
