import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const endpoint = '/api/commitments/batches'
const dues = '/api/commitments/dues'
const handoffs = '/api/commitments/handoffs'
const payment = '/api/commitments/payment'
const settlement = '/api/commitments/settlements'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const key = () => ({ 'Idempotency-Key':randomUUID() })
const detailPath = id => '/commitments/batches?id='+id
const other = 'INV-8703'
const base = 'INV-8713'
const corrected = 'INV-8714'

export async function rehearsePurchaseBatch({ app,buyer,accountant,approver,buyerMail,request,supplier,invoice,bank,capture,record,approverId,reviewerEmail,preparerId }) {
  const newDate = new Date(Date.now()+9*86_400_000).toISOString().slice(0,10)
  const paidToday = new Date(Date.now()+7*3_600_000).toISOString().slice(0,10)
  async function get(actor,path,status=200) {
    const response = await actor.request.get(app+path)
    assert.equal(response.status(),status,await response.text())
    return response.json()
  }
  async function write(actor,command,status=200) {
    const response = await actor.request.post(app+endpoint,{data:command,headers:key()})
    assert.equal(response.status(),status,await response.text())
    return response.json()
  }
  const detail = (id,actor=accountant,status=200) => get(actor,endpoint+'?id='+id,status)
  async function openProposal(numbers) {
    await accountant.goto(app+'/commitments/dues')
    const items = (await get(accountant,dues)).items
    const ids = numbers.map(number=>items.find(item=>item.invoice===number).id)
    for (const number of numbers) await accountant.getByRole('checkbox',{name:'Chọn '+number+' vào đợt',exact:true}).check()
    await accountant.getByRole('link',{name:'Lập đợt thanh toán',exact:true}).click()
    await accountant.getByRole('heading',{name:'Xem trước đợt thanh toán',exact:true}).waitFor()
    const proposal = await get(accountant,endpoint+'?'+new URLSearchParams(ids.map(id=>['selected',id])))
    assert.deepEqual(proposal.approvers.map(item=>item.id),[approverId])
    assert.deepEqual(proposal.lines.map(item=>item.invoice).sort(),numbers.toSorted())
    return { action:'submit',approverId,lines:proposal.lines.map(({handoffId,proof})=>({handoffId,proof})) }
  }

  async function registerProposal() {
    await accountant.getByRole('combobox',{name:'Người duyệt đợt',exact:true}).selectOption(approverId)
    const pending = accountant.waitForResponse(response=>response.url()===app+endpoint && response.request().method()==='POST')
    await button(accountant,'Gửi đề nghị duyệt').click()
    const response = await pending
    assert.equal(response.status(),200,await response.text())
    const {id} = await response.json()
    await accountant.waitForURL('**'+detailPath(id))
    await accountant.getByText('Chờ duyệt',{exact:true}).waitFor()
    return id
  }

  const proposal = await openProposal([base,other])
  await write(accountant,{...proposal,approverId:preparerId},403)
  await write(buyer,proposal,404)
  const first = await registerProposal()
  assert.equal((await detail(first)).stage,'pending')
  await write(accountant,{action:'approve',id:first},403)
  await write(buyer,{action:'approve',id:first},404)
  await detail(first,buyer,404)
  const [firstLine] = (await detail(first)).lines
  const attachmentUrl = endpoint+'?'+new URLSearchParams({id:first,file:firstLine.handoffId})
  assert.equal((await buyer.request.get(app+attachmentUrl)).status(),404)
  assert.equal((await approver.request.get(app+attachmentUrl)).status(),200)
  await approver.goto(app+detailPath(first))
  await button(approver,'Duyệt đợt thanh toán').waitFor()

  const bankCsv = (number,ref,transfer,amount,paidOn) => ['po,invoice,transfer,paid_on,amount,currency',
    [ref,number,transfer,paidOn,amount,'VND'].join(','),''].join('\n')
  async function openBank(number,ref,transfer,amount,paidOn=paidToday) {
    const filename = transfer.toLowerCase()+'.csv'
    const mail = await bank.deliver(transfer.toLowerCase(),filename,bankCsv(number,ref,transfer,amount,paidOn),ref,new Date().toISOString())
    return {mail, query:await bank.openEvidence(mail,filename)}
  }

  const held = await openBank(base,'PO-9422','BANK-BATCH-HELD',10000)
  assert.equal((await bank.getPreview(held.query,409)).error,'Khoản này đang chờ duyệt đợt thanh toán.')
  const reservedPreview = await get(accountant,endpoint+'?selected='+firstLine.handoffId,409)
  assert.match(reservedPreview.error,/một đợt thanh toán khác/)
  record('A pending proposal reserves each installment, scopes exact invoice downloads to maker and appointed approver, holds receipts, and rejects self-approval or conflicting batches.',true)

  const format = invoice+',payment_due'
  const bytes = [format,['PO-9422',corrected,base,'B',30,'bộ',2000,'VND',newDate].join(','),''].join('\n')
  const file = 'dinh-chinh-khi-cho-duyet.csv'
  const evidence = await buyerMail('batch-correction-new','mua-hang',supplier,0.25,'Đính chính khi chờ duyệt',
    'Nhà cung cấp xác nhận hạn thanh toán mới.',[{filename:file,contentType:'text/csv',data:Buffer.from(bytes).toString('base64')}],'PO-9422')
  await buyer.goto(app+'/inbox?email='+evidence)
  await buyer.getByRole('link',{name:'Bảng giá hoặc hóa đơn · '+file,exact:true}).click()
  await button(buyer,'Ghi nhận hóa đơn').click()
  await buyer.getByRole('link',{name:'Mở hồ sơ đối soát',exact:true}).click()
  await buyer.getByLabel('Email tài khoản Kế toán',{exact:true}).fill(reviewerEmail)
  await button(buyer,'Bàn giao hồ sơ').click()
  await buyer.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const ownerScope = new URL(buyer.url()).search
  const snapshot = await request(payment+ownerScope)
  const assigned = await request(handoffs+'?'+new URLSearchParams({commitment:snapshot.id,invoice:snapshot.invoice.id}))
  await accountant.goto(app+'/commitments/handoffs?id='+assigned.pending.id)
  await button(accountant,'Duyệt đủ căn cứ thanh toán').click()
  await accountant.getByRole('status').filter({hasText:'Đã duyệt hồ sơ.'}).waitFor()
  await write(approver,{action:'approve',id:first},409)
  await approver.reload()
  await approver.getByText('Cần lập lại đề nghị',{exact:true}).waitFor()
  assert.equal(await button(approver,'Duyệt đợt thanh toán').count(),0)
  await accountant.goto(app+detailPath(first))
  await button(accountant,'Hủy đợt').click()
  await button(accountant,'Xác nhận hủy đợt').click()
  await accountant.getByText('Đã hủy',{exact:true}).waitFor()
  assert.deepEqual((await detail(first)).events.map(event=>event.action),['submit','cancel'])
  record('A new supplier invoice arriving during approval invalidates the frozen proposal even at the same amount. Cancelling releases the installment and preserves the old proposal history.',true)

  await openProposal([corrected,other])
  const id = await registerProposal()
  await approver.setViewportSize({width:390,height:844})
  await approver.goto(app+detailPath(id))
  await approver.getByText(corrected+' · PO-9422',{exact:true}).waitFor()
  await capture('17-duyet-dot-thanh-toan-mobile',approver)
  const attempts = []
  await approver.route('**'+endpoint,async route=>{
    if (route.request().method()!=='POST') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({requestKey:route.request().headers()['idempotency-key'],status:response.status(),body:await response.json()})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await button(approver,'Duyệt đợt thanh toán').click()
  await button(approver,'Thử lại cùng yêu cầu').click()
  await approver.getByRole('status').filter({hasText:'Đã duyệt đợt thanh toán.'}).waitFor()
  await approver.unroute('**'+endpoint)
  assert.deepEqual(attempts.map(({status,body})=>[status,body.id,body.replayed]),[[200,id,false],[200,id,true]])
  assert.equal(attempts[0].requestKey,attempts[1].requestKey)
  assert.deepEqual((await detail(id)).lines.map(line=>line.paid),[0,0])
  assert.deepEqual((await detail(id)).events.map(event=>event.action),['submit','approve'])
  const historical = await openBank(corrected,'PO-9422','BANK-BATCH-OLD',10000,bank.transferDate)
  assert.match((await bank.getPreview(historical.query,409)).error,/trước ngày duyệt đợt/)
  record('Approval replays one receipt and leaves both payment balances unchanged. An older transfer arriving later is not assigned to the new batch.',true)

  async function reconcile(number,ref,transfer,amount,drop=false) {
    const {mail,query} = await openBank(number,ref,transfer,amount)
    assert.equal((await bank.getPreview(query)).command.batchId,id)
    await accountant.getByRole('link',{name:'Mở đợt thanh toán đã duyệt',exact:true}).waitFor()
    const writes = []
    if (drop) await accountant.route('**'+settlement,async route=>{
      if (route.request().method()!=='POST') return route.continue()
      const response = await route.fetch({maxRetries:0})
      writes.push({status:response.status(),body:await response.json()})
      if (writes.length===1 && response.ok()) return route.abort()
      return route.fulfill({response})
    })
    await button(accountant,'Xác nhận ghi thanh toán').click()
    if (drop) await button(accountant,'Thử lại cùng yêu cầu').click()
    await accountant.getByRole('status').filter({hasText:'Đã ghi chứng từ thanh toán.'}).waitFor()
    if (drop) {
      await accountant.unroute('**'+settlement)
      assert.deepEqual(writes.map(({status,body})=>[status,body.replayed]),[[200,false],[200,true]])
      assert.equal(writes[0].body.id,writes[1].body.id)
    }
    return mail
  }

  const firstMail = await reconcile(corrected,'PO-9422','BANK-BATCH-01',25000,true)
  await accountant.getByRole('link',{name:'Mở đợt thanh toán đã duyệt',exact:true}).click()
  await accountant.getByRole('link',{name:'BANK-BATCH-01',exact:true}).waitFor()
  let state = await detail(id)
  assert.equal(state.stage,'approved')
  assert.deepEqual(state.lines.find(line=>line.invoice===corrected).entries.map(item=>[item.amount,item.emailId]),[[25000,firstMail]])
  assert.equal(state.lines.find(line=>line.invoice===other).paid,0)
  await capture('18-doi-chieu-mot-phan',accountant)
  await reconcile(other,'PO-9423','BANK-BATCH-02',60000)
  state = await detail(id)
  assert.equal(state.stage,'approved')
  assert.equal(state.lines.find(line=>line.invoice===other).paid,60000)
  await reconcile(corrected,'PO-9422','BANK-BATCH-03',35000)
  await accountant.getByRole('link',{name:'Mở đợt thanh toán đã duyệt',exact:true}).click()
  await accountant.getByText('Đã đối chiếu đủ',{exact:true}).waitFor()
  await accountant.reload()
  await accountant.getByText('Đã đối chiếu đủ',{exact:true}).waitFor()
  state = await detail(id)
  assert.deepEqual(state.lines.map(line=>[line.paid,line.amount]),[[60000,60000],[60000,60000]])
  assert.deepEqual(state.events.map(event=>event.action),['submit','approve','close'])
  assert.equal(state.lines.flatMap(line=>line.entries).length,3)
  assert.ok((await detail(id,approver)).lines.flatMap(line=>line.entries).every(entry=>entry.emailId===null))
  await capture('19-dot-thanh-toan-da-khep',accountant)
  await accountant.getByRole('link',{name:'BANK-BATCH-01',exact:true}).click()
  await accountant.waitForURL('**/inbox?email='+firstMail)
  await accountant.getByRole('link',{name:'Đối soát thanh toán · bank-batch-01.csv',exact:true}).waitFor()
  record('Three Gmail receipts reconcile two invoices atomically, including a replayed partial receipt. The batch closes once only after all 120000 VND is covered and reopens the correct owned source email.',true)
}
