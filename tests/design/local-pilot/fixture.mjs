import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../../local-auth/vault.mjs'
import { setupPurchase } from '../purchase-dues.mjs'

export const pilotCase = { po:'PO-81724', original:'INV-41724', corrected:'INV-42724',
  supplier:'lan.nha-cung-cap@example.test', warehouse:'kho@example.test',
  reviewer:'an.ke-toan@example.test', reason:'Cần hóa đơn đính chính có hạn thanh toán và mã hóa đơn được thay thế.' }
export const button = (page,name) => page.getByRole('button',{name,exact:true})
export async function signIn(browser,app,email,password,viewport={width:1440,height:960}) {
  const context = await browser.newContext({locale:'vi-VN',viewport,serviceWorkers:'block',reducedMotion:'reduce'})
  await context.addInitScript(()=>localStorage.setItem('inboxai_onboarding_seen','true'))
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.goto(app+'/login')
  await page.getByLabel('Email',{exact:true}).fill(email)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  await button(page,'Đăng nhập').click()
  await page.waitForURL('**/inbox')
  return page
}

export async function seedLocalPilot({app,base,email,previousEmail,password,userId,admin,appFetch,googleProvider,sql}) {
  const {po,original,corrected,supplier,warehouse,reviewer:reviewerEmail,reason} = pilotCase
  const due = new Date(Date.now()+6*86_400_000).toISOString().slice(0,10)
  const oldDue = new Date(Date.now()+3*86_400_000).toISOString().slice(0,10)
  const vault = new CredentialVault(admin,parseKeyring(vaultKeys,'local1'))
  const accounts = {}
  for (const department of ['mua-hang','ky-thuat']) {
    const address = department+'@example.test'
    const mailbox = googleProvider.registerMailbox(address,true,true)
    const id = randomUUID()
    await vault.write({userId,accountId:id},{kind:'google',accessToken:mailbox.tokens.access_token,
      refreshToken:mailbox.tokens.refresh_token,expiresAt:new Date(Date.now()+3_600_000).toISOString(),
      scope:mailbox.tokens.scope,googleSubject:address,sendDisabled:false},0,
    {email_address:address,display_name:department==='mua-hang'?'Mua hàng':'Điều phối kho',provider:'gmail'})
    accounts[department] = {...mailbox,id,address}
  }
  sql('UPDATE public.registration_policy SET enabled=true')
  let reviewerId
  try {
    const result = await admin.auth.admin.createUser({email:reviewerEmail,password,email_confirm:true,user_metadata:{full_name:'Đỗ An · Kế toán'}})
    assert.equal(result.error,null)
    reviewerId = result.data.user.id
  } finally { sql('UPDATE public.registration_policy SET enabled=false') }
  await admin.from('whitelist').upsert([{email:reviewerEmail,is_active:true},{email:previousEmail,is_active:true}],{onConflict:'email'}).throwOnError()
  async function request(path,init,status=200) {
    const response = await appFetch(path,init)
    const result = await response.json()
    assert.equal(response.status,status,path+' '+JSON.stringify(result))
    return result
  }
  const sync = () => request('/api/source-accounts/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{"refresh":true}'})
  async function deliver(uid,department,from,age,subject,body,attachments=[],reference=po,extra={}) {
    const account = accounts[from===warehouse ? 'ky-thuat' : department]
    if (!account.box.messages.has(uid)) account.deliver([{id:uid,threadId:department+'-'+reference,
      messageId:'<'+uid+'@example.test>',from,at:new Date(Date.now()-age*86_400_000).toISOString(),
      subject:'['+reference+'] '+subject,body,attachments,...extra}])
    await sync()
    const found = await admin.from('emails').select('id').eq('user_id',userId).eq('source_account_id',account.id).eq('original_uid',uid).single()
    assert.equal(found.error,null)
    return found.data.id
  }
  const browser = await chromium.launch({channel:'chrome',proxy:{server:'http://127.0.0.1:1',bypass:'127.0.0.1'}})
  let setup
  const invoice = 'po,invoice,replaces,line,quantity,unit,unit_price,currency'
  try {
    const page = await signIn(browser,app,email,password)
    const reviewer = await signIn(browser,app,reviewerEmail,password)
    async function fileAction(id,name,label,kind='Bảng giá hoặc hóa đơn') {
      await page.goto(app+'/inbox?email='+id)
      await page.getByRole('link',{name:kind+' · '+name,exact:true}).click()
      await button(page,label).click()
      await page.getByRole('status').filter({hasText:kind==='Đối soát CSV'?'Đã ghi phiếu vào sổ':'Đã ghi nhận chứng từ.'}).waitFor()
    }
    async function assign() {
      await page.getByLabel('Email tài khoản Kế toán',{exact:true}).fill(reviewerEmail)
      await button(page,'Bàn giao hồ sơ').click()
    }
    setup = await setupPurchase({app,page,reviewer,request,deliver,accounts,fileAction,assign,
      invoice,receipts:'po,document,corrects,line,quantity,unit',paymentDue:due,supplier,warehouse,
      reference:po,number:original})
    await reviewer.goto(app+'/commitments/handoffs?id='+setup.handoffId)
    await button(reviewer,'Yêu cầu bổ sung chứng từ').click()
    await reviewer.getByLabel('Chứng từ cần bổ sung').fill(reason)
    await button(reviewer,'Giao yêu cầu cho Mua hàng').click()
    await reviewer.getByRole('status').filter({hasText:'Đã giao yêu cầu bổ sung cho Mua hàng.'}).waitFor()
  } finally { await browser.close() }

  const searchSources = []
  searchSources.push(await deliver('pilot-due-a','mua-hang',supplier,2,'Lịch hồ sơ',
    'Hạn thanh toán: '+oldDue+'.\nTổng tiền hóa đơn: 60.000 VND.'))
  searchSources.push(await deliver('pilot-due-b','ky-thuat','dieu-phoi@example.test',1,'Đối chiếu hồ sơ',
    'Hạn thanh toán: '+due+'.\nTổng tiền hóa đơn: 60.000 VND.\nCần nhà cung cấp xác nhận bằng chứng từ.'))
  for (let index=0;index<104;index++) {
    const account = accounts[index%2 ? 'ky-thuat':'mua-hang']
    account.deliver([{id:'pilot-background-'+index,from:index%3?'newsletter@example.test':'offers@example.test',
      subject:(index%3?'Bản tin thiết bị ':'Ưu đãi thiết bị ')+index,body:'Thông tin tham khảo, không có yêu cầu xử lý.',
      at:new Date(Date.now()-(index+10)*3_600_000).toISOString()}])
  }
  // Sync commits bounded pages. Drain the fixture backlog through the actual
  // checkpoint API; seeing a provider delivery is not proof it reached the DB.
  let backgroundCount=0
  for(let attempt=0;attempt<6;attempt++) {
    await sync()
    const result=await admin.from('emails').select('id',{head:true,count:'exact'})
      .eq('user_id',userId).like('original_uid','pilot-background-%')
    assert.equal(result.error,null)
    backgroundCount=result.count??0
    if(backgroundCount===104) break
  }
  assert.equal(backgroundCount,104,'All background Gmail pages must reach PostgreSQL before the trial is ready')
  const total=await admin.from('emails').select('id',{head:true,count:'exact'}).eq('user_id',userId).eq('sync_namespace','gmail')
  assert.equal(total.error,null)
  const mailCount=total.count
  await admin.from('emails').update({category:'newsletter'}).eq('user_id',userId).eq('from_address','newsletter@example.test').throwOnError()
  await admin.from('emails').update({category:'promotion'}).eq('user_id',userId).eq('from_address','offers@example.test').throwOnError()
  await admin.from('emails').update({category:'work',needs_reply:true}).eq('user_id',userId).in('id',searchSources).throwOnError()
  const state = async () => {
    const evidence = await request('/api/commitments/evidence-requests?case='+setup.handoffId)
    const payment = await request('/api/commitments/payment?id='+setup.orderId)
    const assignment = await request('/api/commitments/handoffs?'+new URLSearchParams({commitment:setup.orderId,invoice:payment.invoice.id}))
    return {evidence,payment,handoff:assignment.pending?.id??setup.handoffId,sent:googleProvider.calls.sent.length}
  }
  async function inject(kind) {
    const current = await state()
    if (current.evidence.stage!=='buyer' || current.evidence.request?.state!=='accepted') throw new Error('Gửi yêu cầu đã duyệt trước khi nạp hồi đáp.')
    const parent = [...googleProvider.calls.sent].reverse().find(item=>item.to.includes(supplier))
    if (!parent) throw new Error('Chưa có lượt gửi để trả lời.')
    const bytes = [invoice+(kind==='corrected'?',payment_due':''),
      [po,corrected,original,'B',30,'bộ',2000,'VND',...(kind==='corrected'?[due]:[])].join(','),''].join('\n')
    return deliver('pilot-'+kind,'mua-hang',supplier,0,'Re: Chứng từ bổ sung',
      kind==='corrected'?'Đã xác minh hạn thanh toán: '+due+'.':'Tôi gửi trước hóa đơn, hạn thanh toán chưa xác minh.',
      [{filename:'hoa-don.csv',contentType:'text/csv',data:Buffer.from(bytes).toString('base64')}],po,
      {inReplyTo:parent.messageId,threadId:parent.threadId})
  }
  // Provider rewind is fixture-only. Production receipts and undo are untouched.
  const snapshots = Object.values(accounts).map(account=>({account,messages:structuredClone(account.box.messages),history:[...account.box.history]}))
  function rewindProvider() {
    for (const {account,messages,history} of snapshots) {
      account.box.messages=structuredClone(messages); account.box.history=[...history]; account.box.online=true
      delete account.box.dropSendAcknowledgement
    }
    googleProvider.calls.sent.splice(0); googleProvider.calls.sendAttempts=0
  }
  return { ...pilotCase, ...setup, due,oldDue,accounts,searchSources,reviewerId,state,inject,request,sync,
    rewindProvider, app,base,email,password,mailCount }
}
