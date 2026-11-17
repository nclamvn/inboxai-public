import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const env=Object.fromEntries(['PATH','HOME','LANG','TMPDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))
const free=Number(execFileSync('df',['-Pk','/'],{encoding:'utf8'}).trim().split('\n').at(-1).split(/\s+/)[3])
assert.ok(free>=10*1024*1024,'Cần ít nhất 10 GiB trống trước khi dựng bản thử.')
assert.ok(['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local'].every(path=>!existsSync(path)),
  'Bản thử chỉ chạy khi checkout không có tệp .env của môi trường khác.')
for(const port of [55300,55321,55999,55400,55825,57343]) {
  await new Promise((resolve,reject)=>{
    const socket=createServer()
    socket.once('error',()=>reject(new Error('Cổng '+port+' đang có phiên khác sử dụng. Giữ nguyên phiên đó và dừng nó trước khi mở bản thử mới.')))
    socket.listen(port,'127.0.0.1',()=>socket.close(resolve))
  })
}
const context=execFileSync('docker',['context','show'],{env,encoding:'utf8'}).trim()
const endpoint=execFileSync('docker',['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'],{env,encoding:'utf8'}).trim()
assert.match(endpoint,/^unix:\/\//,'Chỉ dùng Docker trên máy local.')
const docker=(args,options={})=>execFileSync('docker',['--context',context,...args],{env,encoding:'utf8',timeout:120_000,...options})
function ready(){try{docker(['info','--format','{{.ServerVersion}}'],{stdio:'ignore',timeout:3000});return true}catch{return false}}
if(!ready()) {
  if(process.platform!=='darwin') throw new Error('Khởi động Docker local rồi chạy lại npm run preview:local.')
  execFileSync('open',['-a','Docker'],{env})
  console.log('Đang khởi động Docker local…')
  const until=Date.now()+90_000
  while(!ready()&&Date.now()<until) await delay(1000)
  assert.ok(ready(),'Docker chưa sẵn sàng sau 90 giây. Kiểm tra ứng dụng Docker rồi chạy lại.')
}
const compose=['compose','-f','tests/local-auth/compose.yml']
const images=docker([...compose,'config','--images']).trim().split('\n')
const missing=images.some(name=>{try{docker(['image','inspect',name],{stdio:'ignore'});return false}catch{return true}})
if(missing) docker([...compose,'pull'],{stdio:'inherit'})
const child=spawn(process.execPath,['--import','tsx','--conditions=react-server','scripts/test-local-auth.mjs','--pilot-preview'],{env,stdio:'inherit'})
const stop=()=>child.kill('SIGTERM')
process.once('SIGINT',stop);process.once('SIGTERM',stop)
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{
  process.exitCode=signal?0:code??1;resolve()
})})
process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop)
