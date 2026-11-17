import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import {existsSync,mkdirSync,renameSync,rmSync,createReadStream} from 'node:fs'
import {resolve} from 'node:path'

// Fixed, reusable repo-local cache. No copies of the checkout and no /tmp data.
const root=resolve('node_modules/.cache/inboxai-living-model')
const model=root+'/qwen3-4b.gguf',archive=root+'/llama.tar.gz',runtime=root+'/llama-b12242'
const modelHash='85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9'
const runtimeHash='d58f23da84befb84b7d07590e7fd18ea68a3f1df59f9808b52370255aa60f20b'
assert.equal(process.platform,'darwin','This pinned runtime is for macOS arm64 only')
assert.equal(process.arch,'arm64','This pinned runtime is for macOS arm64 only')
const free=Number(execFileSync('df',['-Pk','/'],{encoding:'utf8'}).trim().split('\n').at(-1).split(/\s+/)[3])
assert.ok(free>=10*1024*1024,'Less than 10 GiB free; refusing model download/start')
mkdirSync(root,{recursive:true})
async function hash(path){const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);return digest.digest('hex')}
async function obtain(path,url,expected) {
  if(!existsSync(path)) {
    const part=path+'.part'
    try {execFileSync('curl',['-fL','--retry','2','--max-time','900',url,'-o',part],{stdio:'inherit',timeout:930_000});assert.equal(await hash(part),expected,'Downloaded checksum mismatch');renameSync(part,path)}
    finally {if(existsSync(part))rmSync(part)}
  }
  assert.equal(await hash(path),expected,'Cached artifact checksum mismatch')
}
await obtain(model,'https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:'+modelHash,modelHash)
await obtain(archive,'https://github.com/ggml-org/llama.cpp/releases/download/b12242/llama-b12242-bin-macos-arm64.tar.gz',runtimeHash)
if(!existsSync(runtime+'/llama-server'))execFileSync('tar',['-xzf',archive,'-C',root])
if(process.argv.includes('--prepare-only'))console.log('Verified local model cache:',root)
else {
  const child=spawn(runtime+'/llama-server',['--model',model,'--alias','qwen3-4b-living','--host','127.0.0.1','--port','57340',
    '--ctx-size','8192','--parallel','1','--n-gpu-layers','99','--reasoning','off','--no-context-shift'],{stdio:'inherit'})
  const stop=()=>child.kill('SIGTERM');process.once('SIGTERM',stop);process.once('SIGINT',stop)
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code??0;resolve()})})
}
