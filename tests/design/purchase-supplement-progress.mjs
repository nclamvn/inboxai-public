import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prepareSupplementalHandoff } from './purchase-approval-freshness.mjs'

const endpoint = '/api/commitments/supplements'
const handoffs = '/api/commitments/handoffs'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const link = (page,name) => page.getByRole('link',{name,exact:true})
const status = (page,text) => page.getByRole('status').filter({hasText:text}).waitFor()

export async function rehearseSupplementProgress(options) {
  const {app,page,reviewer,outsider,accounts,request,capture,record,restartNext} = options
  const po = 'PO-9984', original = 'INV-9084', current = 'INV-9184', replacement = 'INV-9284'
  const supplier = 'yen@linh-kien.example.test'
  const due = new Date(Date.now()+7*86_400_000).toISOString().slice(0,10)
  const handoff = await prepareSupplementalHandoff(options,{po,original,current,supplier,due})
  const invoiceId = (await handoff.scope()).invoice.id
  const caseId = handoff.initial.handoffId
  const mailbox = accounts['mua-hang']
  const outer = page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).getByRole('listitem')
    .filter({has:page.getByRole('heading',{name:/^PO-9984 ·/})})
  const panel = outer.getByRole('region',{name:'Chứng từ bổ sung từ email'})
  const progress = (checked,total) => panel.getByText('Đã rà '+checked+'/'+total+' tệp',{exact:true}).waitFor()
  const asFile = csv => ({filename:'dinh-chinh.csv',contentType:'text/csv',data:Buffer.from(csv).toString('base64')})
  const groups = Array.from({length:4},(_,index)=>({
    id:po+'-group-'+index, subject:'['+po+'] Hồ sơ bổ sung đợt '+index,
    body:'Kiểm tra đúng phần đính kèm.', from:supplier,
    at:new Date(Date.now()-(0.2+index*0.4)*86_400_000).toISOString(),
    attachments:Array.from({length:6},()=>asFile(handoff.bytes)),
  }))
  groups[1].attachments[1] = asFile(handoff.csv(current,'INV-9384',due,'PO-9990'))
  const good = handoff.csv(current,replacement,due)
  groups[2].attachments[3] = asFile(good)
  mailbox.deliver(groups)
  await request('/api/source-accounts/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{"refresh":true}'})

  async function approveOld(expectedError) {
    const response = await reviewer.request.post(app+handoffs,{
      data:{action:'approve',handoffId:handoff.target},headers:{'Idempotency-Key':randomUUID()},
    })
    assert.equal(response.status(),409,await response.text())
    assert.match((await response.json()).error,expectedError)
    assert.equal((await handoff.scope()).decisionId,null)
  }
  const list = async () => (await request(endpoint+'?case='+caseId))[0]
  const reads = () => mailbox.box.attachmentReads.filter(read=>read.startsWith(po+'-group-'))
  async function advance(from,to,total) {
    await button(panel,from?'Rà tiếp chứng từ':'Rà soát chứng từ').click()
    await progress(to,total)
  }

  await page.goto(app+'/inbox')
  await progress(0,24)
  assert.deepEqual(reads(),[])
  await approveOld(/Chưa kiểm tra hết/)
  for (const actor of [reviewer,outsider]) {
    const denied = await actor.request.post(app+endpoint,{data:{caseId,invoiceId}})
    assert.equal(denied.status(),404)
    const hidden = await actor.request.get(app+endpoint+'?case='+caseId)
    assert.deepEqual(await hidden.json(),[])
  }

  // Deliver the POST to the application, then cut the browser's response.
  const pattern = '**'+endpoint
  const lost = Promise.withResolvers()
  let deadline
  await page.route(pattern,async route=>{
    if (route.request().method()!=='POST') return route.continue()
    try {
      const response = await route.fetch({maxRetries:0})
      assert.equal(response.status(),200,await response.text())
      const result = await response.json()
      await route.abort('internetdisconnected')
      lost.resolve(result)
    } catch (error) {
      lost.reject(error)
      await route.abort().catch(()=>{})
    }
  })
  try {
    await button(panel,'Rà soát chứng từ').click()
    const first = await Promise.race([lost.promise,new Promise((_,reject)=>{
      deadline = setTimeout(()=>reject(new Error('The first review POST did not finish')),20_000)
    })])
    assert.deepEqual([first.progress.checked,first.progress.total],[6,24])
    await panel.getByRole('alert').getByText(/Mất kết nối|Chưa thể rà soát/).waitFor()
  } finally {
    clearTimeout(deadline)
    await page.unroute(pattern)
  }
  assert.equal(reads().length,6)
  try {
    await page.context().setOffline(true)
    await restartNext()
  } finally {
    await page.context().setOffline(false)
  }
  await page.reload()
  await progress(6,24)
  assert.equal(reads().length,6)
  await capture(po+'-tiep-tuc-sau-khoi-dong-lai',page)
  mailbox.box.online = false
  try {
    await button(panel,'Rà tiếp chứng từ').click()
    await panel.getByRole('alert').getByText('Chưa đọc được tệp đang chờ. Tiến độ đã lưu vẫn được giữ.',{exact:true}).waitFor()
    await progress(6,24)
    assert.equal(reads().length,6)
  } finally {
    mailbox.box.online = true
  }
  record('A dropped browser response and a Next process restart preserve six of 24 reviewed Gmail parts without re-reading them.',true)

  // Re-sync one part with a different MIME size. The other five checked parts still count.
  groups[0].attachments[0] = asFile('reference,comment\nPO-9984,Thông tin bổ sung cho thủ kho\n')
  mailbox.deliver([groups[0]])
  await request('/api/source-accounts/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{"refresh":true}'})
  await page.reload()
  await progress(5,24)
  await advance(5,11,24)
  const changed = reads().slice(6)
  assert.equal(changed.length,6)
  assert.deepEqual(changed.filter(read=>read.startsWith(groups[0].id+'/')),[groups[0].id+'/part-1'])
  assert.equal((await list()).matches.length,0)
  await advance(11,17,24)
  await advance(17,23,24)
  await link(panel,'Xem trước '+replacement).waitFor()
  await approveOld(/Có chứng từ đính chính mới/)
  await advance(23,24,24)
  const [match] = (await list()).matches
  assert.equal(match.invoice,replacement)
  assert.equal(match.replaces,current)
  assert.equal(reads().length,25)
  record('Each page reads only unchecked or changed parts. A correction beyond the first six blocks the original before the buyer registers it.',true)

  await link(panel,'Xem trước chứng từ mới').click()
  await page.waitForURL(url=>url.pathname==='/commitments/payment' && url.searchParams.get('file')===match.fileId)
  await button(page,'Ghi nhận hóa đơn').click()
  await status(page,'Đã ghi nhận chứng từ.')
  await link(page,'Mở hồ sơ đối soát').click()
  const approvedHandoff = await handoff.handover()
  await reviewer.reload()
  await reviewer.getByText('Đã có lần bàn giao mới',{exact:true}).waitFor()
  assert.equal(await button(reviewer,'Duyệt bản bổ sung').count(),0)
  await page.goto(app+'/inbox')
  await progress(0,12)
  const oldProgress = await page.request.post(app+endpoint,{data:{caseId,invoiceId}})
  assert.equal(oldProgress.status(),409)
  await advance(0,6,12)
  await advance(6,12,12)
  assert.equal((await list()).matches.length,0)
  const readCount = reads().length
  await reviewer.goto(app+'/commitments/handoffs?id='+approvedHandoff)
  await button(reviewer,'Duyệt bản bổ sung').click()
  await status(reviewer,'Đã duyệt hồ sơ.')
  // The handoff reads B's delegated source once. Already reviewed unrelated parts need no provider read.
  assert.deepEqual(reads().slice(readCount),[groups[2].id+'/part-4'])
  await reviewer.reload()
  await reviewer.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
  const persisted = await handoff.scope()
  assert.ok(persisted.decisionId)
  assert.deepEqual([persisted.invoice.number,persisted.invoice.evidence.emailId,persisted.invoice.evidence.attachmentId],
    [replacement,match.emailId,match.fileId])
  const result = await reviewer.request.get(app+handoffs+'?id='+approvedHandoff)
  const detail = await result.json()
  assert.deepEqual(detail.exception.events.filter(event=>event.action==='approve').map(event=>event.invoice),[replacement])
  await capture(po+'-duyet-sau-ra-soat',reviewer)
  record('Progress is tied to the handed-off invoice. After the remaining unrelated files are checked, the replacement is approved exactly once with exact source evidence.',true)
}
