import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { audit } from '../browser.mjs'
import { button, signIn } from './fixture.mjs'
import { cases, corpusId, decisionFields, loadLabels } from '../../eval/purchase-value/corpus.mjs'

const require=createRequire(import.meta.url)
const axeScript=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')
const link=(page,name)=>page.getByRole('link',{name,exact:true})
const status=(page,message)=>page.getByRole('status').filter({hasText:message}).waitFor()

export async function rehearsePurchaseStudy({guide,app,base,record,output}) {
  const browser=await chromium.launch({channel:'chrome',proxy:{server:'http://127.0.0.1:1',bypass:'127.0.0.1'}})
  const {email,reviewer:reviewerEmail,password}=guide.seed
  const errors=[]
  const capture=async(page,name)=>{
    await page.evaluate(axeScript)
    assert.deepEqual(await audit(page),[],name)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name)
    await page.screenshot({path:output+'/'+name+'.png',fullPage:true,animations:'disabled'})
  }
  let meter,buyer,reviewer
  try {
    buyer=await signIn(browser,app,email,password)
    reviewer=await signIn(browser,app,reviewerEmail,password,{width:390,height:844})
    meter=await browser.newPage({viewport:{width:390,height:844},locale:'vi-VN'})
    meter.setDefaultTimeout(20_000)
    for(const page of [meter,buyer,reviewer]) {
      page.on('pageerror',error=>errors.push(error.message))
      await page.context().route('**/*',route=>[app,base,guide.origin].includes(new URL(route.request().url()).origin)?route.continue():route.abort())
    }
    await meter.goto(guide.origin+'/study')
    const state=()=>meter.request.get(guide.origin+'/study/state').then(response=>response.json())
    await meter.getByText('0/6 hồ sơ',{exact:true}).waitFor()
    assert.ok(guide.seed.mailCount>100)
    const initial=await state()
    const {value}=initial
    const fixture=po=>cases.find(item=>item.po===po)
    const labels=value?loadLabels():null
    assert.equal(initial.initialOrder.length,6)
    assert.equal(new Set(initial.initialOrder.map(item=>item.po)).size,6)
    assert.equal(await meter.locator('#mail details').count(),0)
    assert.equal((await meter.request.post(guide.origin+'/study/event',{data:{action:'start'}})).status(),403)
    assert.equal((await meter.request.post(guide.origin+'/study/event',{headers:{
      Origin:'https://untrusted.example','X-Demo-Token':initial.token,
    },data:{action:'start'}})).status(),403)
    const click=label=>button(meter,label).click()
    const operation=async(label,action)=>{
      const receipt=meter.waitForResponse(response=>response.url()===guide.origin+'/study/event' &&
        response.request().postDataJSON()?.action===action)
      await click(label)
      const response=await receipt
      assert.equal(response.status(),200,await response.text())
      return response.json()
    }
    if (value) {
      const premature=await meter.request.post(guide.origin+'/study/event',{
        headers:{Origin:guide.origin,'X-Demo-Token':initial.token},data:{action:'start',revision:initial.revision},
      })
      assert.equal(premature.status(),409)
      await meter.getByLabel('Mã nhóm',{exact:true}).fill(initial.initialOrder[0].mode==='manual'?'SIM-A':'SIM-B')
      await meter.getByLabel('Công cụ đối chứng và phiên bản').fill('Chrome và quy tắc CSV · giả lập')
      await operation('Ghi thông tin nhóm','enroll')
      await meter.reload()
      assert.ok((await state()).team.code.startsWith('SIM-'))
    }
    await button(meter,'Bắt đầu đo').waitFor()
    const fillDecision=async(part,values)=>{
      await meter.getByLabel('Mã hóa đơn',{exact:true}).fill(values[1])
      await meter.getByLabel('Hạn thanh toán',{exact:true}).fill(values.at(-1))
      await meter.getByLabel('Chứng từ nguồn',{exact:true}).selectOption(part.id)
    }
    const source=async() => operation('Mở nguồn · 0','source')
    const close=async i => {
      await meter.getByText(i+'/6 hồ sơ',{exact:true}).waitFor()
    }
    const openReview=async() => {
      const response=meter.waitForResponse(response=>response.url()===guide.origin+'/study/state')
      await click('Cập nhật liên kết bàn giao')
      const next=await (await response).json()
      // Wait for the refreshed link to reflect the server's current handoff.
      const handoff=link(meter,'Mở hồ sơ Kế toán')
      await meter.waitForFunction(expected=>document.getElementById('reviewer').href===expected,next.active.links.reviewer)
      await reviewer.goto(await handoff.getAttribute('href'))
      await button(reviewer,'Duyệt bản bổ sung').waitFor()
    }
    const purchaseRow=po=>buyer.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).getByRole('listitem').filter({
      has:buyer.getByRole('heading',{name:new RegExp('^'+po+' ·')}),
    })
    const submit=async (po,number,{wrongPo=false,competing=false}={})=>{
      await buyer.goto(app+'/inbox')
      const row=purchaseRow(po)
      if(wrongPo) {
        await row.locator('summary').filter({hasText:'tệp cần đối chiếu'}).click()
        await row.getByText('Mã PO trong tệp không khớp · hoa-don.csv',{exact:true}).waitFor()
      }
      if(competing) await row.getByText('Có nhiều bản cần đối chiếu',{exact:true}).waitFor()
      const candidate=row.getByText(number,{exact:true})
      await candidate.waitFor()
      const preview=row.getByRole('link',{name:/^Xem trước (chứng từ mới|INV-)/}).filter({visible:true})
      if(await preview.count()===1) await preview.click()
      else await link(row,'Xem trước '+number).click()
      await button(buyer,'Ghi nhận hóa đơn').click()
      await status(buyer,'Đã ghi nhận chứng từ.')
      await link(buyer,'Mở hồ sơ đối soát').click()
      await button(buyer,'Bàn giao bản bổ sung').click()
      await status(buyer,'Đã bàn giao hồ sơ cho Kế toán.')
      await openReview()
    }

    for(const [index,descriptor] of initial.initialOrder.entries()) {
      const {active,task}=await operation('Bắt đầu đo','start')
      assert.equal(active.index,index)
      assert.equal(task.po,descriptor.po)
      const slot=index%3
      const frozen=value?fixture(task.po):null
      if(descriptor.mode==='manual') {
        if(slot===0) {
          const before=await state()
          await source()
          const retry=await meter.request.post(guide.origin+'/study/event',{
            headers:{Origin:guide.origin,'X-Demo-Token':initial.token},
            data:{action:'source',index:before.active.index,revision:before.revision},
          })
          assert.equal(retry.status(),409)
          assert.equal((await state()).active.counts.source,1)
          await operation('Tạm dừng','pause')
          const paused=(await state()).active.activeMs
          await meter.reload()
          await button(meter,'Tiếp tục đo').waitFor()
          assert.equal((await state()).active.activeMs,paused)
          assert.equal((await state()).active.counts.source,1)
          await operation('Tiếp tục đo','resume')
          await meter.locator('#mail summary').first().click()
          await capture(meter,'01-doi-chung-mobile')
        }
        if(active.latePending) {
          if(value) {
            const initialPart=(await state()).active.messages[0].parts[0]
            await fillDecision(initialPart,initialPart.contents.split('\n')[1].split(','))
          }
          await operation('Nạp thư đến khi đang duyệt','release')
          await operation('Sửa quyết định · 0','revision')
        }
        const packet=(await state()).active.messages
        const eligible=packet.flatMap(message=>message.parts.map(part=>({
          part,age:message.age,from:message.from??task.supplier,values:part.contents.split('\n')[1].split(','),
        }))).filter(({values,from})=>values[0]===task.po&&values.at(-1)&&from===task.supplier)
          .sort((left,right)=>left.age-right.age)
        if(!eligible.length) {
          await operation('Ghi quyết định giữ chờ','hold')
        } else {
          const {part,values}=eligible[0]
          await fillDecision(part,values)
          await operation('Ghi nhận quyết định','finish')
        }
      } else {
        const item=guide.seed.studySetups.get(task.po)
        const code=Number(task.po.slice(3))
        await source()
        if(frozen?.kind==='hold') {
          await buyer.goto(app+'/inbox')
          const row=purchaseRow(task.po)
          await row.locator('summary').filter({hasText:'tệp cần đối chiếu'}).click()
          await row.getByText('Tệp chưa có hạn thanh toán được yêu cầu · hoa-don.csv',{exact:true}).waitFor()
          assert.equal(await link(row,'Xem trước chứng từ mới').count(),0)
          const before=await guide.seed.caseState(item)
          assert.equal(before.evidence.stage,'buyer')
          assert.equal(before.payment.invoice.number,task.original)
          await operation('Ghi quyết định giữ chờ','hold')
          const after=await guide.seed.caseState(item)
          assert.deepEqual(after,before,'Holding must preserve the existing invoice, approval and send state')
          await capture(buyer,'06-giu-cho-dung-nguon')
          await close(index+1)
          continue
        }
        await submit(task.po,frozen?.candidate??'INV-'+(code*10+2),{wrongPo:slot===0,competing:!value&&slot===1})
        assert.equal((await reviewer.request.get(app+'/api/commitments/payment?id='+item.orderId)).status(),404)
        if(slot===2) {
          const oldUrl=reviewer.url()
          await operation('Nạp thư đến khi đang duyệt','release')
          const result=reviewer.waitForResponse(response=>response.url()===app+'/api/commitments/handoffs'&&response.request().method()==='POST')
          await button(reviewer,'Duyệt bản bổ sung').click()
          assert.equal((await result).status(),409)
          await status(reviewer,'Có chứng từ đính chính mới.')
          assert.equal((await guide.seed.caseState(item)).payment.decisionId,null)
          await capture(reviewer,'02-ke-toan-chan-ban-cu')
          await operation('Sửa quyết định · 0','revision')
          await operation('Khởi động lại InboxAI','restart')
          await meter.reload()
          await meter.getByText('Đã nạp thư đến khi đang duyệt.',{exact:true}).waitFor()
          assert.equal((await state()).active.counts.revision,1)
          await submit(task.po,frozen?labels[frozen.po].number:'INV-'+(code*10+3))
          assert.notEqual(reviewer.url(),oldUrl)
        }
        await button(reviewer,'Duyệt bản bổ sung').click()
        await status(reviewer,'Đã duyệt hồ sơ.')
        await operation('Ghi nhận kết quả đã duyệt','finish')
        if(slot===2) await capture(reviewer,'03-ke-toan-da-duyet-ban-moi')
      }
      await close(index+1)
    }

    await meter.getByRole('heading',{name:'Kết quả phiên đối soát'}).waitFor()
    if(value) {
      await meter.getByLabel('Phản hồi của nhóm',{exact:true}).selectOption('unsure')
      await operation('Ghi phản hồi','feedback')
      await meter.reload()
      await meter.getByText('Phản hồi của nhóm · Chưa chắc',{exact:true}).waitFor()
    }
    const {report}=await state()
    assert.equal(report.session,'chrome-automation')
    assert.equal(report.completed,true)
    assert.equal(report.rows.length,6)
    assert.equal(report.rows.filter(row=>row.outcome.correct).length,6)
    assert.equal(report.rows.filter(row=>row.outcome.wrongApproval).length,0)
    const decisions=report.rows.filter(row=>row.mode==='inbox'&&row.outcome.action==='finish').map(row=>value?row.outcome.result.decisionId:row.outcome.result.decision)
    assert.equal(new Set(decisions).size,value?2:3)
    assert.ok(decisions.every(Boolean))
    const downloadEvent=meter.waitForEvent('download')
    await link(meter,'Tải báo cáo JSON').click()
    const download=await downloadEvent
    const downloaded=[]
    for await(const chunk of await download.createReadStream()) downloaded.push(chunk)
    assert.deepEqual(JSON.parse(Buffer.concat(downloaded).toString('utf8')),report)
    await capture(meter,'04-bao-cao-mobile')
    await meter.setViewportSize({width:1440,height:960})
    await capture(meter,'05-bao-cao-desktop')
    assert.deepEqual(errors,[])
    if(value) {
      assert.equal(report.schema,2)
      assert.equal(report.corpusId,corpusId)
      for(const row of report.rows) {
        assert.deepEqual(decisionFields(row.outcome.result),decisionFields(labels[row.po]))
        if(row.kind==='stale') assert.deepEqual(row.provisional,labels[row.po].before)
      }
      assert.equal(report.rows.filter(row=>row.outcome.action==='hold').length,2)
      writeFileSync(output+'/browser.json',JSON.stringify({chrome:browser.version(),report},null,2)+'\n')
      record('Both value-study methods match the frozen approve/hold decisions and exact sources. Holding preserves the product ledger and sends, with anonymous enrollment and feedback retained.',true)
    } else record('Both methods complete all six Chrome cases with the exact invoice, due date and attachment, including same-name files and late older mail.',true)
    record('A stale mobile reviewer receives 409 with no decision written. After an app restart and a new handoff, PostgreSQL contains one decision for the corrected source.',true)
    record('A replay cannot increment the source tally again. Paused time and moderator counts survive reload. The JSON download matches the server report, and axe and viewport checks pass on desktop and mobile.',true)
  } catch(error) {
    for(const [name,page] of Object.entries({meter,buyer,reviewer})) {
      await page?.screenshot({path:output+'/study-failure-'+name+'.png',fullPage:true}).catch(()=>{})
    }
    throw error
  } finally { await browser.close() }
}
