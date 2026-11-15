import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const endpoint = '/api/commitments/settlements'
const handoffs = '/api/commitments/handoffs'
const handoffPath = id => '/commitments/handoffs?id=' + id
const button = (page,name) => page.getByRole('button',{ name,exact:true })
const key = () => ({ 'Idempotency-Key':randomUUID() })

export async function rehearsePurchaseSettlement({ app,page,reviewer,outsider,request,capture,admin,reviewerId,connectMailbox,
  orderCode,orderId,approvedHandoff,approvedInvoice,paymentUrl,assign,mailPayment,fileAction,readPayment,invoice,csv,
  googleProvider,record,runtimeErrors,purchaseReturn,reopenAccountant,board,purchaseExceptions,purchaseBatches,sql,reviewerEmail,previousEmail }) {
  const account = await connectMailbox('ke-toan',reviewerId)
  const date = new Date(Date.now()-5*86_400_000).toISOString().slice(0,10)
  const header = 'po,invoice,transfer,paid_on,amount,currency'
  const evidence = (number,transfer,amount) => csv(header,[number,transfer,date,amount,'VND'])
  const summary = async (actor,handoffId,status=200) => {
    const result = await actor.request.get(app+endpoint+'?handoffId='+handoffId)
    assert.equal(result.status(),status,await result.text())
    return result.json()
  }
  const ownerSummary = invoiceId => request(endpoint+'?'+new URLSearchParams({orderId,invoiceId}))

  async function deliver(uid,filename,contents,reference=orderCode,receivedAt=new Date(Date.now()-3*86_400_000).toISOString()) {
    account.deliver([{id:uid,threadId:'finance-'+uid,messageId:'<'+uid+'@example.test>',
      from:'ke-toan-noi-bo@example.test',at:receivedAt,
      subject:'Chứng từ chuyển khoản '+reference,body:'Vui lòng kiểm tra chứng từ.',
      attachments:[{filename,contentType:'text/csv',data:Buffer.from(contents).toString('base64')}]}])
    const sync = await reviewer.request.post(app+'/api/source-accounts/sync',{data:{refresh:true},headers:key()})
    assert.equal(sync.status(),200,await sync.text())
    const {data,error} = await admin.from('emails').select('id').eq('user_id',reviewerId)
      .eq('source_account_id',account.id).eq('original_uid',uid).single()
    assert.equal(error,null)
    return data.id
  }

  async function openEvidence(message,filename) {
    await reviewer.goto(app+'/inbox?email='+message)
    try {
      await reviewer.getByRole('link',{name:'Đối soát thanh toán · '+filename,exact:true}).click()
    } catch (error) {
      throw new Error('Email link not found at '+reviewer.url()+': '+(await reviewer.locator('body').innerText()).slice(-1800),{cause:error})
    }
    await reviewer.getByRole('heading',{name:'Đối soát thanh toán',exact:true}).waitFor()
    return new URL(reviewer.url()).search
  }

  async function getPreview(query,status=200,actor=reviewer) {
    const result = await actor.request.get(app+endpoint+query)
    assert.equal(result.status(),status,await result.text())
    return result.json()
  }

  const number = 'INV-7803'
  await reviewer.goto(app+handoffPath(approvedHandoff))
  await reviewer.getByText('Chờ thanh toán',{exact:true}).waitFor()
  assert.equal((await summary(reviewer,approvedHandoff)).remaining,312000)
  const staleMail = await deliver('transfer-concurrent','cho-ghi.csv',evidence(number,'BANK-STALE',30000))
  const stale = await getPreview(await openEvidence(staleMail,'cho-ghi.csv'))
  const firstContents = evidence(number,'BANK-78101',200000)
  const partialMail = await deliver('transfer-partial','thanh-toan-dot-1.csv',firstContents)
  const partialQuery = await openEvidence(partialMail,'thanh-toan-dot-1.csv')
  const partial = await getPreview(partialQuery)
  assert.deepEqual([partial.amount,partial.paid,partial.remaining],[200000,0,312000])
  await capture('05-xem-truoc-tra-mot-phan',reviewer)

  const outsiderGet = await outsider.request.get(app+endpoint+'?'+new URLSearchParams({orderId,invoiceId:approvedInvoice}))
  assert.equal(outsiderGet.status(),404)
  await summary(outsider,approvedHandoff,404)
  await getPreview(partialQuery,404,outsider)
  await getPreview(partialQuery,404,page)
  for (const actor of [outsider,page]) {
    assert.equal((await actor.request.post(app+endpoint,{data:partial.command,headers:key()})).status(),404)
  }
  assert.equal((await fetch(app+endpoint+'?handoffId='+approvedHandoff)).status,401)
  await button(reviewer,'Xác nhận ghi thanh toán').click()
  await reviewer.getByRole('status').filter({hasText:'Đã ghi chứng từ thanh toán.'}).waitFor()
  const initial = await ownerSummary(approvedInvoice)
  assert.deepEqual([initial.status,initial.paid,initial.remaining],['partial',200000,112000])
  assert.equal(initial.entries[0].emailId,null)
  assert.equal((await summary(reviewer,approvedHandoff)).entries[0].emailId,partialMail)
  assert.equal((await reviewer.request.post(app+endpoint,{data:stale.command,headers:key()})).status(),409)
  await page.goto(paymentUrl)
  await page.getByText('Đã trả một phần',{exact:true}).waitFor()
  await page.getByText('112.000 ₫',{exact:true}).waitFor()
  await capture('06-mua-hang-thay-so-du')
  record('Accounting confirms 200000 of 312000 VND. Buyer sees 112000 VND remaining without delegated mailbox access. Unauthorized and stale balance writes are rejected.',true)

  if (board) await board.checkPartial(approvedInvoice, partialMail)

  const duplicateContents = '\uFEFF'+firstContents.replaceAll('\n','\r\n')
  const duplicate = await deliver('transfer-copy','gui-lai-ten-khac.csv',duplicateContents)
  await openEvidence(duplicate,'gui-lai-ten-khac.csv')
  await reviewer.getByText('Chứng từ hoặc mã giao dịch đã được ghi sổ.',{exact:true}).waitFor()
  assert.equal(await button(reviewer,'Xác nhận ghi thanh toán').count(),0)
  const excessive = await deliver('transfer-excess','tra-qua-so-du.csv',evidence(number,'BANK-EXCESS',112001))
  await openEvidence(excessive,'tra-qua-so-du.csv')
  await reviewer.getByText('Số tiền chứng từ vượt số còn phải trả.',{exact:true}).waitFor()
  assert.equal((await ownerSummary(approvedInvoice)).entries.length,1)
  record('Renamed bank receipt with different bytes deduplicates on the transfer reference. A payment above the current balance is held.',true)

  const formerMail = await deliver('transfer-old-version','hoa-don-ban-cu.csv',evidence(number,'BANK-OLD',10000))
  const former = await getPreview(await openEvidence(formerMail,'hoa-don-ban-cu.csv'))
  assert.equal(former.invoice,number)
  const newNumber = 'INV-7804'
  const corrected = board
    ? csv(invoice+',payment_due',[newNumber,number,'B',38,'bộ',8000,'VND',board.movedDue])
    : csv(invoice,[newNumber,number,'B',38,'bộ',8000,'VND'])
  await fileAction(await mailPayment('settlement-amendment','hoa-don-dieu-chinh.csv',4,corrected),'hoa-don-dieu-chinh.csv','Ghi nhận hóa đơn')
  const oldWrite = await reviewer.request.post(app+endpoint,{data:former.command,headers:key()})
  assert.equal(oldWrite.status(),409)
  await openEvidence(formerMail,'hoa-don-ban-cu.csv')
  await reviewer.getByText('Hóa đơn đã đổi hoặc căn cứ không còn khớp. Cần đối soát bản đang hiệu lực.',{exact:true}).waitFor()
  await capture('07-chan-ban-hoa-don-cu',reviewer)
  const newInvoice = (await readPayment()).invoice.id
  if (board) await board.checkCorrection(approvedHandoff)
  const inReview = await ownerSummary(newInvoice)
  assert.deepEqual([inReview.status,inReview.due,inReview.paid,inReview.remaining],['review',304000,200000,104000])
  await page.goto(paymentUrl)
  await page.getByText('Cần đối soát lại',{exact:true}).waitFor()
  await assign()
  await page.getByRole('status').filter({hasText:'Đã bàn giao hồ sơ cho Kế toán.'}).waitFor()
  const assigned = await request(handoffs+'?'+new URLSearchParams({commitment:orderId,invoice:newInvoice}))
  const newHandoff = assigned.pending.id
  await reviewer.goto(app+handoffPath(newHandoff))
  await button(reviewer,'Duyệt đủ căn cứ thanh toán').click()
  await reviewer.getByRole('status').filter({hasText:'Đã duyệt hồ sơ.'}).waitFor()
  await reviewer.getByText('Đã trả một phần',{exact:true}).waitFor()
  assert.deepEqual([(await summary(reviewer,newHandoff)).remaining,(await summary(reviewer,approvedHandoff)).status],[104000,'review'])
  record('Correction blocks old preview and old receipt. After reapproval the 200000 VND payment remains attached to the installment and the new balance is 104000 VND.',true)

  if (board) await board.checkReapproved(newHandoff)

  const lastMail = await deliver('transfer-final','thanh-toan-dot-cuoi.csv',evidence(newNumber,'BANK-78102',104000))
  await reviewer.setViewportSize({width:390,height:844})
  await openEvidence(lastMail,'thanh-toan-dot-cuoi.csv')
  const attempts = []
  await reviewer.route('**'+endpoint,async route=>{
    if (route.request().method()!=='POST') return route.continue()
    const response = await route.fetch({maxRetries:0})
    attempts.push({key:route.request().headers()['idempotency-key'],status:response.status(),result:await response.json()})
    if (attempts.length===1 && response.ok()) return route.abort()
    return route.fulfill({response})
  })
  await button(reviewer,'Xác nhận ghi thanh toán').click()
  await button(reviewer,'Thử lại cùng yêu cầu').click()
  await reviewer.getByRole('status').filter({hasText:'Đã ghi chứng từ thanh toán.'}).waitFor()
  assert.equal(attempts.length,2)
  assert.equal(attempts[0].key,attempts[1].key)
  assert.equal(attempts[0].result.id,attempts[1].result.id)
  assert.deepEqual(attempts.map(item=>[item.status,item.result.replayed]),[[200,false],[200,true]])
  await reviewer.getByRole('link',{name:'Mở hồ sơ Kế toán',exact:true}).click()
  await reviewer.getByText('Đã thanh toán',{exact:true}).waitFor()
  await reviewer.reload()
  await reviewer.getByText('Đã thanh toán',{exact:true}).waitFor()
  await capture('08-ke-toan-khep-cong-no-mobile',reviewer)
  await reviewer.unroute('**'+endpoint)
  const closed = await ownerSummary(newInvoice)
  assert.deepEqual([closed.status,closed.paid,closed.remaining],['paid',304000,0])
  assert.deepEqual(closed.entries.map(item=>item.reference).sort(),['BANK-78101','BANK-78102'])
  assert.deepEqual(closed.entries.map(item=>item.invoice).sort(),[number,newNumber])
  await page.reload()
  await page.getByText('Đã thanh toán',{exact:true}).waitFor()
  assert.equal(googleProvider.calls.sendAttempts,0)
  assert.deepEqual(runtimeErrors,[])
  record('Lost confirmation reuses the same idempotency key and receipt. Chrome reload and buyer both show zero balance with exactly two payments and zero sends.',true)
  if (board) await board.checkClosed(reviewer,newNumber)
  if (purchaseReturn) {
    const { rehearsePurchaseReturn } = await import('./purchase-return.mjs')
    await rehearsePurchaseReturn({ app,page,reviewer,outsider,deliver,openEvidence,getPreview,summary,ownerSummary,
      invoiceId:newInvoice,invoiceNumber:newNumber,handoffId:newHandoff,csv,evidence,date,lastMail,capture,record,
      googleProvider,runtimeErrors,board,reopenAccountant: async () => {
        await reviewer.context().close()
        reviewer = await reopenAccountant()
        return reviewer
      } })
  }
  if (purchaseExceptions) {
    const bank = { deliver,openEvidence,getPreview,transferDate:date }
    await board.checkException(reviewer,bank)
    if (purchaseBatches) {
      const approverId = sql("SELECT id FROM auth.users WHERE email='"+previousEmail+"'").trim()
      assert.match(approverId,/^[a-f0-9-]{36}$/)
      sql("INSERT INTO private.purchase_batch_approvers(preparer_id,approver_id) VALUES ('"+reviewerId+"','"+approverId+"')")
      await board.checkBatch(reviewer,bank,{ approverId,reviewerEmail,preparerId:reviewerId })
    }
    assert.equal(googleProvider.calls.sendAttempts,0)
    assert.deepEqual(runtimeErrors,[])
  }
}
