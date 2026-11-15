import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { setupPurchase } from '../../design/purchase-dues.mjs'
import { cases, corpusId, hold, materialize } from './corpus.mjs'

const handoffs = '/api/commitments/handoffs'
const button = (page,name) => page.getByRole('button',{name,exact:true})
const link = (page,name) => page.getByRole('link',{name,exact:true})
const task = (page,po) => page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).getByRole('listitem')
  .filter({has:page.getByRole('heading',{name:new RegExp('^'+po+' ·')})})
const attachment = part => ({filename:part.name,contentType:'text/csv',data:Buffer.from(part.csv).toString('base64')})
const status = (page, text) => page.getByRole('status').filter({hasText:text}).waitFor()

async function read(actor,url,expected=200) {
  const response = await actor.request.get(url)
  assert.equal(response.status(),expected,await response.text())
  return response.json()
}

async function manualDecision(page,app,row,mails) {
  const start = performance.now()
  let files = 0
  const qualifying = new Map()
  for (const mail of mails) {
    await page.goto(app+'/inbox?email='+mail.emailId)
    const downloads = page.getByTitle('Tải xuống',{exact:true})
    for (const [index,part] of mail.parts.entries()) {
      const event = page.waitForEvent('download')
      await downloads.nth(index).click()
      const download = await event
      const chunks = []
      for await (const chunk of await download.createReadStream()) chunks.push(chunk)
      assert.equal(download.suggestedFilename(),part.name)
      const csv = Buffer.concat(chunks).toString('utf8')
      assert.equal(csv,part.csv)
      files++
      const [po,invoice,replaces,,,,,,due] = csv.split('\n')[1].split(',')
      if (po!==row.po || replaces!==row.original || !due || mail.from!==row.supplier || mail.age>=5) continue
      const prior = qualifying.get(csv)
      if (!prior || prior.age>mail.age) {
        qualifying.set(csv,{age:mail.age,result:{decision:'approve',source:mail.id,part:part.id,invoice,due}})
      }
    }
  }
  return {po:row.po,result:qualifying.size===1?[...qualifying.values()][0].result:hold,
    decisionMs:performance.now()-start,emailsOpened:mails.length,filesOpened:files}
}

export async function rehearsePurchaseRelease(options) {
  const {app,page,reviewer,outsider,deliver,request,capture,record,output} = options
  const product = [], manual = []
  const paymentDue = new Date(Date.now()+5*86_400_000).toISOString().slice(0,10)
  const save = () => writeFileSync(output+'/browser.json',JSON.stringify({
    corpusId, chrome:page.context().browser().version(), product, manual,
  },null,2)+'\n')

  for (const [index,row] of cases.entries()) {
    const seeded = await setupPurchase({...options,paymentDue,supplier:row.supplier,reference:row.po,number:row.original})
    const {handoffId,orderId} = seeded
    const scope = () => request('/api/commitments/payment?id='+orderId)
    const reviewLink = app+'/commitments/handoffs?id='
    const find = app+'/api/commitments/supplements?case='+handoffId
    await reviewer.goto(app+'/commitments/dues')
    const dueRow = reviewer.getByRole('listitem').filter({has:reviewer.getByRole('heading',{name:row.original+' · '+row.po,exact:true})})
    await link(dueRow,'Yêu cầu bổ sung chứng từ').click()
    await reviewer.getByLabel('Chứng từ cần bổ sung').fill('Cần bản đính chính đúng PO có hạn thanh toán.')
    const requestStart = performance.now()
    await button(reviewer,'Giao yêu cầu cho Mua hàng').click()
    await status(reviewer,'Đã giao yêu cầu bổ sung cho Mua hàng.')
    const requestMs = performance.now()-requestStart
    const examine = await read(reviewer,app+handoffs+'?id='+handoffId)
    assert.equal(examine.exception.stage,'buyer')
    assert.deepEqual(examine.exception.events.map(event=>event.action),['request_evidence'])

    const mails = []
    for (const mail of materialize(row)) {
      const subject = mail.subject.slice(row.po.length+3)
      const emailId = await deliver(mail.id,'mua-hang',mail.from,mail.age,subject,mail.body,mail.parts.map(attachment),row.po)
      const {attachments} = await request('/api/emails/'+emailId+'/attachments')
      assert.equal(attachments.length,mail.parts.length)
      mails.push({...mail,emailId,parts:mail.parts.map((part,i)=>({...part,fileId:attachments[i].id}))})
    }
    assert.deepEqual(await read(reviewer,find),[])
    assert.deepEqual(await read(outsider,find),[])

    // Alternate order to reduce first-navigation bias. No recording before both decisions.
    const productDecision = async () => {
      const start = performance.now()
      const scanned = page.waitForResponse(response=>response.url().startsWith(app+'/api/commitments/supplements?'))
      await page.goto(app+'/inbox')
      const response = await scanned
      assert.equal(response.status(),200)
      const scan = (await response.json()).find(item=>item.caseId===handoffId)
      assert.ok(scan)
      assert.equal(scan.incomplete,false)
      const region = task(page,row.po).getByRole('region',{name:'Chứng từ bổ sung từ email'})
      await region.waitFor()
      const preview = link(region,'Xem trước chứng từ mới')
      if (scan.matches.length!==1) {
        assert.equal(await preview.count(),0)
        if (scan.matches.length>1) await region.getByText('Có nhiều bản cần đối chiếu',{exact:true}).waitFor()
        else await region.getByText(/tệp cần đối chiếu/).waitFor()
        const decisionMs = performance.now()-start
        return {result:hold,decisionMs,emailsOpened:0,filesOpened:0,candidates:scan.matches.length}
      }
      const match = scan.matches[0]
      const mail = mails.find(item=>item.emailId===match.emailId)
      const part = mail?.parts.find(item=>item.fileId===match.fileId)
      assert.ok(part)
      await preview.click()
      await page.waitForURL(url=>url.pathname==='/commitments/payment' && url.searchParams.has('supplement'))
      assert.equal(new URL(page.url()).searchParams.get('file'),match.fileId)
      await page.getByText('Hạn thanh toán trên hóa đơn '+match.deadline,{exact:true}).waitFor()
      return {result:{decision:'approve',source:mail.id,part:part.id,invoice:match.invoice,due:match.deadline},
        decisionMs:performance.now()-start,emailsOpened:0,filesOpened:1,candidates:1,url:page.url()}
    }
    let observed
    if (index%2===0) {
      manual.push(await manualDecision(page,app,row,mails))
      observed = await productDecision()
    } else {
      observed = await productDecision()
      manual.push(await manualDecision(page,app,row,mails))
    }
    const {url,...decision} = observed
    if (url && page.url()!==url) await page.goto(url)
    await capture(row.po+'-quyet-dinh',page)
    let writeMs = null, replay = false

    if (url) {
      assert.equal((await scope()).invoice.number,row.original)
      const start = performance.now()
      await button(page,'Ghi nhận hóa đơn').click()
      await status(page,'Đã ghi nhận chứng từ.')
      await link(page,'Mở hồ sơ đối soát').click()
      await button(page,'Bàn giao bản bổ sung').click()
      await status(page,'Đã bàn giao hồ sơ cho Kế toán.')
      const latest = await scope()
      const pending = await request(handoffs+'?'+new URLSearchParams({commitment:orderId,invoice:latest.invoice.id}))
      assert.equal((await outsider.request.get(app+handoffs+'?id='+pending.pending.id)).status(),404)
      await reviewer.goto(app+'/inbox')
      await link(task(reviewer,row.po),'Xem và duyệt bản bổ sung').click()
      await reviewer.waitForURL(reviewLink+pending.pending.id)
      const comparison = reviewer.getByRole('region',{name:'So sánh bản bổ sung'})
      await comparison.getByText('Bản bổ sung · '+observed.result.invoice,{exact:true}).waitFor()
      await comparison.getByText('Hạn thanh toán '+observed.result.due,{exact:true}).waitFor()
      const pattern = '**'+handoffs
      const attempts = []
      if (index===1) await reviewer.route(pattern,async route=>{
        if (route.request().method()!=='POST' || route.request().postDataJSON().action!=='approve') return route.continue()
        const response = await route.fetch({maxRetries:0})
        attempts.push({key:route.request().headers()['idempotency-key'],receipt:await response.json()})
        if (attempts.length===1 && response.ok()) return route.abort()
        return route.fulfill({response})
      })
      try {
        await button(reviewer,'Duyệt bản bổ sung').click()
        if (index===1) await button(reviewer,'Thử lại cùng yêu cầu').click()
        await status(reviewer,'Đã duyệt hồ sơ.')
      } finally {
        if (index===1) await reviewer.unroute(pattern)
      }
      writeMs = performance.now()-start
      if (index===1) {
        assert.deepEqual(attempts.map(attempt=>attempt.receipt.replayed),[false,true])
        assert.equal(attempts[0].key,attempts[1].key)
        assert.equal(attempts[0].receipt.decisionId,attempts[1].receipt.decisionId)
        replay = true
      }
      await reviewer.reload()
      await reviewer.getByText('Đã khép ngoại lệ',{exact:true}).waitFor()
      const closed = await read(reviewer,app+handoffs+'?id='+pending.pending.id)
      assert.deepEqual(closed.exception.events.map(event=>event.action),['request_evidence','submit','approve'])
      const committed = await scope()
      const evidence = mails.find(mail=>mail.id===observed.result.source)
      assert.equal(committed.invoice.number,observed.result.invoice)
      assert.equal(committed.invoice.evidence.emailId,evidence.emailId)
      assert.equal(committed.invoice.evidence.attachmentId,evidence.parts.find(part=>part.id===observed.result.part).fileId)
      assert.equal(committed.invoice.lines[0].paymentDue,observed.result.due)
      assert.equal(await button(reviewer,'Duyệt bản bổ sung').count(),0)
      await capture(row.po+'-da-duyet',reviewer)
      for (const actor of [page,reviewer]) {
        await actor.goto(app+'/inbox')
        await actor.getByRole('region',{name:'Cam kết cần chú ý'}).waitFor()
        await task(actor,row.po).waitFor({state:'hidden'})
      }
    } else {
      await page.goto(app+'/inbox')
      await task(page,row.po).getByText('Tôi phải bổ sung',{exact:true}).waitFor()
      assert.equal((await scope()).invoice.number,row.original)
      assert.deepEqual((await read(reviewer,app+handoffs+'?id='+handoffId)).exception.events.map(event=>event.action),['request_evidence'])
    }

    product.push({po:row.po,...decision,requestMs,writeMs,replay})
    save()
    record(row.po+': Chrome captured source selection and persisted approval or kept the exception on hold.',true)
  }
}
