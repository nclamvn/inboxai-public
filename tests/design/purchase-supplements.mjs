import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const discovery = '/api/commitments/supplements'
const payment = '/api/commitments/payment'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const sourceSection = page => page.getByRole('region',{name:'Chứng từ bổ sung từ email',exact:true})

export async function rehearsePurchaseSupplements({ app,buyer,accountant,outsider,buyerMail,request,scope,supplier,invoice,
  reference,newDue,caseId,wrong,late,capture,record }) {
  const filename = 'bo-sung.csv'
  const csv = (number,ref=reference) => [invoice+',payment_due',
    [ref,number,'INV-8712','B',30,'bộ',2000,'VND',newDue].join(','),''].join('\n')
  const file = value => ({filename,contentType:'text/csv',data:Buffer.from(value).toString('base64')})
  const deliver = (uid,age,attachments) => buyerMail(uid,'mua-hang',supplier,age,'Trả lời yêu cầu bổ sung',
    'Gửi chứng từ để xem xét.',attachments,reference)
  const good = csv('INV-8713')
  await deliver('supplement-copy',1.5,[file(good)])
  const mail = await deliver('supplement-final',1,[file(csv('INV-8798','PO-9423')),file(good)])
  const query = discovery+'?case='+caseId
  const [first] = await request(query)
  assert.equal(first.incomplete,false)
  assert.deepEqual(first.matches.map(match=>[match.emailId,match.filename,match.invoice,match.replaces]),[
    [mail,filename,'INV-8713','INV-8712'],
  ])
  assert.ok(first.checks.some(check=>check.emailId===wrong.mail && check.code==='wrong_po'))
  assert.ok(first.checks.some(check=>check.emailId===late.mail && check.code==='old'))
  const sameNameWrong = first.checks.find(check=>check.emailId===mail && check.filename===filename)
  assert.ok(sameNameWrong)
  assert.notEqual(sameNameWrong.fileId,first.matches[0].fileId)
  assert.equal((await scope()).invoice.number,'INV-8712')
  assert.equal((await fetch(app+query)).status,401)
  assert.deepEqual(await (await accountant.request.get(app+query)).json(),[])
  assert.deepEqual(await (await outsider.request.get(app+query)).json(),[])

  // Use the same three visible message candidates on the previous path.
  // Loading the source email is counted once, independently of preview clicks.
  const opened = []
  for (const emailId of [wrong.mail,late.mail,mail]) {
    await buyer.goto(app+'/inbox?email='+emailId)
    await buyer.waitForURL('**/inbox?email='+emailId)
    const attachment = emailId===wrong.mail ? wrong.filename : emailId===late.mail ? late.filename : filename
    await buyer.getByRole('link',{name:'Bảng giá hoặc hóa đơn · '+attachment,exact:true}).first().waitFor()
    const link = buyer.getByRole('link',{name:'Bảng giá hoặc hóa đơn · '+attachment,exact:true})
    const hrefs = await link.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')))
    for (const href of hrefs) {
      const params = new URL(app+href).search
      const correct = new URLSearchParams(params).get('file')===first.matches[0].fileId
      const status = correct ? 200 : emailId===late.mail ? 409 : 422
      await request(payment+params,undefined,status)
    }
    opened.push(emailId)
  }

  await buyer.goto(app+'/inbox')
  await sourceSection(buyer).getByText('Có chứng từ mới để kiểm tra',{exact:true}).waitFor()
  const single = await sourceSection(buyer).getByRole('link',{name:'Xem trước chứng từ mới',exact:true}).getAttribute('href')
  assert.equal(new URL(app+single).searchParams.get('file'),first.matches[0].fileId)
  await sourceSection(buyer).scrollIntoViewIfNeeded()
  await capture('19-inbox-dung-chung-tu',buyer)
  assert.equal((await accountant.request.get(app+payment+new URL(app+single).search)).status(),404)
  const tamperedDigest = new URLSearchParams(new URL(app+single).search)
  tamperedDigest.set('digest','0'.repeat(64))
  await request(payment+'?'+tamperedDigest,undefined,409)

  await deliver('supplement-competing',0.75,[file(csv('INV-8715'))])
  await buyer.goto(app+'/inbox')
  await sourceSection(buyer).getByText('Có nhiều bản cần đối chiếu',{exact:true}).waitFor()
  assert.equal(await sourceSection(buyer).getByRole('link',{name:'Xem trước chứng từ mới',exact:true}).count(),0)
  assert.equal(await sourceSection(buyer).getByRole('link',{name:'Xem trước INV-8715',exact:true}).count(),1)
  await sourceSection(buyer).scrollIntoViewIfNeeded()
  await capture('20-inbox-hai-ban-can-doi-chieu',buyer)

  const chosen = sourceSection(buyer).getByRole('link',{name:'Xem trước INV-8713',exact:true})
  await chosen.click()
  await buyer.waitForURL(url=>url.pathname==='/commitments/payment' && url.searchParams.has('supplement'))
  const previewUrl = new URL(buyer.url())
  const sessionPreview = await request(payment+previewUrl.search)
  assert.equal(previewUrl.searchParams.get('email'),mail)
  assert.equal(previewUrl.searchParams.get('file'),first.matches[0].fileId)
  assert.equal(sessionPreview.number,'INV-8713')
  assert.deepEqual([opened.length,Number(previewUrl.pathname==='/inbox')],[3,0])
  assert.equal((await scope()).invoice.number,'INV-8712')
  const requestKey = randomUUID()
  const unrelated = await buyer.request.post(app+payment+'?supplement='+randomUUID(),{
    data:sessionPreview.command,headers:{'Idempotency-Key':requestKey},
  })
  assert.equal(unrelated.status(),404)
  assert.equal((await scope()).invoice.number,'INV-8712')
  record('Across three similar emails the manual search opens three source messages. The Inbox card reaches the exact CSV preview without opening a message. Same-name parts, a resent copy, wrong PO, old version, competing revisions and unauthorized links are distinguished.',true)

  const writes = []
  const pattern = '**'+payment+'?supplement=*'
  await buyer.route(pattern,async route=>{
    if (route.request().method()!=='POST') return route.continue()
    const response = await route.fetch({maxRetries:0})
    writes.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
    if (writes.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await button(buyer,'Ghi nhận hóa đơn').click()
  await button(buyer,'Thử lại cùng yêu cầu').click()
  await buyer.getByRole('status').filter({hasText:'Đã ghi nhận chứng từ.'}).waitFor()
  await buyer.unroute(pattern)
  assert.deepEqual(writes.map(write=>[write.status,write.result.replayed]),[[200,false],[200,true]])
  assert.equal(writes[0].key,writes[1].key)
  assert.equal(writes[0].result.documentId,writes[1].result.documentId)
  await buyer.getByRole('link',{name:'Mở hồ sơ đối soát',exact:true}).click()
  await buyer.getByText('Hóa đơn thay thế INV-8712',{exact:true}).waitFor()
  assert.equal((await scope()).invoice.id,writes[0].result.documentId)
  assert.equal((await request(query))[0].matches.length,0)
  await request(payment+previewUrl.search,undefined,409)
  record('The context-bound confirmation writes once after a dropped response. Replayed and competing copies are no longer actionable after the accepted version changes.',true)

  return {mail,filename,fileId:first.matches[0].fileId}
}
