import { z } from 'zod'
import { livingOutput,type LivingMail } from './living-contracts'
import { livingRules,livingPromptVersion } from './living-interpret'

export const localLivingModel='qwen3-4b-living'
export const livingModelId=localLivingModel+':85e4a5b7:'+livingPromptVersion+':guard-v2'
export const livingEndpoint='http://127.0.0.1:57340'
let active=false
export async function livingChat(messages:{role:string;content:string}[],schema:Record<string,unknown>,maxTokens=1800) {
  const start=performance.now()
  const response=await fetch(livingEndpoint+'/v1/chat/completions',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(60_000),headers:{'content-type':'application/json'},body:JSON.stringify({
      model:localLivingModel,messages,temperature:0,seed:82,max_tokens:maxTokens,cache_prompt:false,
      response_format:{type:'json_schema',json_schema:{name:'commitments',strict:true,schema}},
    })})
  if(!response.ok)throw new Error('Local model unavailable')
  const text=await response.text()
  if(text.length>128000)throw new Error('Model response too large')
  const result=JSON.parse(text)
  if(result.model!==localLivingModel||result.choices?.[0]?.finish_reason!=='stop')throw new Error('Model did not complete within its budget')
  return {output:JSON.parse(result.choices[0].message.content),metrics:{elapsedMs:Math.round(performance.now()-start),
    calls:1,inputTokens:result.usage?.prompt_tokens??0,outputTokens:result.usage?.completion_tokens??0}}
}
export async function interpretLivingMail(messages:LivingMail[]) {
  if(active)throw new Error('Local model busy')
  active=true
  try {
    const aliases=new Map(messages.map((row,index)=>[row.id,'m'+(index+1)]))
    const input=messages.map(row=>({...row,id:aliases.get(row.id),fingerprint:undefined}))
    const result=await livingChat([{role:'system',content:livingRules},{role:'user',content:JSON.stringify(input)}],z.toJSONSchema(livingOutput))
    const events=livingOutput.parse(result.output).events
    const ids=new Map([...aliases].map(([id,alias])=>[alias,id]))
    return {...result,events:events.map(event=>({...event,source:ids.get(event.source)??event.source,origin:ids.get(event.origin)??event.origin}))}
  } finally {active=false}
}
