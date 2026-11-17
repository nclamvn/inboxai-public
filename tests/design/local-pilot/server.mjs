import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { seedLocalPilot } from './fixture.mjs'
import { readPilotVersion } from './version.mjs'

const require=createRequire(import.meta.url)
export async function startLocalPilot(options) {
  const {app,version,restartNext,docker,waitFor,output} = options
  const seed=await seedLocalPilot(options)
  const host='127.0.0.1:57343', origin='http://'+host, token=randomBytes(24).toString('base64url')
  const assets=new Map([
    ['/', ['text/html; charset=utf-8',readFileSync(new URL('./index.html',import.meta.url))]],
    ['/pilot.js',['text/javascript; charset=utf-8',readFileSync(new URL('./pilot.js',import.meta.url))]],
    ['/pilot.css',['text/css; charset=utf-8',readFileSync(new URL('./pilot.css',import.meta.url))]],
    ['/day.css',['text/css; charset=utf-8',readFileSync(new URL('../day-preview/day.css',import.meta.url))]],
    ['/inter-vi.woff2',['font/woff2',readFileSync(require.resolve('@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2'))]],
    ['/inter-latin.woff2',['font/woff2',readFileSync(require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))]],
  ])
  const backup=docker(['exec','-T','db','pg_dump','-U','postgres','-d','inboxai_security_test','--format=custom'],{encoding:'buffer'})
  assert.equal(backup.subarray(0,5).toString(),'PGDMP')
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
  const checksum=sha(backup), archive=output+'/initial.dump'
  writeFileSync(archive,backup,{mode:0o600})
  let busy=false, generation=1
  const config=()=>({app,version,token,po:seed.po,due:seed.due,original:seed.original,corrected:seed.corrected,mailCount:seed.mailCount,
    buyer:seed.email,reviewer:seed.reviewer,password:seed.password,
    ask:app+'/search?'+new URLSearchParams({view:'answer',q:'Hạn thanh toán và tổng tiền hóa đơn của '+seed.po+'?'}),
    ledger:app+'/commitments?group=waiting&id='+seed.orderId,operator:app+'/operator'})
  const readState=async()=>{
    const current=await seed.state()
    return {generation,busy,stage:current.evidence.stage,request:current.evidence.request,sent:current.sent,
      invoice:current.payment.invoice.number,decision:current.payment.decisionId,
      handoff:app+'/commitments/handoffs?id='+current.handoff,
      missing:seed.accounts['mua-hang'].box.messages.has('pilot-missing'),
      corrected:seed.accounts['mua-hang'].box.messages.has('pilot-corrected')}
  }
  async function reset() {
    const bytes=readFileSync(archive)
    assert.equal(sha(bytes),checksum,'Initial snapshot checksum mismatch')
    const name=JSON.parse(docker(['config','--format','json'])).name
    assert.ok(['inboxai-local-pilot','inboxai-m6d-e2e'].includes(name),'Reset is restricted to the synthetic fixture')
    await restartNext(async()=>{
      docker(['stop','auth','rest'])
      docker(['exec','-T','db','dropdb','-U','postgres','--force','inboxai_security_test'])
      docker(['exec','-T','db','createdb','-U','postgres','--template=template0','inboxai_security_test'])
      docker(['exec','-T','db','pg_restore','-U','postgres','--single-transaction','--exit-on-error','-d','inboxai_security_test'],{input:bytes})
      seed.rewindProvider()
      docker(['start','auth','rest'])
      const port=new URL(options.base).port==='55321'?55999:57999
      await waitFor('http://127.0.0.1:'+port+'/health')
    })
    generation++
  }
  const server=createServer(async(req,res)=>{
    const write=(status,type,body)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(body)}
    const json=(status,body)=>write(status,'application/json; charset=utf-8',JSON.stringify(body))
    if(req.headers.host!==host) return json(403,{error:'Chỉ mở từ địa chỉ local của bản thử.'})
    try {
      if(req.method==='GET') {
        if(assets.has(req.url)) return write(200,...assets.get(req.url))
        if(req.url==='/config') return json(200,config())
        if(req.url==='/state') return busy ? json(503,{error:'Ứng dụng đang xử lý điều khiển local.'}) : json(200,await readState())
        if(req.url==='/version') return json(200,{built:version,current:readPilotVersion()})
      }
      if(req.method!=='POST'||!['/missing','/corrected','/restart','/reset','/lose-receipt'].includes(req.url)) return json(404,{error:'Không có thao tác này.'})
      if(req.headers.origin!==origin||req.headers['x-demo-token']!==token) return json(403,{error:'Mở điều khiển từ trang dùng thử.'})
      if(busy) return json(409,{error:'Đang xử lý. Chờ thao tác hiện tại kết thúc.'})
      let body=''
      for await(const chunk of req) {body+=chunk;if(body.length>1024)return json(413,{error:'Yêu cầu quá dài.'})}
      if(req.url==='/reset' && JSON.parse(body||'{}').confirm!=='ĐẶT LẠI') return json(400,{error:'Nhập ĐẶT LẠI để xác nhận khôi phục dữ liệu giả lập.'})
      busy=true
      try {
        if(req.url==='/restart') await restartNext()
        else if(req.url==='/reset') await reset()
        else if(req.url==='/lose-receipt') seed.accounts['mua-hang'].box.dropSendAcknowledgement=true
        else await seed.inject(req.url.slice(1))
        return json(200,await readState())
      } finally {busy=false}
    } catch(error) {
      console.error('Local pilot control:',error.message)
      return json(409,{error:'Chưa hoàn tất thao tác. Kiểm tra trạng thái rồi thử lại. Không có email thật được gửi.'})
    }
  })
  await new Promise((resolve,reject)=>server.once('error',reject).listen(57343,'127.0.0.1',resolve))
  return {origin,seed,version,config:config(),readState,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}
}
