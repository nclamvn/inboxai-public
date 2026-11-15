import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const endpoint = '/api/commitments/settlements'
const button = (page,name) => page.getByRole('button',{ name,exact:true })
const key = () => ({ 'Idempotency-Key':randomUUID() })

export async function rehearsePurchaseReturn({ app,page,reviewer,outsider,deliver,openEvidence,getPreview,summary,ownerSummary,
  invoiceId,invoiceNumber,handoffId,csv,evidence,date,lastMail,capture,record,googleProvider,runtimeErrors,
  reopenAccountant,board }) {
  const original = 'BANK-78102'
  const header = 'po,invoice,return,original_transfer,returned_on,amount,currency'
  const returned = (reference,transfer,amount) => csv(header,[invoiceNumber,reference,transfer,date,amount,'VND'])
  const action = 'Xác nhận ghi hoàn tiền'
  await reviewer.setViewportSize({width:1024,height:900})

  async function assertBlocked(uid,filename,contents,message) {
    const mail = await deliver(uid,filename,contents)
    await getPreview(await openEvidence(mail,filename),409)
    await reviewer.getByText(message,{exact:true}).waitFor()
    assert.equal(await button(reviewer,action).count(),0)
  }

  await assertBlocked('return-wrong','sai-ma.csv',returned('RT-WRONG','BANK-MISSING',104000),
    'Mã giao dịch gốc không thuộc đợt hóa đơn này.')
  await assertBlocked('return-excess','vuot-tien-goc.csv',returned('RT-EXCESS',original,104001),
    'Số tiền hoàn vượt phần còn có thể hoàn của giao dịch gốc.')
  assert.deepEqual([(await ownerSummary(invoiceId)).paid,(await ownerSummary(invoiceId)).entries.length],[304000,2])
  record('An unmatched original transfer and a return above the original amount are both blocked without changing the closed ledger.',true)

  const contents = returned('RT-78101',original,104000)
  const mail = await deliver('return-full','hoan-khoan-chuyen.csv',contents)
  const query = await openEvidence(mail,'hoan-khoan-chuyen.csv')
  const prepared = await getPreview(query)
  assert.deepEqual([prepared.kind,prepared.originalTransfer,prepared.originalAmount,prepared.remainingAfter],['return',original,104000,104000])
  await reviewer.getByText('Còn phải trả sau hoàn',{exact:true}).waitFor()
  await capture('09-xem-truoc-hoan-tien',reviewer)
  for (const actor of [page,outsider]) {
    await getPreview(query,404,actor)
    assert.equal((await actor.request.post(app+endpoint,{data:prepared.command,headers:key()})).status(),404)
  }
  const forged = {...prepared.command,expectedReturned:1}
  assert.equal((await reviewer.request.post(app+endpoint,{data:forged,headers:key()})).status(),409)
  await summary(outsider,handoffId,404)
  record('Only the assigned accountant can preview and post this return. An outsider, the buyer and a tampered balance are rejected.',true)

  const attempts = []
  await reviewer.route('**'+endpoint,async route => {
    if (route.request().method()!=='POST') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await button(reviewer,action).click()
  await button(reviewer,'Thử lại cùng yêu cầu').click()
  await reviewer.getByRole('status').filter({hasText:'Đã ghi chứng từ hoàn tiền.'}).waitFor()
  await reviewer.unroute('**'+endpoint)
  assert.deepEqual(attempts.map(({status,result})=>[status,result.replayed]),[[200,false],[200,true]])
  assert.equal(attempts[0].key,attempts[1].key)
  assert.equal(attempts[0].result.id,attempts[1].result.id)
  assert.deepEqual([attempts[1].result.paid,attempts[1].result.remaining],[200000,104000])

  await page.reload()
  await page.getByText('Công nợ mở lại',{exact:true}).waitFor()
  const reopened = await ownerSummary(invoiceId)
  assert.deepEqual([reopened.status,reopened.paid,reopened.returned,reopened.remaining,reopened.entries.length],['reopened',200000,104000,104000,3])
  const [entry] = reopened.entries.filter(item=>item.kind==='return')
  assert.equal(entry.originalTransfer,original)
  assert.equal(entry.emailId,null)
  const accountant = await summary(reviewer,handoffId)
  assert.equal(accountant.entries.find(item=>item.kind==='return').emailId,mail)
  assert.equal(accountant.entries.find(item=>item.reference===original).emailId,lastMail)
  await page.getByRole('region',{ name:'Theo dõi thanh toán' }).scrollIntoViewIfNeeded()
  await capture('10-mua-hang-cong-no-mo-lai',page)
  record('A lost confirmation replays the same receipt. The unchanged original and one linked return reopen exactly 104000 VND for the buyer.',true)

  const forwarded = '\uFEFF'+contents.replaceAll('\n','\r\n')
  await assertBlocked('return-copy','gui-lai-phieu-hoan.csv',forwarded,
    'Chứng từ hoặc mã giao dịch đã được ghi sổ.')
  await assertBlocked('return-over-cumulative','hoan-lan-hai.csv',returned('RT-78102',original,1),
    'Số tiền hoàn vượt phần còn có thể hoàn của giao dịch gốc.')

  if (board) await board.checkReopened(reviewer,invoiceNumber,mail)

  // The replacement is recorded in a new Chrome session after the buyer has seen the reopened debt.
  const replacement = await deliver('return-replacement','chuyen-thay-the.csv',evidence(invoiceNumber,'BANK-78103',104000))
  reviewer = await reopenAccountant()
  const replacementPreview = await getPreview(await openEvidence(replacement,'chuyen-thay-the.csv'))
  assert.deepEqual([replacementPreview.kind,replacementPreview.remainingAfter],['payment',0])
  const posted = reviewer.waitForResponse(response => response.url()===app+endpoint && response.request().method()==='POST')
  await button(reviewer,'Xác nhận ghi thanh toán').click()
  const result = await posted
  assert.equal(result.status(),200,await result.text())
  const receipt = await result.json()
  assert.deepEqual([receipt.paid,receipt.remaining],[304000,0])
  await reviewer.getByRole('status').filter({hasText:'Đã ghi chứng từ thanh toán.'}).waitFor()
  const closed = await ownerSummary(invoiceId)
  assert.deepEqual([closed.status,closed.paid,closed.returned,closed.remaining],['paid',304000,104000,0])
  const readClosed = reviewer.waitForResponse(response => response.url()===app+endpoint+'?handoffId='+handoffId)
  await reviewer.getByRole('link',{name:'Mở hồ sơ Kế toán',exact:true}).click()
  const read = await readClosed
  assert.equal(read.status(),200,await read.text())
  assert.equal((await read.json()).status,'paid')
  await reviewer.getByText('Đã thanh toán',{exact:true}).waitFor()
  await reviewer.setViewportSize({width:390,height:844})
  await reviewer.reload()
  await reviewer.getByText('Đã thanh toán',{exact:true}).waitFor()
  await capture('11-ke-toan-khep-lai-cong-no',reviewer)
  await page.reload()
  await page.getByText('Đã thanh toán',{exact:true}).waitFor()
  assert.deepEqual(closed.entries.map(entry=>[entry.reference,entry.kind]).sort(),[
    ['BANK-78101','payment'],['BANK-78102','payment'],['BANK-78103','payment'],['RT-78101','return'],
  ])
  if (board) await board.checkClosed(reviewer,invoiceNumber)
  assert.equal(googleProvider.calls.sendAttempts,0)
  assert.deepEqual(runtimeErrors,[])
  record('A renamed return and a second return beyond the original cumulative amount are blocked. The replacement closes the balance at zero with all four entries intact.',true)
}
