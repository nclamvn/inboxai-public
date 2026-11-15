import assert from 'node:assert/strict'

const endpoint = '/api/commitments/attention'
const board = page => page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý',exact:true})
const namedLink = (surface,name) => surface.getByRole('link',{name,exact:true})

export function exercisePurchaseFocus({ app,buyer,accountant,outsider,capture,record }) {
  async function read(actor, query='') {
    const response = await actor.request.get(app+endpoint+query)
    assert.equal(response.status(),200,await response.text())
    const data = await response.json()
    assert.ok(Array.isArray(data.purchaseFocus), 'Purchase focus must be available')
    return data.purchaseFocus
  }

  async function compareRoutes({ page,legacy,action,expect,viewport,screenshot }) {
    const navigate = async steps => {
      const trace = []
      for (const [surface,label] of steps) {
        await namedLink(surface,label).click()
        trace.push(label)
      }
      await page.waitForURL('**'+expect)
      return trace
    }
    await page.setViewportSize(viewport)
    await page.goto(app+'/inbox')
    const oldRoute = await navigate(legacy)
    await page.goto(app+'/inbox')
    await namedLink(board(page),action).waitFor()
    await board(page).scrollIntoViewIfNeeded()
    await capture(screenshot,page)
    const newRoute = await navigate([[board(page),action]])
    assert.deepEqual([oldRoute.length,newRoute.length],[3,1])
  }

  return {
    async supply({ handoffId, orderId, invoiceId, reason }) {
      const active = await read(buyer)
      assert.equal(active.length,1)
      assert.deepEqual(active.map(x=>[x.id,x.reference,x.task,x.reason,x.handoffId,x.fileId]),
        [[handoffId,'PO-9422','supply',reason,null,null]])
      assert.ok(active[0].emailId)
      assert.deepEqual(await read(accountant),[])
      assert.deepEqual(await read(outsider),[])
      assert.deepEqual(await read(buyer,'?account=623d8fbb-793e-4ee2-bdd0-57d126438913'),[])
      assert.equal((await fetch(app+endpoint)).status,401)
      await compareRoutes({
        page:buyer, viewport:{width:1380,height:920},
        legacy:[
          [buyer,'Cam kết'],[buyer,'Công nợ cần xử lý'],
          [buyer.getByRole('listitem').filter({has:buyer.getByRole('heading',{name:'INV-8702 · PO-9422',exact:true})}),'Mở hồ sơ'],
        ],
        action:'Mở hồ sơ cần bổ sung',
        expect:'/commitments/payment?'+new URLSearchParams({id:orderId,invoice:invoiceId}),
        screenshot:'16-inbox-mua-hang-bo-sung',
      })
      await buyer.getByText(reason,{exact:true}).waitFor()
      record('Buyer opens the exact held PO in one click from Inbox versus three observed on the previous route. Exact evidence, account filter, anonymous and outsider isolation pass.',true)
    },
    async delegated({ handoffId }) {
      const delegated = await read(accountant)
      assert.deepEqual(delegated.map(x=>[x.task,x.handoffId,x.emailId,x.orderId,x.invoiceId]),
        [['review',handoffId,null,null,null]])
      assert.ok(delegated[0].fileId)
      assert.deepEqual((await read(buyer)).map(x=>x.task),['waiting'])
      const fileQuery = new URLSearchParams({id:handoffId,file:delegated[0].fileId})
      const file = app+'/api/commitments/handoffs?'+fileQuery
      assert.equal((await accountant.request.get(file)).status(),200)
      assert.equal((await outsider.request.get(file)).status(),404)
    },
    async superseded({ handoffId, emailId }) {
      const buyerTask = (await read(buyer))[0]
      const reviewerTask = (await read(accountant))[0]
      assert.deepEqual([buyerTask.task,buyerTask.emailId,reviewerTask.task,reviewerTask.handoffId,reviewerTask.fileId],
        ['resupply',emailId,'stale',handoffId,null])
      await accountant.goto(app+'/inbox')
      await namedLink(board(accountant),'Kiểm tra bản đã thay đổi').click()
      await accountant.waitForURL('**/commitments/handoffs?id='+handoffId)
      assert.equal(await accountant.getByRole('button',{name:'Duyệt bản bổ sung',exact:true}).count(),0)
    },
    async review({ handoffId }) {
      await compareRoutes({
        page:accountant, viewport:{width:390,height:844},
        legacy:[[accountant,'Cam kết'],[accountant,'Hồ sơ Kế toán'],[accountant,'INV-8713 · PO-9422']],
        action:'Xem và duyệt bản bổ sung',
        expect:'/commitments/handoffs?id='+handoffId,
        screenshot:'17-inbox-ke-toan-duyet-lai-mobile',
      })
      record('The task switches from buyer to accountant. A newer source removes the stale approve action. Exact resubmitted review opens in one click versus three from Inbox, with delegated rather than mailbox access.',true)
    },
    async closed() {
      for (const actor of [buyer,accountant,outsider]) assert.deepEqual(await read(actor),[])
      await accountant.goto(app+'/inbox')
      await accountant.getByRole('region',{name:'Cam kết cần chú ý',exact:true}).waitFor()
      await board(accountant).waitFor({state:'hidden'})
      record('After one confirmed approval the exception exits both Inbox queues after reload. The linked approval and source remain in the ledger history.',true)
    },
  }
}
